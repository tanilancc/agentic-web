// Tests for the mandate and the plan checker. The checker is the only thing that may
// call a plan acceptable. It counts servings itself, from the vendors' menus, and treats
// each diet group as separate people: one dish feeds one person.

import assert from "node:assert/strict";
import test from "node:test";
import { checkPlan, validateMandate } from "../js/mandate.js";

const MANDATE = { date: "2026-12-10", headcount: 12, vegetarian: 4, vegan: 2, glutenFree: 3, budgetCents: 60000, from: "17:00", to: "18:30", flexMinutes: 30, pickupAllowed: false };

/**
 * A small menu with one dish per kind of need. Each serves 1.
 */
const CATALOGS = {
  kitchen: {
    id: "kitchen",
    items: [
      { id: "plain", priceCents: 500, serves: 1, diets: [] },
      { id: "veg", priceCents: 500, serves: 1, diets: ["vegetarian"] },
      { id: "vegan", priceCents: 500, serves: 1, diets: ["vegan"] },
      { id: "gf", priceCents: 500, serves: 1, diets: ["gluten-free"] },
      { id: "gf-veg", priceCents: 500, serves: 1, diets: ["gluten-free", "vegetarian"] },
      { id: "platter", priceCents: 4000, serves: 6, diets: ["vegetarian"] },
    ],
  },
};

const order = (items, extra = {}) => ({
  vendor: "kitchen", time: "18:00", fulfilment: "delivery", items,
  quote: { ok: true, totalCents: 10000 }, ...extra,
});
const SOUND = [{ id: "vegan", qty: 2 }, { id: "veg", qty: 4 }, { id: "gf", qty: 3 }, { id: "plain", qty: 3 }];
const check = (orders, m = MANDATE) => checkPlan({ orders }, m, CATALOGS);

test("a sound mandate has no problems", () => {
  assert.deepEqual(validateMandate(MANDATE), []);
});

for (const [label, change, field] of [
  ["headcount 0", { headcount: 0 }, "headcount"],
  ["a fractional headcount", { headcount: 2.5 }, "headcount"],
  ["more dietary needs than people", { vegetarian: 8, vegan: 5 }, "vegetarian"],
  ["diet groups that add up to more than the people", { vegetarian: 5, vegan: 4, glutenFree: 4 }, "glutenFree"],
  ["a negative diet count", { vegan: -1 }, "vegan"],
  ["a window that ends before it starts", { from: "19:00", to: "18:00" }, "to"],
  ["a malformed time", { from: "7pm" }, "from"],
  ["a budget of 0", { budgetCents: 0 }, "budgetCents"],
  ["a malformed date", { date: "next friday" }, "date"],
  ["a flex of 5 hours", { flexMinutes: 300 }, "flexMinutes"],
  ["pickup that is not true or false", { pickupAllowed: "yes" }, "pickupAllowed"],
]) {
  test(`refuses ${label}`, () => {
    const problems = validateMandate({ ...MANDATE, ...change });
    assert.ok(problems.some((p) => p.field === field), JSON.stringify(problems));
    assert.ok(problems.every((p) => typeof p.reason === "string" && p.reason.length > 0));
  });
}

test("a plan that feeds every group passes, with the money to spare", () => {
  assert.deepEqual(check([order(SOUND)]), { ok: true, problems: [], totalCents: 10000, slackCents: 50000 });
});

test("servings short of the headcount", () => {
  const out = check([order([{ id: "vegan", qty: 2 }, { id: "veg", qty: 4 }, { id: "gf", qty: 3 }])]);
  assert.equal(out.ok, false);
  assert.match(out.problems.join(" "), /9 servings for 12 people: 3 short/);
});

test("vegetarian food must cover vegetarians and vegans", () => {
  const out = check([order([{ id: "vegan", qty: 2 }, { id: "veg", qty: 3 }, { id: "gf", qty: 3 }, { id: "plain", qty: 4 }])]);
  assert.match(out.problems.join(" "), /5 vegetarian servings for 6 people: 1 short/);
});

