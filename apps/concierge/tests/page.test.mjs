// Tests for the Concierge page: the board, the contact card, and the booking dialog.

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { ConciergeApp, localNow } from "../js/app.js";
import { Board, dollars, when } from "../js/board.js";
import { ContactCard, field } from "../js/contact-card.js";
import { MiniDocument } from "./mini_dom.mjs";

/**
 * A storage stand-in.
 */
function memoryStorage() {
  const items = new Map();
  return { getItem: (k) => (items.has(k) ? items.get(k) : null), setItem: (k, v) => items.set(k, String(v)) };
}

const leg = (extra = {}) => ({ id: "leg-1", partner: "harbor_tours", kind: "trip", title: "Seal Rocks Cruise", start: "2026-12-11T10:00", end: "2026-12-11T11:30", partySize: 2, totalCents: 7600, status: "planned", ...extra });

/**
 * A page with the elements the app looks up.
 */
function page(store = memoryStorage()) {
  const doc = new MiniDocument();
  doc.add("div", "board");
  const form = doc.add("form", "contact-card");
  for (const name of ["firstName", "lastName", "email", "phone"]) {
    const input = doc.createElement("input");
    input.setAttribute("name", name);
    form.append(input);
  }
  doc.add("button", "clear-plan");
  return { doc, form, store };
}

test("money and times are written for people", () => {
  assert.equal(dollars(36000), "$360.00");
  assert.equal(when("2026-12-10T15:00"), "Thu 10 Dec, 15:00");
  assert.equal(localNow(new Date(2026, 11, 1, 9, 5)), "2026-12-01T09:05");
});

test("the board shows each leg, the total and the conflicts", () => {
  const doc = new MiniDocument();
  const root = doc.add("div", "board");
  new Board(root, doc).show([leg(), leg({ id: "leg-2", status: "booked", code: "HT-EFGH" })], 15200, [{ ids: ["leg-1"], message: "Seal Rocks Cruise is in the past." }]);
  assert.equal(root.querySelectorAll(".leg").length, 2);
  assert.match(root.textContent, /Marrow Point Harbor Tours · Trip · 2 people/);
  assert.match(root.textContent, /Total \$152\.00/);
  assert.match(root.textContent, /Reference HT-EFGH/);
  assert.match(root.textContent, /Seal Rocks Cruise is in the past/);
  assert.ok(root.querySelector(".leg").classList.contains("leg-flagged"));
});

test("an empty board says what to do", () => {
  const doc = new MiniDocument();
  const root = doc.add("div", "board");
  new Board(root, doc).show([], 0, []);
  assert.match(root.textContent, /Nothing planned yet/);
});

test("a hostile name from a partner is shown as text", () => {
  const doc = new MiniDocument();
  const root = doc.add("div", "board");
  new Board(root, doc).show([leg({ title: "<img src=x onerror=alert(1)>", reason: "<b>no</b>" })], 7600, []);
  assert.equal(root.querySelectorAll("img").length, 0);
  assert.equal(root.querySelectorAll("b").length, 0);
  assert.ok(root.textContent.includes("<img src=x onerror=alert(1)>"));
});

test("the contact card is kept in this browser and survives a reload", () => {
  const { form, store } = page();
  const card = new ContactCard(form, store);
  field(form, "email").value = "  ana@example.com ";
  card.read();
  assert.equal(card.card().email, "ana@example.com");
  assert.equal(new ContactCard(null, store).card().email, "ana@example.com");
});

test("a card that cannot be read starts empty", () => {
  const store = memoryStorage();
  store.setItem(ContactCard.KEY, "{broken");
  assert.deepEqual(new ContactCard(null, store).card(), { firstName: "", lastName: "", email: "", phone: "" });
});

test("the plan is saved and comes back on the next visit", () => {
  const { doc, store } = page();
  const app = new ConciergeApp({ doc, store, engine: () => null });
  app.plan.add({ partner: "harbor_tours", kind: "trip", title: "Seal Rocks Cruise", start: "2030-01-01T10:00", end: "2030-01-01T11:30", partySize: 2, totalCents: 7600, commit: { action: "reserve_trip", args: {} } });
  app.save();
  const again = new ConciergeApp({ doc: page(store).doc, store, engine: () => null });
  assert.equal(again.plan.list().length, 1);
});

test("the booking dialog lists every planned leg, the total and who it is for", () => {
  const { doc, form, store } = page();
  const app = new ConciergeApp({ doc, store, engine: () => null });
  app.plan.add({ partner: "harbor_tours", kind: "trip", title: "Seal Rocks Cruise", start: "2030-01-01T10:00", end: "2030-01-01T11:30", partySize: 2, totalCents: 7600, commit: { action: "reserve_trip", args: {} } });
  assert.match(app.reviewTrip().refusal, /missing: firstName, lastName, email, phone/);
  for (const [name, value] of [["firstName", "Ana"], ["lastName", "Silva"], ["email", "ana@example.com"], ["phone", "0123"]]) {
    field(form, name).value = value;
  }
  app.contact.read();
  const details = app.reviewTrip();
  assert.equal(details["Leg 1: Seal Rocks Cruise"], "Marrow Point Harbor Tours, 2030-01-01 10:00, $76.00");
  assert.equal(details.Total, "$76.00");
  assert.equal(details["Booked for"], "Ana Silva, ana@example.com, 0123");
});

test("without a booted runtime, partner contact is declined, never sent", async () => {
  const { doc, store } = page();
  const app = new ConciergeApp({ doc, store, engine: () => null });
  const out = await app.desk.read("guesthouse", "search_rooms", {});
  assert.match(out.reason, /declined/);
});

test("the page allows only its own scripts and mounts the assistant", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /<meta http-equiv="Content-Security-Policy" content="[^"]*script-src 'self';/);
  for (const tag of html.match(/<script\b[^>]*>/g)) {
    assert.match(tag, /\ssrc="/);
  }
  assert.match(html, /id="agent-app"/);
  assert.match(html, /The assistant never sees it/);
});

test("the booking dialog keeps every leg apart, whatever the partners call them", () => {
  const { doc, form, store } = page();
  const app = new ConciergeApp({ doc, store, engine: () => null });
  const legOf = (title, start) => ({ partner: "harbor_tours", kind: "trip", title, start, end: start, partySize: 2, totalCents: 7600, commit: { action: "reserve_trip", args: {} } });
  app.plan.add(legOf("Seal Rocks Cruise", "2030-01-01T10:00"));
  app.plan.add(legOf("Seal Rocks Cruise", "2030-01-02T10:00"));
  app.plan.add(legOf("refusal", "2030-01-03T10:00"));
  app.plan.add(legOf("Total", "2030-01-04T10:00"));
  for (const [name, value] of [["firstName", "Ana"], ["lastName", "Silva"], ["email", "ana@example.com"], ["phone", "0123"]]) {
    field(form, name).value = value;
  }
  app.contact.read();
  const details = app.reviewTrip();
  assert.equal(details.refusal, undefined);
  assert.equal(Object.keys(details).filter((k) => k.startsWith("Leg ")).length, 4);
  assert.equal(details.Total, "$304.00");
});
