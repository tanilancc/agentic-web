// Tests for Quorum's tools, with a stand-in desk backed by the vendors' real pricing.

import assert from "node:assert/strict";
import test from "node:test";
import { ActionRegistry } from "../runtime/actions.js";
import { quote } from "../shared/vendor-pricing.js";
import { CATALOG as LITTLE_OVEN } from "../../market/little_oven/catalog.js";
import { CATALOG as GREEN_FORK } from "../../market/green_fork/catalog.js";
import { CATALOG as BAKEHOUSE } from "../../market/harbour_bakehouse/catalog.js";
import { Award } from "../js/award.js";
import { QuorumActions, registerActions } from "../site-actions.js";

const NOW = "2026-12-01T09:00";
const CATALOGS = { little_oven: LITTLE_OVEN, green_fork: GREEN_FORK, harbour_bakehouse: BAKEHOUSE };
const CARD = { firstName: "Ana", lastName: "Silva", email: "ana.silva@example.com", phone: "0123 456 789" };
const SECRETS = Object.values(CARD);
const MANDATE = { date: "2026-12-10", headcount: 30, vegetarian: 6, vegan: 3, glutenFree: 4, budgetCents: 80000, from: "17:00", to: "18:00", flexMinutes: 30, pickupAllowed: false };

/**
 * A desk whose vendors answer with their real pricing, and book what they are told.
 */
function fakeDesk({ down = [], bookAs = {} } = {}) {
  const calls = [];
  return {
    calls,
    read: async (id, action, args) => {
      calls.push(["read", id, action]);
      if (down.includes(id)) return { ok: false, reason: `${id} did not answer in time.` };
      if (action === "get_catalog") return CATALOGS[id];
      if (action === "request_quote") return quote(CATALOGS[id], args, NOW);
      return { ok: false, reason: "no such read" };
    },
    commit: async (id, action, args, options = {}) => {
      calls.push(["commit", id, action, args, options.signal]);
      if (bookAs[id]) return bookAs[id];
      const q = quote(CATALOGS[id], args, NOW);
      if (q.totalCents !== args.expectedTotalCents) return { status: "refused", reason: "The price is now different." };
      return { status: "booked", value: { ok: true, code: `${CATALOGS[id].codePrefix}-AB12`, totalCents: q.totalCents } };
    },
  };
}

function setup({ desk = fakeDesk(), card = CARD, mandate = MANDATE } = {}) {
  const state = { mandate: { ...mandate }, search: null, award: new Award(), saves: 0, shown: [] };
  QuorumActions.context = {
    desk,
    getMandate: () => state.mandate,
    setMandate: (m) => { state.mandate = m; },
    getSearch: () => state.search,
    setSearch: (s) => { state.search = s; state.shown.push(s); },
    award: () => state.award,
    card: () => ({ ...card }),
    save: () => { state.saves += 1; },
  };
  const registry = new ActionRegistry();
  registerActions({ register: (d) => registry.register({ base: "http://localhost:8094", network: "quorum_procurement" }, d) });
  const entries = [...registry.entries.values()];
  const run = (name, args, context) => entries.find((e) => e.name === name).execute(args, context || { requestId: "t" });
  return { desk, state, entries, run };
}

test("the tools and their effects", () => {
  const { entries } = setup();
  assert.deepEqual(entries.map((e) => [e.name, e.effect]), [
    ["get_mandate", "read"], ["set_mandate", "write"], ["list_vendors", "read"], ["request_quote", "read"],
    ["find_best_plan", "write"], ["check_plan", "read"], ["place_award", "irreversible"]]);
  assert.equal(entries.find((e) => e.name === "place_award").timeoutMs, 300000);
});

test("set_mandate changes only the fields given, and refuses a mandate that makes no sense", async () => {
  const { run, state } = setup();
  assert.equal((await run("set_mandate", { headcount: 40 })).ok, true);
  assert.equal(state.mandate.headcount, 40);
  assert.equal(state.mandate.vegan, 3);
  const bad = await run("set_mandate", { from: "19:00", to: "18:00" });
  assert.equal(bad.ok, false);
  assert.equal(bad.problems[0].field, "to");
  assert.equal(state.mandate.from, "17:00");
});

test("get_mandate says what is wrong with the current mandate", async () => {
  const { run } = setup({ mandate: { ...MANDATE, headcount: 0 } });
  const out = await run("get_mandate", {});
  assert.equal(out.problems[0].field, "headcount");
});

