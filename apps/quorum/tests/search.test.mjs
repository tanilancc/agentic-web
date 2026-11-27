// Tests for the basket builder and the plan search, against the three real catalogs and
// the vendors' real pricing, behind stand-in desks.

import assert from "node:assert/strict";
import test from "node:test";
import { quote } from "../../shared/vendor-pricing.js";
import { CATALOG as LITTLE_OVEN } from "../../market/little_oven/catalog.js";
import { CATALOG as GREEN_FORK } from "../../market/green_fork/catalog.js";
import { CATALOG as BAKEHOUSE } from "../../market/harbour_bakehouse/catalog.js";
import { buildBasket, searchPlans } from "../js/search.js";

const NOW = "2026-12-01T09:00";
const CATALOGS = { little_oven: LITTLE_OVEN, green_fork: GREEN_FORK, harbour_bakehouse: BAKEHOUSE };
const MANDATE = { date: "2026-12-10", headcount: 30, vegetarian: 6, vegan: 3, glutenFree: 4, budgetCents: 80000, from: "17:00", to: "18:00", flexMinutes: 30, pickupAllowed: false };

/**
 * Vendors behind stand-in desks: each answers with its real pricing; `down` never answers.
 */
function market({ down = [] } = {}) {
  const calls = [];
  return {
    calls,
    getCatalog: async (id) => (down.includes(id) ? { ok: false, reason: `${id} did not answer in time.` } : CATALOGS[id]),
    quote: async (id, args) => {
      calls.push([id, args]);
      return quote(CATALOGS[id], args, NOW);
    },
  };
}

const servingsOf = (catalog, items) => items.reduce((sum, e) => sum + catalog.items.find((i) => i.id === e.id).serves * e.qty, 0);
const dietOf = (catalog, items, diet) => items.reduce((sum, e) => {
  const item = catalog.items.find((i) => i.id === e.id);
  const has = item.diets.includes(diet) || (diet === "vegetarian" && item.diets.includes("vegan"));
  return sum + (has ? item.serves * e.qty : 0);
}, 0);

test("a basket covers every diet need and the headcount, cheapest per serving", () => {
  const need = { servings: 30, vegetarian: 9, vegan: 3, glutenFree: 4 };
  const items = buildBasket(GREEN_FORK, need);
  assert.ok(servingsOf(GREEN_FORK, items) >= 30);
  assert.ok(dietOf(GREEN_FORK, items, "vegan") >= 3);
  assert.ok(dietOf(GREEN_FORK, items, "gluten-free") >= 4);
  assert.ok(dietOf(GREEN_FORK, items, "vegetarian") >= 9);
});

test("a vendor that has nothing for a diet gives no basket", () => {
  assert.equal(buildBasket(LITTLE_OVEN, { servings: 10, vegetarian: 0, vegan: 0, glutenFree: 1 }), null);
});

test("a basket with no diet needs is the cheapest food per serving", () => {
  const items = buildBasket(LITTLE_OVEN, { servings: 9, vegetarian: 0, vegan: 0, glutenFree: 0 });
  // Margherita and vegan marinara both serve 3; marinara is cheaper.
  assert.deepEqual(items, [{ id: "marinara", qty: 3 }]);
});

test("the best plan passes, and costs no more than any other passing plan or the baseline", async () => {
  const m = market();
  const out = await searchPlans({ vendors: Object.keys(CATALOGS), mandate: MANDATE, ...m, now: NOW });
  assert.ok(out.best, JSON.stringify(out.closest));
  assert.equal(out.best.check.ok, true);
  for (const plan of out.plans.filter((p) => p.check.ok)) {
    assert.ok(out.best.check.totalCents <= plan.check.totalCents);
  }
  assert.ok(out.baseline);
  assert.equal(out.baseline.orders.length, 1);
  assert.ok(out.best.check.totalCents <= out.baseline.check.totalCents);
});

test("Little Oven alone never passes when someone needs gluten-free food", async () => {
  const out = await searchPlans({ vendors: Object.keys(CATALOGS), mandate: MANDATE, ...market(), now: NOW });
  assert.ok(!out.plans.some((p) => p.check.ok && p.orders.length === 1 && p.orders[0].vendor === "little_oven"));
});

test("a split that is cheaper than every single vendor wins", async () => {
  const out = await searchPlans({ vendors: Object.keys(CATALOGS), mandate: MANDATE, ...market(), now: NOW });
  const singles = out.plans.filter((p) => p.check.ok && p.orders.length === 1);
  const splits = out.plans.filter((p) => p.check.ok && p.orders.length === 2);
  if (splits.length && singles.length && Math.min(...splits.map((p) => p.check.totalCents)) < Math.min(...singles.map((p) => p.check.totalCents))) {
    assert.equal(out.best.orders.length, 2);
  } else {
    assert.ok(out.best);
  }
});

test("an off-peak time wins when it is inside the window", async () => {
  // Green Fork alone, window 14:00 to 17:30: its 14:30-17:00 discount should be used.
  const m = { ...MANDATE, headcount: 12, vegetarian: 4, vegan: 4, glutenFree: 4, from: "14:00", to: "17:30", flexMinutes: 0 };
  const out = await searchPlans({ vendors: ["green_fork"], mandate: m, ...market(), now: NOW });
  const time = out.best.orders[0].time;
  assert.ok(time >= "14:30" && time < "17:00", time);
});

