// Reservations are kept in the browser's storage, so one made in the partner desk's
// popup is still there for the tour site's own page.

import assert from "node:assert/strict";
import test from "node:test";
import { Calendar } from "../js/calendar.js";
import { SavedReservations } from "../js/saved-reservations.js";
import { TourData } from "../js/tour-data.js";
import { TripBook } from "../js/trip-book.js";

function memoryStorage() {
  const items = new Map();
  return { getItem: (k) => (items.has(k) ? items.get(k) : null), setItem: (k, v) => items.set(k, String(v)) };
}

/**
 * A departure of the Seal Rocks Cruise at least 20 days ahead.
 */
function trip() {
  const tour = TourData.findById(TourData.TOURS, "seal-rocks");
  return { tourId: tour.id, date: TripBook.firstRun(tour, Calendar.addDays(Calendar.today(), 20)), time: tour.times[0], adults: 2, children: 0, under4s: 0 };
}
const contact = { firstName: "Ana", lastName: "Silva", email: "ana@example.com", phone: "0123 456 789" };

test("a reservation survives a new book on the same storage", () => {
  const storage = memoryStorage();
  const made = new TripBook(storage).reserve([trip()], contact);
  assert.ok(made.reservation, JSON.stringify(made.errors));
  const again = new TripBook(storage);
  assert.ok(again.reservations.some((r) => r.code === made.reservation.code));
  const t = trip();
  assert.equal(again.placesTaken(t.tourId, t.date, t.time), new TripBook().placesTaken(t.tourId, t.date, t.time) + 2);
});

test("a cancellation is kept", () => {
  const storage = memoryStorage();
  const book = new TripBook(storage);
  const made = book.reserve([trip()], contact).reservation;
  book.cancel(made.code, "Silva");
  assert.equal(new TripBook(storage).reservations.find((r) => r.code === made.code).status, "cancelled");
});

test("corrupt saved data and a throwing storage are ignored", () => {
  const storage = memoryStorage();
  storage.setItem(SavedReservations.KEY, "[[[");
  assert.deepEqual(SavedReservations.load(storage), []);
  const broken = { getItem() { throw new Error("x"); }, setItem() { throw new Error("x"); } };
  assert.ok(new TripBook(broken).reserve([trip()], contact).reservation);
});