test("list_vendors summarises each vendor's menu, and names one that does not answer", async () => {
  const { run } = setup({ desk: fakeDesk({ down: ["harbour_bakehouse"] }) });
  const out = await run("list_vendors", {});
  assert.equal(out.vendors.length, 3);
  assert.ok(out.vendors.find((v) => v.id === "green_fork").items.some((i) => i.diets.includes("vegan")));
  assert.match(out.vendors.find((v) => v.id === "harbour_bakehouse").unavailable, /did not answer/);
});

test("request_quote passes a quote request to the vendor and returns its answer", async () => {
  const { run } = setup();
  const out = await run("request_quote", { vendor: "little_oven", argsJson: JSON.stringify({ date: "2026-12-10", time: "18:00", fulfilment: "delivery", items: [{ id: "margherita", qty: 4 }] }) });
  assert.equal(out.ok, true);
  assert.ok(out.totalCents > 0);
});

test("find_best_plan searches, shows the result on the page, and returns numbered plans", async () => {
  const { run, state } = setup();
  const out = await run("find_best_plan", {});
  assert.equal(state.shown.length, 1);
  assert.equal(out.best.ok, true);
  assert.equal(typeof out.best.plan, "number");
  assert.ok(out.best.totalCents <= out.baseline.totalCents);
  assert.ok(out.best.orders.every((o) => typeof o.vendor === "string" && typeof o.totalCents === "number"));
});

test("find_best_plan refuses to search with a mandate that makes no sense", async () => {
  const { run, desk } = setup({ mandate: { ...MANDATE, budgetCents: 0 } });
  const out = await run("find_best_plan", {});
  assert.equal(out.ok, false);
  assert.equal(desk.calls.length, 0);
});

test("when nothing fits, find_best_plan says why, and offers nothing as acceptable", async () => {
  const { run } = setup({ mandate: { ...MANDATE, budgetCents: 1000 } });
  const out = await run("find_best_plan", {});
  assert.equal(out.best, null);
  assert.equal(out.closest.ok, false);
  assert.match(out.closest.problems.join(" "), /over the \$10\.00 budget/);
});

test("check_plan re-quotes a composed plan with the vendors and checks it", async () => {
  const { run } = setup();
  const ordersJson = JSON.stringify([{ vendor: "little_oven", time: "18:00", fulfilment: "delivery", items: [{ id: "margherita", qty: 10 }] }]);
  const out = await run("check_plan", { ordersJson });
  assert.equal(out.ok, false);
  assert.match(out.problems.join(" "), /gluten-free/);
});

test("place_award orders every part of a passing plan, each saved as booking first", async () => {
  const { run, state, desk } = setup();
  const found = await run("find_best_plan", {});
  let seen = null;
  const commit = desk.commit;
  desk.commit = async (...args) => { seen ??= state.award.list()[0].status; return commit(...args); };
  const out = await run("place_award", { plan: found.best.plan });
  assert.equal(seen, "booking");
  assert.ok(out.orders.every((o) => o.status === "booked" && /^[A-Z]{2}-AB12$/.test(o.code)));
  const commits = desk.calls.filter((c) => c[0] === "commit");
  assert.equal(commits.length, found.best.orders.length);
  assert.equal(commits[0][3].firstName, "Ana");
  assert.equal(commits[0][3].expectedTotalCents, found.best.orders[0].totalCents);
});

test("place_award refuses a plan the checker does not pass", async () => {
  const { run, state, desk } = setup({ mandate: { ...MANDATE, budgetCents: 1000 } });
  await run("find_best_plan", {});
  const failing = state.search.plans.findIndex((p) => !p.check.ok);
  const out = await run("place_award", { plan: failing });
  assert.equal(out.ok, false);
  assert.match(out.reason, /does not meet/);
  assert.equal(desk.calls.filter((c) => c[0] === "commit").length, 0);
});

test("place_award refuses an unknown plan number, an incomplete card, and a second award", async () => {
  const { run } = setup({ card: { ...CARD, phone: "" } });
  const found = await run("find_best_plan", {});
  assert.equal((await run("place_award", { plan: 999 })).ok, false);
  const out = await run("place_award", { plan: found.best.plan });
  assert.match(out.reason, /phone/);
  const ok = setup();
  const best = (await ok.run("find_best_plan", {})).best.plan;
  await ok.run("place_award", { plan: best });
  const again = await ok.run("place_award", { plan: best });
  assert.equal(again.ok, false);
  assert.match(again.reason, /Start a new order on the page/);
});

