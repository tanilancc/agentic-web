// Tests for the award: the orders being placed, and their saved state.

import assert from "node:assert/strict";
import test from "node:test";
import { Award } from "../js/award.js";

const order = (vendor) => ({ vendor, time: "18:00", fulfilment: "delivery", items: [{ id: "x", qty: 1 }], totalCents: 1000 });

test("an award starts planned and totals its orders", () => {
  const award = new Award();
  award.start([order("a"), order("b")], "2026-12-10");
  assert.deepEqual(award.list().map((o) => o.status), ["planned", "planned"]);
  assert.equal(award.total(), 2000);
  assert.equal(award.active(), true);
});

test("an order left mid-booking comes back as unknown", () => {
  const award = new Award();
  award.start([order("a")], "2026-12-10");
  award.update(0, { status: "booking" });
  const again = Award.fromJSON(JSON.parse(JSON.stringify(award)));
  assert.equal(again.list()[0].status, "unknown");
  assert.match(again.list()[0].reason, /may have been placed/);
});

test("an award whose orders were all refused or declined is no longer active", () => {
  const award = new Award();
  award.start([order("a"), order("b")], "2026-12-10");
  award.update(0, { status: "refused" });
  award.update(1, { status: "declined" });
  assert.equal(award.active(), false);
});

test("bad saved data gives an empty award", () => {
  assert.deepEqual(Award.fromJSON(null).list(), []);
  assert.deepEqual(Award.fromJSON({ orders: [{ vendor: 5 }] }).list(), []);
});
