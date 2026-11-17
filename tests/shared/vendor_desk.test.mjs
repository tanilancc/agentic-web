// Tests for the partner desk every market vendor publishes, and for the three vendors'
// catalogs.

import assert from "node:assert/strict";
import test from "node:test";
import { validateData } from "../../skills/agentify-website/runtime/actions.js";
import { ActionRegistry } from "../../skills/agentify-website/runtime/actions.js";
import { vendorActions, SavedOrders } from "../../apps/shared/vendor-desk.js";
import { CATALOG as LITTLE_OVEN } from "../../apps/market/little_oven/catalog.js";
import { CATALOG as GREEN_FORK } from "../../apps/market/green_fork/catalog.js";
import { CATALOG as BAKEHOUSE } from "../../apps/market/harbour_bakehouse/catalog.js";

const NOW = "2026-12-01T09:00";
const CALLERS = ["http://localhost:8094"];
const CONTACT = { firstName: "Ana", lastName: "Silva", email: "ana@example.com", phone: "0123 456 789" };

function memoryStorage() {
  const items = new Map();
  return { getItem: (k) => (items.has(k) ? items.get(k) : null), setItem: (k, v) => items.set(k, String(v)), items };
}

function setup(catalog = LITTLE_OVEN) {
  const storage = memoryStorage();
  const registry = new ActionRegistry();
  vendorActions({ catalog, callers: CALLERS, storage, now: () => NOW })
    .forEach((definition) => registry.register({ base: "http://127.0.0.1:8095/partner-desk", network: `${catalog.id}_partner_desk` }, definition));
  const entries = [...registry.entries.values()];
  const run = (name, args) => {
    const entry = entries.find((e) => e.name === name);
    validateData(entry.inputSchema, args);
    return entry.execute(args, { requestId: "t" });
  };
  return { storage, entries, run };
}

const terms = (extra = {}) => ({ date: "2026-12-10", time: "18:00", fulfilment: "delivery", items: [{ id: LITTLE_OVEN.items[0].id, qty: 4 }], ...extra });

test("the desk offers two reads in a frame and one order in the vendor's own window", () => {
  const { entries } = setup();
  assert.deepEqual(entries.map((e) => [e.name, e.effect, e.availability]), [
    ["get_catalog", "read", "bridge"], ["request_quote", "read", "bridge"], ["place_order", "irreversible", "top-level"]]);
  assert.ok(entries.every((e) => JSON.stringify(e.callerOrigins) === JSON.stringify(CALLERS)));
});

test("get_catalog returns the menu and rules", async () => {
  const { run } = setup();
  const out = await run("get_catalog", {});
  assert.equal(out.id, "little_oven");
  assert.ok(out.items.length >= 3);
});

test("request_quote is the vendor's own price and changes nothing", async () => {
  const { run, storage } = setup();
  const out = await run("request_quote", terms());
  assert.equal(out.ok, true);
  assert.ok(out.totalCents > 0);
  assert.equal(storage.items.size, 0);
});

test("an order at a changed price is refused and nothing is saved", async () => {
  const { run, storage } = setup();
  const out = await run("place_order", { ...terms(), ...CONTACT, expectedTotalCents: 1 });
  assert.equal(out.ok, false);
  assert.match(out.reason, /price is now/);
  assert.equal(SavedOrders.load(storage, "little_oven").length, 0);
});

test("a good order is saved with a code", async () => {
  const { run, storage } = setup();
  const q = await run("request_quote", terms());
  const out = await run("place_order", { ...terms(), ...CONTACT, expectedTotalCents: q.totalCents });
  assert.equal(out.ok, true);
  assert.match(out.code, /^LO-[A-Z2-9]{4}$/);
  const saved = SavedOrders.load(storage, "little_oven");
  assert.equal(saved.length, 1);
  assert.equal(saved[0].code, out.code);
  assert.equal(saved[0].totalCents, q.totalCents);
});

test("an order the kitchen cannot make is refused with its reason", async () => {
  const { run } = setup();
  const out = await run("place_order", { ...terms({ time: "23:00" }), ...CONTACT, expectedTotalCents: 100 });
  assert.equal(out.ok, false);
  assert.match(out.reason, /takes orders between/);
});

test("each vendor's catalog is valid and the three differ as designed", () => {
  for (const catalog of [LITTLE_OVEN, GREEN_FORK, BAKEHOUSE]) {
    assert.ok(catalog.items.every((item) => item.priceCents > 0 && item.serves > 0 && Array.isArray(item.diets)), catalog.id);
    assert.equal(new Set(catalog.items.map((item) => item.id)).size, catalog.items.length);
  }
  const has = (catalog, diet) => catalog.items.some((item) => item.diets.includes(diet));
  assert.equal(has(LITTLE_OVEN, "gluten-free"), false);
  assert.ok(has(GREEN_FORK, "vegan") && has(GREEN_FORK, "gluten-free"));
  assert.ok(GREEN_FORK.offPeak.discountPct > 0);
  assert.ok(BAKEHOUSE.pickup.discountPct > 0);
  assert.ok(BAKEHOUSE.minOrderCents > LITTLE_OVEN.minOrderCents);
});

test("an order the vendor cannot record is refused, never reported as placed", async () => {
  const storage = { getItem: () => null, setItem: () => { throw new Error("QuotaExceededError"); } };
  const registry = new ActionRegistry();
  vendorActions({ catalog: LITTLE_OVEN, callers: CALLERS, storage, now: () => NOW })
    .forEach((d) => registry.register({ base: "http://127.0.0.1:8095/partner-desk", network: "x" }, d));
  const entries = [...registry.entries.values()];
  const q = await entries.find((e) => e.name === "request_quote").execute(terms());
  const out = await entries.find((e) => e.name === "place_order").execute({ ...terms(), ...CONTACT, expectedTotalCents: q.totalCents });
  assert.equal(out.ok, false);
  assert.match(out.reason, /could not record the order\. Nothing was ordered/);
});