test("a vendor that refuses leaves the other orders standing, and its text never carries the card", async () => {
  const desk = fakeDesk({ bookAs: { little_oven: { status: "refused", reason: `Sorry ${CARD.email}, the price is now different.` } } });
  const { run } = setup({ desk });
  const found = await run("find_best_plan", {});
  const out = await run("place_award", { plan: found.best.plan });
  const statuses = Object.fromEntries(out.orders.map((o) => [o.vendor, o.status]));
  assert.equal(statuses.little_oven, "refused");
  assert.ok(Object.values(statuses).includes("booked"));
  const text = JSON.stringify(out);
  for (const secret of SECRETS) {
    assert.ok(!text.includes(secret), secret);
  }
});

test("an abort stops before the next vendor, and the desk gets the signal", async () => {
  const desk = fakeDesk();
  const { run, state } = setup({ desk });
  const found = await run("find_best_plan", {});
  assert.equal(found.best.orders.length, 2, "this market's best plan is a split");
  const controller = new AbortController();
  const commit = desk.commit;
  desk.commit = async (...args) => { const out = await commit(...args); controller.abort(); return out; };
  const out = await run("place_award", { plan: found.best.plan }, { requestId: "t", signal: controller.signal });
  assert.equal(desk.calls.filter((c) => c[0] === "commit").length, 1);
  assert.equal(desk.calls.find((c) => c[0] === "commit")[4], controller.signal);
  assert.deepEqual(state.award.list().map((o) => o.status), ["booked", "declined"]);
  assert.match(state.award.list()[1].reason, /not sent/i);
  assert.match(out.stopped, /stopped/i);
});

test("no tool result ever holds the card", async () => {
  const { run } = setup();
  const results = [await run("get_mandate", {}), await run("list_vendors", {}), await run("find_best_plan", {})];
  results.push(await run("place_award", { plan: results[2].best.plan }));
  const text = JSON.stringify(results);
  for (const secret of SECRETS) {
    assert.ok(!text.includes(secret), secret);
  }
});

// --- Review fixes ----------------------------------------------------------------------

test("changing the mandate drops the old search, so its plans can no longer be placed", async () => {
  const { run, state } = setup();
  const found = await run("find_best_plan", {});
  assert.equal((await run("set_mandate", { headcount: 45 })).ok, true);
  assert.equal(state.search, null);
  const out = await run("place_award", { plan: found.best.plan });
  assert.equal(out.ok, false);
  assert.match(out.reason, /Run find_best_plan/);
});

test("after a finished award, a new one is possible once the visitor starts one on the page", async () => {
  const { run, state } = setup();
  const best = (await run("find_best_plan", {})).best.plan;
  await run("place_award", { plan: best });
  assert.equal(state.award.finished(), true);
  assert.equal((await run("place_award", { plan: best })).ok, false);
  state.award = new Award();
  const out = await run("place_award", { plan: best });
  assert.ok(out.orders.every((o) => o.status === "booked"));
});

test("when nothing fits, find_best_plan gives each vendor's reason", async () => {
  const { run } = setup({ mandate: { ...MANDATE, from: "06:00", to: "07:00", flexMinutes: 0 } });
  const out = await run("find_best_plan", {});
  assert.equal(out.best, null);
  assert.equal(out.notes.length, 3);
});

test("check_plan counts each diet group as separate people, from the vendors' menus", async () => {
  const { run } = setup({ mandate: { ...MANDATE, headcount: 12, vegetarian: 6, vegan: 0, glutenFree: 6, budgetCents: 100000 } });
  // Twelve servings of a dish that is both gluten-free and vegetarian would feed both
  // groups; two gluten-free platters are 12 servings: enough only if each counts once.
  const ordersJson = JSON.stringify([{ vendor: "harbour_bakehouse", time: "17:00", fulfilment: "delivery", items: [{ id: "gf-platter", qty: 1 }, { id: "classic-platter", qty: 1 }] }]);
  const out = await run("check_plan", { ordersJson });
  assert.equal(out.ok, false);
  assert.match(out.problems.join(" "), /nothing suitable|short/);
});

test("set_mandate's limits match what the mandate accepts", () => {
  const { entries } = setup();
  const props = entries.find((e) => e.name === "set_mandate").inputSchema.properties;
  assert.equal(props.headcount.maximum, 500);
  assert.equal(props.flexMinutes.maximum, 180);
});
