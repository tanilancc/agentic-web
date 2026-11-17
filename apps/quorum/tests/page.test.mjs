// Tests for the Quorum page: the mandate form, the plan view, and the order dialog.

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { defaultMandate, QuorumApp } from "../js/app.js";
import { PlanView } from "../js/plan-view.js";
import { MiniDocument } from "./mini_dom.mjs";

function memoryStorage() {
  const items = new Map();
  return { getItem: (k) => (items.has(k) ? items.get(k) : null), setItem: (k, v) => items.set(k, String(v)) };
}

function input(doc, form, name, type = "text") {
  const node = doc.createElement("input");
  node.setAttribute("name", name);
  node.type = type;
  form.append(node);
  return node;
}

/**
 * A page with the elements the app looks up.
 */
function page(store = memoryStorage()) {
  const doc = new MiniDocument();
  const form = doc.add("form", "mandate-form");
  for (const name of ["date", "from", "to", "headcount", "vegetarian", "vegan", "glutenFree", "flexMinutes", "budget"]) {
    input(doc, form, name);
  }
  input(doc, form, "pickupAllowed", "checkbox");
  doc.add("ul", "mandate-problems");
  doc.add("div", "plans");
  const card = doc.add("form", "contact-card");
  for (const name of ["firstName", "lastName", "email", "phone"]) {
    input(doc, card, name);
  }
  return { doc, form, card, store };
}

const quote = (name, totalCents, discounts = []) => ({ totalCents, servings: 30, dietServings: { vegetarian: 9, vegan: 3, "gluten-free": 4 }, lines: [{ qty: 2, name }], discounts });
const plan = (orders, ok = true, problems = []) => ({ orders, check: { ok, problems, totalCents: orders.reduce((s, o) => s + o.quote.totalCents, 0) } });
const order = (vendor, name, total, discounts) => ({ vendor, time: "17:30", fulfilment: "delivery", items: [{ id: "x", qty: 2 }], quote: quote(name, total, discounts) });

test("the form starts with a sensible mandate and keeps a sound change", () => {
  const { doc, form, store } = page();
  const app = new QuorumApp({ doc, store, engine: () => null });
  assert.equal(form.querySelectorAll("input").find((i) => i.getAttribute("name") === "headcount").value, "30");
  form.querySelectorAll("input").find((i) => i.getAttribute("name") === "budget").value = "650";
  assert.deepEqual(app.readForm(), []);
  assert.equal(app.mandate.budgetCents, 65000);
  assert.equal(new QuorumApp({ doc: page(store).doc, store, engine: () => null }).mandate.budgetCents, 65000);
});

test("a form change that makes no sense is shown and not kept", () => {
  const { doc, form, store } = page();
  const app = new QuorumApp({ doc, store, engine: () => null });
  form.querySelectorAll("input").find((i) => i.getAttribute("name") === "headcount").value = "0";
  const problems = app.readForm();
  assert.equal(problems[0].field, "headcount");
  assert.equal(app.mandate.headcount, 30);
  assert.match(doc.getElementById("mandate-problems").textContent, /headcount/);
});

test("the default mandate is nine days ahead", () => {
  assert.equal(defaultMandate(new Date(2026, 11, 1)).date, "2026-12-10");
});

test("the best plan is shown beside the best single vendor, with the saving", () => {
  const doc = new MiniDocument();
  const root = doc.add("div", "plans");
  const best = plan([order("green_fork", "Quinoa bowl", 6000, [{ label: "Off-peak", cents: 1500 }]), order("little_oven", "Marinara", 10000)]);
  const baseline = plan([order("green_fork", "Falafel platter", 20480)]);
  new PlanView(root, doc).show({ best, baseline, closest: null, plans: [best, baseline], failures: [{ vendor: "harbour_bakehouse", reason: "did not answer in time." }], quotesUsed: 25, capped: false }, []);
  const text = root.textContent;
  assert.match(text, /Best plan\$160\.00/);
  assert.match(text, /\$44\.80 less than the best single vendor/);
  assert.match(text, /Best with one vendor\$204\.80/);
  assert.match(text, /Green Fork · 17:30 · delivery/);
  assert.match(text, /Saved \$15\.00 \(Off-peak\)/);
  assert.match(text, /Harbour Bakehouse did not answer/);
  assert.match(text, /25 quotes from the vendors\./);
});

test("when nothing fits, the closest plan is shown with its problems", () => {
  const doc = new MiniDocument();
  const root = doc.add("div", "plans");
  const closest = plan([order("little_oven", "Marinara", 10000)], false, ["$100.00 is $90.00 over the $10.00 budget."]);
  new PlanView(root, doc).show({ best: null, baseline: null, closest, plans: [closest], failures: [], quotesUsed: 3, capped: true }, []);
  assert.match(root.textContent, /No plan meets the mandate/);
  assert.match(root.textContent, /over the \$10\.00 budget/);
  assert.match(root.textContent, /some combinations were not tried/);
});

test("a vendor's hostile item name is shown as text", () => {
  const doc = new MiniDocument();
  const root = doc.add("div", "plans");
  const best = plan([order("little_oven", "<img src=x onerror=alert(1)>", 1000)]);
  new PlanView(root, doc).show({ best, baseline: best, closest: null, plans: [best], failures: [], quotesUsed: 1, capped: false }, [
    { vendor: "little_oven", time: "17:30", totalCents: 1000, status: "refused", reason: "<b>no</b>" },
  ]);
  assert.equal(root.querySelectorAll("img").length, 0);
  assert.equal(root.querySelectorAll("b").length, 0);
  assert.ok(root.textContent.includes("<img src=x onerror=alert(1)>"));
  assert.match(root.textContent, /Not ordered/);
});

test("the order dialog lists each order by number, the total and who it is for", () => {
  const { doc, card, store } = page();
  const app = new QuorumApp({ doc, store, engine: () => null });
  app.mandate = { ...app.mandate, headcount: 30, vegetarian: 6, vegan: 3, glutenFree: 4, budgetCents: 80000, from: "17:00", to: "18:00", flexMinutes: 30 };
  const best = plan([order("green_fork", "Total", 6000), order("green_fork", "refusal", 6000)]);
  best.orders.forEach((o) => { o.quote.servings = 15; o.quote.dietServings = { vegetarian: 9, vegan: 3, "gluten-free": 4 }; });
  app.search = { plans: [best] };
  assert.match(app.reviewAward(0).refusal, /missing/);
  for (const [name, value] of [["firstName", "Ana"], ["lastName", "Silva"], ["email", "ana@example.com"], ["phone", "0123 456 789"]]) {
    card.querySelectorAll("input").find((i) => i.getAttribute("name") === name).value = value;
  }
  app.contact.read();
  const details = app.reviewAward(0);
  assert.equal(details.refusal, undefined);
  assert.equal(Object.keys(details).filter((k) => k.startsWith("Order ")).length, 2);
  assert.equal(details.Total, "$120.00");
  assert.equal(details["Ordered for"], "Ana Silva, ana@example.com, 0123 456 789");
  assert.match(app.reviewAward(5).refusal, /No plan 5/);
});

test("the page allows only its own scripts and mounts the assistant", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /<meta http-equiv="Content-Security-Policy" content="[^"]*script-src 'self';/);
  for (const tag of html.match(/<script\b[^>]*>/g)) {
    assert.match(tag, /\ssrc="/);
  }
  assert.match(html, /id="agent-app"/);
  assert.match(html, /id="mandate-form"/);
});
