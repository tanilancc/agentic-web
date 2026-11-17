// Tests for the pricing every market vendor uses. A vendor's quote is the only authority
// on its prices, so these rules decide every total Quorum shows.

import assert from "node:assert/strict";
import test from "node:test";
import { quote } from "../../apps/shared/vendor-pricing.js";

const CATALOG = {
  id: "test", name: "Test Kitchen",
  items: [
    { id: "marg", name: "Margherita", priceCents: 1200, serves: 2, diets: ["vegetarian"] },
    { id: "vbowl", name: "Vegan bowl", priceCents: 900, serves: 1, diets: ["vegan", "gluten-free"] },
    { id: "ham", name: "Ham", priceCents: 1400, serves: 2, diets: [] },
  ],
  minOrderCents: 2000,
  delivery: { feeCents: 500, freeOverCents: 10000, leadMinutes: 120 },
  pickup: { discountPct: 10 },
  hours: { from: "11:00", to: "21:00" },
  slotMinutes: 30,
  tiers: [{ minItems: 5, discountPct: 5 }, { minItems: 10, discountPct: 10 }],
  offPeak: { from: "15:00", to: "17:00", discountPct: 15 },
};
const NOW = "2026-12-01T09:00";
const order = (extra = {}) => ({ date: "2026-12-10", time: "18:00", fulfilment: "delivery", items: [{ id: "marg", qty: 2 }], ...extra });

test("a plain delivery: lines, subtotal, fee and servings", () => {
  const q = quote(CATALOG, order(), NOW);
  assert.equal(q.ok, true);
  assert.deepEqual(q.lines, [{ id: "marg", name: "Margherita", qty: 2, unitCents: 1200, cents: 2400 }]);
  assert.equal(q.subtotalCents, 2400);
  assert.deepEqual(q.discounts, []);
  assert.equal(q.feeCents, 500);
  assert.equal(q.totalCents, 2900);
  assert.equal(q.servings, 4);
  assert.deepEqual(q.dietServings, { vegetarian: 4, vegan: 0, "gluten-free": 0 });
});

test("vegan items count as vegetarian too", () => {
  const q = quote(CATALOG, order({ items: [{ id: "vbowl", qty: 3 }] }), NOW);
  assert.deepEqual(q.dietServings, { vegetarian: 3, vegan: 3, "gluten-free": 3 });
});

test("the largest volume tier applies", () => {
  const five = quote(CATALOG, order({ items: [{ id: "marg", qty: 5 }] }), NOW);
  assert.deepEqual(five.discounts, [{ label: "5+ items", cents: 300 }]);
  const ten = quote(CATALOG, order({ items: [{ id: "marg", qty: 10 }] }), NOW);
  assert.deepEqual(ten.discounts, [{ label: "10+ items", cents: 1200 }]);
  assert.equal(ten.feeCents, 0);
  assert.equal(ten.totalCents, 12000 - 1200);
});

test("discounts apply in order on the running total: volume, off-peak, pickup", () => {
  const q = quote(CATALOG, order({ time: "15:30", fulfilment: "pickup", items: [{ id: "marg", qty: 10 }] }), NOW);
  // 12000 - 10% = 10800; - 15% = 9180; - 10% = 8262.
  assert.deepEqual(q.discounts.map((d) => d.cents), [1200, 1620, 918]);
  assert.equal(q.feeCents, 0);
  assert.equal(q.totalCents, 8262);
});

test("free delivery is judged after discounts", () => {
  const q = quote(CATALOG, order({ items: [{ id: "marg", qty: 9 }] }), NOW);
  // 10800 - 5% = 10260, still over 10000.
  assert.equal(q.feeCents, 0);
  const just = quote(CATALOG, order({ items: [{ id: "ham", qty: 7 }] }), NOW);
  // 9800 - 5% = 9310: under 10000, so the fee applies.
  assert.equal(just.feeCents, 500);
});

for (const [label, change, pattern] of [
  ["outside opening hours", { time: "22:00" }, /between 11:00 and 21:00/],
  ["a time between slots", { time: "18:10" }, /every 30 minutes/],
  ["under the minimum order", { items: [{ id: "vbowl", qty: 1 }] }, /minimum order is \$20\.00/],
  ["an unknown item", { items: [{ id: "sushi", qty: 1 }] }, /sushi/],
  ["a quantity of 0", { items: [{ id: "marg", qty: 0 }] }, /quantity/],
  ["no items", { items: [] }, /no items/i],
  ["a malformed date", { date: "10/12/2026" }, /date/],
  ["an unknown fulfilment", { fulfilment: "drone" }, /delivery or pickup/],
]) {
  test(`refuses ${label}`, () => {
    const q = quote(CATALOG, order(change), NOW);
    assert.equal(q.ok, false);
    assert.match(q.reason, pattern);
  });
}

test("refuses an order too soon for the kitchen", () => {
  // Open at 11:00, but 11:30 is only 90 minutes after 10:00.
  const q = quote(CATALOG, order({ date: "2026-12-01", time: "11:30" }), "2026-12-01T10:00");
  assert.equal(q.ok, false);
  assert.match(q.reason, /at least 120 minutes/);
  assert.equal(quote(CATALOG, order({ date: "2026-12-01", time: "12:00" }), "2026-12-01T10:00").ok, true);
});

test("the same item twice is added together", () => {
  const q = quote(CATALOG, order({ items: [{ id: "marg", qty: 1 }, { id: "marg", qty: 1 }] }), NOW);
  assert.equal(q.lines.length, 1);
  assert.equal(q.lines[0].qty, 2);
});
