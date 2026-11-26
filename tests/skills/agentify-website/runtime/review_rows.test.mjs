// The confirmation window shows a request as labelled rows a visitor can read, not as JSON.
import assert from "node:assert/strict";
import test from "node:test";
import { actionTitle, reviewRows } from "../../../../skills/agentify-website/runtime/action-transport.js";

test("arguments become readable labels and values, with cents shown as dollars", () => {
  const rows = reviewRows({
    roomId: "lantern", checkIn: "2026-12-10", guests: 2, arrival: "7 pm to 9 pm",
    firstName: "Test", email: "test.visitor@example.com", expectedTotalCents: 31500,
    items: [{ id: "gf-platter", qty: 1 }], pickup: false,
  });
  assert.deepEqual(rows, [
    ["Room ID", "lantern"],
    ["Check in", "2026-12-10"],
    ["Guests", "2"],
    ["Arrival", "7 pm to 9 pm"],
    ["First name", "Test"],
    ["Email", "test.visitor@example.com"],
    ["Expected total", "$315.00"],
    ["Items", '[{"id":"gf-platter","qty":1}]'],
    ["Pickup", "No"],
  ]);
});

test("empty values are left out, and an action name reads as a heading", () => {
  assert.deepEqual(reviewRows({ phone: "", requests: null, note: undefined, guests: 0 }), [["Guests", "0"]]);
  assert.deepEqual(reviewRows(null), []);
  assert.equal(actionTitle("place_booking"), "Place booking");
  assert.equal(actionTitle("reserveTrip"), "Reserve trip");
});
