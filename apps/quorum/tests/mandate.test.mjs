// Tests for the mandate and the plan checker. The checker is the only thing that may
// call a plan acceptable.

import assert from "node:assert/strict";
import test from "node:test";
import { checkPlan, validateMandate } from "../js/mandate.js";

const MANDATE = { date: "2026-12-10", headcount: 40, vegetarian: 8, vegan: 2, glutenFree: 3, budgetCents: 60000, from: "17:00", to: "18:30", flexMinutes: 30, pickupAllowed: false };
const order = (extra = {}) => ({ vendor: "little_oven", time: "18:00", fulfilment: "delivery", items: [], quote: { totalCents: 40000, servings: 40, dietServings: { vegetarian: 12, vegan: 3, "gluten-free": 3 } }, ...extra });

test("a sound mandate has no problems", () => {
  assert.deepEqual(validateMandate(MANDATE), []);
});

for (const [label, change, field] of [
  ["headcount 0", { headcount: 0 }, "headcount"],
  ["a fractional headcount", { headcount: 2.5 }, "headcount"],
  ["more dietary needs than people", { vegetarian: 30, vegan: 20 }, "vegetarian"],
  ["more gluten-free than people", { glutenFree: 41 }, "glutenFree"],
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

test("a plan that meets every rule passes, with the money to spare", () => {
  const out = checkPlan({ orders: [order()] }, MANDATE);
  assert.deepEqual(out, { ok: true, problems: [], totalCents: 40000, slackCents: 20000 });
});

test("servings short of the headcount", () => {
  const out = checkPlan({ orders: [order({ quote: { totalCents: 1, servings: 30, dietServings: { vegetarian: 12, vegan: 3, "gluten-free": 3 } } })] }, MANDATE);
  assert.equal(out.ok, false);
  assert.match(out.problems.join(" "), /30 servings for 40 people: 10 short/);
});

test("vegetarian servings must cover vegetarians and vegans", () => {
  const out = checkPlan({ orders: [order({ quote: { totalCents: 1, servings: 40, dietServings: { vegetarian: 9, vegan: 3, "gluten-free": 3 } } })] }, MANDATE);
  assert.match(out.problems.join(" "), /9 vegetarian servings for 10 people: 1 short/);
});

test("vegan and gluten-free shortfalls", () => {
  const out = checkPlan({ orders: [order({ quote: { totalCents: 1, servings: 40, dietServings: { vegetarian: 12, vegan: 1, "gluten-free": 0 } } })] }, MANDATE);
  assert.match(out.problems.join(" "), /1 vegan servings for 2 people: 1 short/);
  assert.match(out.problems.join(" "), /0 gluten-free servings for 3 people: 3 short/);
});

test("servings add up across orders", () => {
  const half = { totalCents: 20000, servings: 20, dietServings: { vegetarian: 6, vegan: 1, "gluten-free": 2 } };
  const out = checkPlan({ orders: [order({ quote: half }), order({ vendor: "green_fork", quote: { ...half, dietServings: { vegetarian: 6, vegan: 2, "gluten-free": 1 } } })] }, MANDATE);
  assert.equal(out.ok, true, out.problems.join(" "));
});

test("over budget, by how much", () => {
  const out = checkPlan({ orders: [order({ quote: { totalCents: 61500, servings: 40, dietServings: { vegetarian: 12, vegan: 3, "gluten-free": 3 } } })] }, MANDATE);
  assert.equal(out.ok, false);
  assert.match(out.problems.join(" "), /\$615\.00 is \$15\.00 over the \$600\.00 budget/);
  assert.equal(out.slackCents, -1500);
});

test("times outside the window and its flexibility", () => {
  assert.equal(checkPlan({ orders: [order({ time: "16:30" })] }, MANDATE).ok, true);
  const early = checkPlan({ orders: [order({ time: "16:00" })] }, MANDATE);
  assert.match(early.problems.join(" "), /16:00 is outside 16:30 to 19:00/);
});

test("pickup only when allowed", () => {
  assert.match(checkPlan({ orders: [order({ fulfilment: "pickup" })] }, MANDATE).problems.join(" "), /pickup/);
  assert.equal(checkPlan({ orders: [order({ fulfilment: "pickup" })] }, { ...MANDATE, pickupAllowed: true }).ok, true);
});

test("an empty plan never passes", () => {
  assert.equal(checkPlan({ orders: [] }, MANDATE).ok, false);
});

test("an order without a quote never passes", () => {
  const out = checkPlan({ orders: [{ vendor: "x", time: "18:00", fulfilment: "delivery", items: [] }] }, MANDATE);
  assert.equal(out.ok, false);
  assert.match(out.problems.join(" "), /no quote/);
});
