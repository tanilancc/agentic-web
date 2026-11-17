// Tests for the itinerary and its conflict checks.

import assert from "node:assert/strict";
import test from "node:test";
import { Itinerary } from "../js/itinerary.js";

const NOW = "2026-12-01T09:00";
const stay = (extra = {}) => ({ partner: "guesthouse", kind: "stay", title: "Garden Room", start: "2026-12-10T15:00", end: "2026-12-12T11:00", partySize: 2, totalCents: 36000, commit: { action: "place_booking", args: {} }, ...extra });
const trip = (extra = {}) => ({ partner: "harbor_tours", kind: "trip", title: "Seal Rocks Cruise", start: "2026-12-11T10:00", end: "2026-12-11T11:30", partySize: 2, totalCents: 7600, commit: { action: "reserve_trip", args: {} }, ...extra });

test("items are added with an id and the planned status, and total up", () => {
  const plan = new Itinerary();
  const a = plan.add(stay());
  const b = plan.add(trip());
  assert.notEqual(a, b);
  assert.deepEqual(plan.list().map((i) => i.status), ["planned", "planned"]);
  assert.equal(plan.total(), 43600);
  plan.remove(a);
  assert.equal(plan.list().length, 1);
});

test("a clean plan has no conflicts", () => {
  const plan = new Itinerary();
  plan.add(stay());
  plan.add(trip());
  assert.deepEqual(plan.conflicts(NOW), []);
});

test("two trips that overlap", () => {
  const plan = new Itinerary();
  const a = plan.add(trip());
  const b = plan.add(trip({ title: "Harbor Loop", start: "2026-12-11T11:00", end: "2026-12-11T12:00" }));
  const found = plan.conflicts(NOW);
  assert.equal(found.length, 1);
  assert.deepEqual(found[0].ids, [a, b]);
  assert.match(found[0].message, /Seal Rocks Cruise and Harbor Loop overlap/);
});

test("back-to-back trips do not overlap", () => {
  const plan = new Itinerary();
  plan.add(trip());
  plan.add(trip({ title: "Harbor Loop", start: "2026-12-11T11:30", end: "2026-12-11T12:30" }));
  assert.deepEqual(plan.conflicts(NOW), []);
});

test("a trip on a day the stay does not cover", () => {
  const plan = new Itinerary();
  plan.add(stay());
  plan.add(trip({ start: "2026-12-14T10:00", end: "2026-12-14T11:30" }));
  assert.match(plan.conflicts(NOW)[0].message, /Seal Rocks Cruise on 2026-12-14 is not during your stay/);
});

test("a trip with more people than the stay", () => {
  const plan = new Itinerary();
  plan.add(stay());
  plan.add(trip({ partySize: 4 }));
  assert.match(plan.conflicts(NOW)[0].message, /more people than the stay \(4 and 2\)/);
});

test("a leg in the past", () => {
  const plan = new Itinerary();
  plan.add(trip({ start: "2026-11-30T10:00", end: "2026-11-30T11:30" }));
  assert.match(plan.conflicts(NOW)[0].message, /Seal Rocks Cruise is in the past/);
});

test("refused and declined legs are left out of the checks and the total", () => {
  const plan = new Itinerary();
  plan.add(trip());
  const b = plan.add(trip({ title: "Harbor Loop" }));
  plan.update(b, { status: "refused", reason: "Full." });
  assert.deepEqual(plan.conflicts(NOW), []);
  assert.equal(plan.total(), 7600);
});

test("a plan survives a round trip through JSON", () => {
  const plan = new Itinerary();
  plan.add(stay());
  const copy = Itinerary.fromJSON(JSON.parse(JSON.stringify(plan)));
  assert.deepEqual(copy.list(), plan.list());
  assert.notEqual(copy.add(trip()), plan.list()[0].id);
});

test("JSON of the wrong shape gives an empty plan", () => {
  assert.deepEqual(Itinerary.fromJSON(null).list(), []);
  assert.deepEqual(Itinerary.fromJSON({ items: "x" }).list(), []);
  assert.deepEqual(Itinerary.fromJSON({ items: [null, { kind: "boat" }] }).list(), []);
});

test("a leg left mid-booking by a closed page comes back as unknown, never as planned", () => {
  const plan = new Itinerary();
  const id = plan.add(trip());
  plan.update(id, { status: "booking" });
  const again = Itinerary.fromJSON(JSON.parse(JSON.stringify(plan)));
  assert.equal(again.list()[0].status, "unknown");
  assert.match(again.list()[0].reason, /may have been booked/);
});

test("clearing the plan keeps booked and uncertain legs", () => {
  const plan = new Itinerary();
  const a = plan.add(trip());
  const b = plan.add(trip({ title: "Harbor Loop" }));
  plan.add(trip({ title: "Sea Wall Walk" }));
  plan.update(a, { status: "booked", code: "HT-1234" });
  plan.update(b, { status: "unknown" });
  plan.clearPlanned();
  assert.deepEqual(plan.list().map((l) => l.status).sort(), ["booked", "unknown"]);
});