test("vegan and gluten-free shortfalls", () => {
  const out = check([order([{ id: "vegan", qty: 1 }, { id: "veg", qty: 5 }, { id: "plain", qty: 6 }])]);
  assert.match(out.problems.join(" "), /1 vegan servings for 2 people: 1 short/);
  assert.match(out.problems.join(" "), /0 gluten-free servings for 3 people: 3 short/);
});

test("one dish never counts for two people: a gluten-free vegetarian dish feeds one person", () => {
  // 6 vegetarians and 6 gluten-free people are 12 people; 6 dishes that are both feed 6.
  const m = { ...MANDATE, headcount: 12, vegetarian: 6, vegan: 0, glutenFree: 6 };
  const out = check([order([{ id: "gf-veg", qty: 6 }, { id: "plain", qty: 6 }])], m);
  assert.equal(out.ok, false);
  assert.match(out.problems.join(" "), /6 people would have nothing suitable/);
  assert.equal(check([order([{ id: "gf-veg", qty: 6 }, { id: "veg", qty: 6 }])], m).ok, true);
});

test("servings add up across orders and vendors", () => {
  const catalogs = { ...CATALOGS, other: { ...CATALOGS.kitchen, id: "other" } };
  const out = checkPlan({ orders: [order(SOUND.slice(0, 2)), order(SOUND.slice(2), { vendor: "other" })] }, MANDATE, catalogs);
  assert.equal(out.ok, true, out.problems.join(" "));
  assert.equal(out.totalCents, 20000);
});

test("the checker counts servings from the menu, never from the quote", () => {
  const out = check([order([{ id: "plain", qty: 1 }], { quote: { ok: true, totalCents: 100, servings: 999, dietServings: { vegetarian: 999, vegan: 999, "gluten-free": 999 } } })]);
  assert.equal(out.ok, false);
  assert.match(out.problems.join(" "), /1 servings for 12 people/);
});

for (const [label, quote] of [
  ["a quote that is not ok", { ok: false, reason: "no", totalCents: 100 }],
  ["a quote without ok", { totalCents: 100 }],
  ["a negative total", { ok: true, totalCents: -50000 }],
  ["a total that is text", { ok: true, totalCents: "100" }],
  ["no quote at all", undefined],
]) {
  test(`an order with ${label} never passes`, () => {
    const out = check([order(SOUND, { quote })]);
    assert.equal(out.ok, false);
    assert.match(out.problems.join(" "), /no usable quote/);
  });
}

test("an order for an item the menu does not have, or a strange quantity, never passes", () => {
  assert.match(check([order([...SOUND, { id: "sushi", qty: 1 }])]).problems.join(" "), /sushi/);
  assert.match(check([order([...SOUND, { id: "plain", qty: -3 }])]).problems.join(" "), /quantity/);
  assert.match(check([order([...SOUND, { id: "plain", qty: "3" }])]).problems.join(" "), /quantity/);
});

test("an order from a vendor whose menu is unknown never passes", () => {
  assert.match(check([order(SOUND, { vendor: "ghost" })]).problems.join(" "), /no menu/);
});

test("over budget, by how much", () => {
  const out = check([order(SOUND, { quote: { ok: true, totalCents: 61500 } })]);
  assert.equal(out.ok, false);
  assert.match(out.problems.join(" "), /\$615\.00 is \$15\.00 over the \$600\.00 budget/);
  assert.equal(out.slackCents, -1500);
});

test("times outside the window and its flexibility", () => {
  assert.equal(check([order(SOUND, { time: "16:30" })]).ok, true);
  assert.match(check([order(SOUND, { time: "16:00" })]).problems.join(" "), /16:00 is outside 16:30 to 19:00/);
});

test("pickup only when allowed", () => {
  assert.match(check([order(SOUND, { fulfilment: "pickup" })]).problems.join(" "), /pickup/);
  assert.equal(check([order(SOUND, { fulfilment: "pickup" })], { ...MANDATE, pickupAllowed: true }).ok, true);
});

test("an empty plan never passes", () => {
  assert.equal(check([]).ok, false);
});