test("a vendor that does not answer is skipped and named", async () => {
  const out = await searchPlans({ vendors: Object.keys(CATALOGS), mandate: MANDATE, ...market({ down: ["green_fork"] }), now: NOW });
  assert.deepEqual(out.failures, [{ vendor: "green_fork", reason: "green_fork did not answer in time." }]);
  assert.ok(!out.plans.some((p) => p.orders.some((o) => o.vendor === "green_fork")));
});

test("when nothing fits, the closest plan comes back with its problems, never as acceptable", async () => {
  const out = await searchPlans({ vendors: Object.keys(CATALOGS), mandate: { ...MANDATE, budgetCents: 1000 }, ...market(), now: NOW });
  assert.equal(out.best, null);
  assert.ok(out.closest);
  assert.equal(out.closest.check.ok, false);
  assert.match(out.closest.check.problems.join(" "), /over the \$10\.00 budget/);
});

test("the number of quotes is capped, and the result says so", async () => {
  const m = market();
  const out = await searchPlans({ vendors: Object.keys(CATALOGS), mandate: MANDATE, ...m, now: NOW, maxQuotes: 5 });
  assert.ok(m.calls.length <= 5);
  assert.equal(out.capped, true);
  assert.equal(out.quotesUsed, m.calls.length);
});

test("the same quote is never asked for twice", async () => {
  const m = market();
  await searchPlans({ vendors: Object.keys(CATALOGS), mandate: MANDATE, ...m, now: NOW });
  const keys = m.calls.map((c) => JSON.stringify(c));
  assert.equal(new Set(keys).size, keys.length);
});

// --- Review fixes: menus Quorum cannot read, vendors that die mid-search, reasons ------

import { checkPlan } from "../js/mandate.js";
import { validateCatalog } from "../js/search.js";

for (const [label, change] of [
  ["a negative order interval", { slotMinutes: -30 }],
  ["an order interval of 0", { slotMinutes: 0 }],
  ["opening hours that are not times", { hours: { from: "noon", to: "21:00" } }],
  ["an item without diets", { items: [{ id: "x", name: "X", priceCents: 100, serves: 1 }] }],
  ["an item that serves nobody", { items: [{ id: "x", name: "X", priceCents: 100, serves: 0, diets: [] }] }],
  ["an item that costs nothing", { items: [{ id: "x", name: "X", priceCents: 0, serves: 1, diets: [] }] }],
  ["no items", { items: [] }],
]) {
  test(`a menu with ${label} is refused, named, and never hangs the search`, async () => {
    const broken = { ...GREEN_FORK, ...change };
    assert.ok(validateCatalog(broken));
    const m = market();
    m.getCatalog = async (id) => (id === "green_fork" ? broken : CATALOGS[id]);
    const out = await searchPlans({ vendors: Object.keys(CATALOGS), mandate: MANDATE, ...m, now: NOW });
    assert.deepEqual(out.failures.map((f) => f.vendor), ["green_fork"]);
    assert.match(out.failures[0].reason, /menu Quorum cannot read/);
  });
}

test("the real menus are all readable", () => {
  for (const catalog of Object.values(CATALOGS)) {
    assert.equal(validateCatalog(catalog), "", catalog.id);
  }
});

test("a vendor that stops answering after its menu loaded is named once and skipped", async () => {
  const m = market();
  const quote = m.quote;
  m.quote = async (id, args) => (id === "green_fork" ? { ok: false, reason: "Green Fork did not answer in time.", unreachable: true } : quote(id, args));
  const out = await searchPlans({ vendors: Object.keys(CATALOGS), mandate: MANDATE, ...m, now: NOW });
  assert.deepEqual(out.failures, [{ vendor: "green_fork", reason: "Green Fork did not answer in time." }]);
  assert.ok(m.calls.filter((c) => c[0] === "green_fork").length === 0);
  assert.ok(out.best);
});

test("when no vendor has an order time in the window, the result says so per vendor", async () => {
  const out = await searchPlans({ vendors: Object.keys(CATALOGS), mandate: { ...MANDATE, from: "06:00", to: "07:00", flexMinutes: 0 }, ...market(), now: NOW });
  assert.equal(out.best, null);
  assert.equal(out.notes.length, 3);
  assert.ok(out.notes.every((n) => /no order time between 06:00 and 07:00/.test(n.reason)));
});

test("when every quote is refused, each vendor's own reason comes back", async () => {
  // A day that has already passed: every vendor refuses for notice.
  const out = await searchPlans({ vendors: Object.keys(CATALOGS), mandate: { ...MANDATE, date: "2026-11-30" }, ...market(), now: NOW });
  assert.equal(out.best, null);
  assert.equal(out.notes.length, 3);
  assert.ok(out.notes.every((n) => /notice|no dish for one of the diets/.test(n.reason)), JSON.stringify(out.notes));
  assert.ok(out.notes.some((n) => /notice/.test(n.reason)));
});

test("baskets feed each diet group as separate people", async () => {
  // 12 people: 6 vegetarian and 6 gluten-free, as separate people.
  const m = { ...MANDATE, headcount: 12, vegetarian: 6, vegan: 0, glutenFree: 6 };
  const out = await searchPlans({ vendors: ["harbour_bakehouse"], mandate: m, ...market(), now: NOW });
  assert.ok(out.best, JSON.stringify(out.closest?.check));
  assert.equal(checkPlan({ orders: out.best.orders }, m, out.catalogs).ok, true);
});

test("the search returns the menus it checked against", async () => {
  const out = await searchPlans({ vendors: ["little_oven"], mandate: { ...MANDATE, glutenFree: 0 }, ...market(), now: NOW });
  assert.deepEqual(Object.keys(out.catalogs), ["little_oven"]);
});
