// Bookings are kept in the browser's storage, so a booking made in the partner desk's
// popup is still there for the guesthouse's own page.

import assert from "node:assert/strict";
import test from "node:test";
import { Calendar } from "../js/calendar.js";
import { GuesthouseData } from "../js/guesthouse-data.js";
import { ReservationBook } from "../js/reservation-book.js";
import { SavedBookings } from "../js/saved-bookings.js";

/**
 * A storage stand-in with the parts of localStorage the book uses.
 */
export function memoryStorage() {
  const items = new Map();
  return { getItem: (k) => (items.has(k) ? items.get(k) : null), setItem: (k, v) => items.set(k, String(v)), removeItem: (k) => items.delete(k), items };
}

const stay = () => ({ roomId: "garden", checkIn: Calendar.addDays(Calendar.today(), 40), checkOut: Calendar.addDays(Calendar.today(), 42), guests: 2, extras: [] });
const guest = { firstName: "Ana", lastName: "Silva", email: "ana@example.com", phone: "", arrival: GuesthouseData.ARRIVAL_TIMES[0], requests: "" };

test("a placed booking survives a new book on the same storage", () => {
  const storage = memoryStorage();
  const placed = new ReservationBook(storage).place(stay(), guest);
  assert.ok(placed.booking);
  const again = new ReservationBook(storage);
  assert.ok(again.bookings.some((b) => b.code === placed.booking.code));
  assert.equal(again.isFree("garden", stay().checkIn, stay().checkOut), false);
});

test("a cancellation is kept too, and a built-in booking is not doubled", () => {
  const storage = memoryStorage();
  const book = new ReservationBook(storage);
  const placed = book.place(stay(), guest).booking;
  book.cancel(placed.code, "Silva", 0);
  const again = new ReservationBook(storage);
  assert.equal(again.bookings.find((b) => b.code === placed.code).status, "cancelled");
  assert.equal(again.bookings.length, new ReservationBook(memoryStorage()).bookings.length + 1);
});

test("corrupt or missing saved data loads as none", () => {
  const storage = memoryStorage();
  storage.setItem(SavedBookings.KEY, "{not json");
  assert.deepEqual(SavedBookings.load(storage), []);
  storage.setItem(SavedBookings.KEY, JSON.stringify({ not: "a list" }));
  assert.deepEqual(SavedBookings.load(storage), []);
  assert.deepEqual(SavedBookings.load(null), []);
});

test("a storage that throws still books in memory", () => {
  const broken = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
  const book = new ReservationBook(broken);
  assert.ok(book.place(stay(), guest).booking);
});

test("without a storage the book works as before", () => {
  assert.ok(new ReservationBook().place(stay(), guest).booking);
});
