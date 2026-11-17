// Tests for the three market vendor sites as published: their partner desks and pages.

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { ActionRegistry } from "../../skills/agentify-website/runtime/actions.js";
import { MiniDocument } from "../../apps/beacon/tests/mini_dom.mjs";
import { renderVendorPage } from "../../apps/shared/vendor-page.js";
import { SavedOrders } from "../../apps/shared/vendor-desk.js";

const VENDORS = ["little_oven", "green_fork", "harbour_bakehouse"];

for (const id of VENDORS) {
  test(`${id} publishes its partner desk for Quorum only`, async () => {
    const { registerActions } = await import(`../../apps/market/${id}/partner-actions.js`);
    const registry = new ActionRegistry();
    registerActions({ register: (d) => registry.register({ base: `http://127.0.0.1/${id}/partner-desk`, network: `${id}_partner_desk` }, d) });
    const entries = [...registry.entries.values()];
    assert.deepEqual(entries.map((e) => e.name), ["get_catalog", "request_quote", "place_order"]);
    assert.ok(entries.every((e) => e.callerOrigins.length === 1 && e.callerOrigins[0] === "http://localhost:8094"));
    const page = await readFile(new URL(`../../apps/market/${id}/partner-desk/action-bridge.html`, import.meta.url), "utf8");
    assert.match(page, /src="\.\.\/runtime\/action-bridge\.js"/);
    const html = await readFile(new URL(`../../apps/market/${id}/index.html`, import.meta.url), "utf8");
    assert.match(html, /script-src 'self'/);
  });
}

function page() {
  const doc = new MiniDocument();
  for (const id of ["menu", "rules", "orders"]) {
    doc.add("div", id);
  }
  return doc;
}

const CATALOG = {
  id: "test", name: "Test", codePrefix: "TT", minOrderCents: 1000, slotMinutes: 30, hours: { from: "10:00", to: "20:00" },
  delivery: { feeCents: 500, freeOverCents: 5000, leadMinutes: 60 }, pickup: { discountPct: 10 },
  tiers: [{ minItems: 5, discountPct: 5 }], offPeak: { from: "15:00", to: "17:00", discountPct: 20 },
  items: [{ id: "x", name: "<img src=x onerror=alert(1)>", priceCents: 1000, serves: 2, diets: ["vegan"] }],
};

test("a vendor page shows its menu, rules and orders, all as text", () => {
  const storage = { getItem: () => JSON.stringify([{ code: "TT-ABCD", order: { date: "2026-12-10", time: "18:00", fulfilment: "delivery", items: [{ id: "x", qty: 2 }] }, totalCents: 2000, contact: { firstName: "<b>Ana</b>", lastName: "Silva" } }]) };
  const doc = page();
  renderVendorPage(doc, CATALOG, storage);
  const text = doc.body.textContent;
  assert.match(text, /Serves 2 · vegan/);
  assert.match(text, /20% off from 15:00 to 17:00/);
  assert.match(text, /10% off for pickup/);
  assert.match(text, /TT-ABCD: 2026-12-10 18:00, delivery, 2 × <img src=x onerror=alert\(1\)>\. \$20\.00\. For <b>Ana<\/b> Silva\./);
  assert.equal(doc.body.querySelectorAll("img").length, 0);
  assert.equal(doc.body.querySelectorAll("b").length, 0);
});

test("a vendor page with no orders says so", () => {
  const doc = page();
  renderVendorPage(doc, CATALOG, { getItem: () => null });
  assert.match(doc.getElementById("orders").textContent, /No orders yet/);
  assert.equal(SavedOrders.load({ getItem: () => "{bad" }, "test").length, 0);
});
