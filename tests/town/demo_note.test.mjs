// The town sites' demo notes must say what the code does: bookings survive a refresh,
// because they are saved in this browser's storage.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { SavedBookings } from "../../apps/town/guesthouse/js/saved-bookings.js";
import { SavedReservations } from "../../apps/town/harbor_tours/js/saved-reservations.js";

const ROOT = new URL("../../", import.meta.url);

function memoryStorage() {
  const items = new Map();
  return { getItem: (k) => (items.has(k) ? items.get(k) : null), setItem: (k, v) => items.set(k, String(v)) };
}

for (const [site, Book] of [["guesthouse", SavedBookings], ["harbor_tours", SavedReservations]]) {
  test(`${site}: saved records survive a reload, and the demo note says so`, () => {
    const storage = memoryStorage();
    Book.save(storage, [{ code: "XX-TEST" }]);
    assert.deepEqual(Book.load(storage).map((r) => r.code), ["XX-TEST"], "A fresh load (a refresh) finds the saved record.");
    const html = readFileSync(new URL(`apps/town/${site}/index.html`, ROOT), "utf8");
    const note = html.match(/<p id="demo-note"[^>]*>([\s\S]*?)<\/p>/)[1].replace(/\s+/g, " ");
    assert.doesNotMatch(note, /until you refresh/i);
    assert.match(note, /saved only in this browser/i);
    assert.match(note, /Nothing is reserved or charged/);
  });
}
