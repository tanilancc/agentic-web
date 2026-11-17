// Tests for the actions the tour site offers other sites through partner-desk/.

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { ActionRegistry } from "../runtime/actions.js";
import { Calendar } from "../js/calendar.js";
import { SavedReservations } from "../js/saved-reservations.js";
import { TourData } from "../js/tour-data.js";
import { TripBook } from "../js/trip-book.js";
import { PartnerActions } from "../partner-actions.js";
import { PARTNER_CALLERS } from "../partner-callers.js";

function memoryStorage() {
  const items = new Map();
  return { getItem: (k) => (items.has(k) ? items.get(k) : null), setItem: (k, v) => items.set(k, String(v)), items };
}

const SCOPE = { base: "http://localhost:8081/partner-desk", network: "marrow_point_partner_desk" };
const date = () => TripBook.firstRun(TourData.findById(TourData.TOURS, "seal-rocks"), Calendar.addDays(Calendar.today(), 20));

async function setup() {
  const storage = memoryStorage();
  PartnerActions.storage = storage;
  const registry = new ActionRegistry();
  PartnerActions.registerActions({ register: (definition) => registry.register(SCOPE, definition) });
  const entries = [...registry.entries.values()];
  const run = (name, args) => entries.find((entry) => entry.name === name).execute(args, { requestId: "t" });
  return { storage, entries, run };
}

const trip = () => ({ tourId: "seal-rocks", date: date(), time: "10:00", adults: 2, children: 0 });
const contact = { firstName: "Ana", lastName: "Silva", email: "ana@example.com", phone: "0123 456 789" };

test("the catalog offers two reads in a frame and one reservation in the tour site's own window", async () => {
  const { entries } = await setup();
  assert.deepEqual(entries.map((e) => [e.name, e.effect, e.availability]), [
    ["find_departures", "read", "bridge"], ["quote_trip", "read", "bridge"], ["reserve_trip", "irreversible", "top-level"]]);
  assert.ok(entries.every((e) => JSON.stringify(e.callerOrigins) === JSON.stringify(PARTNER_CALLERS)));
});

test("departures and quotes come from the site and change nothing", async () => {
  const { run, storage } = await setup();
  const found = await run("find_departures", { date: date(), adults: 2, children: 0 });
  const seal = found.departures.find((d) => d.tourId === "seal-rocks" && d.time === "10:00");
  assert.deepEqual(Object.keys(seal).sort(), ["date", "minutes", "name", "placesLeft", "time", "totalCents", "tourId"]);
  assert.equal(seal.name, "Seal Rocks Cruise");
  const quote = await run("quote_trip", trip());
  assert.equal(quote.totalCents, seal.totalCents);
  assert.equal(storage.items.size, 0);
});

test("a reservation with a price that changed is refused and saves nothing", async () => {
  const { run, storage } = await setup();
  const out = await run("reserve_trip", { ...trip(), ...contact, expectedTotalCents: 1 });
  assert.equal(out.ok, false);
  assert.match(out.reason, /price/i);
  assert.equal(SavedReservations.load(storage).length, 0);
});

test("a good reservation is saved and returns its code", async () => {
  const { run, storage } = await setup();
  const quote = await run("quote_trip", trip());
  const out = await run("reserve_trip", { ...trip(), ...contact, expectedTotalCents: quote.totalCents });
  assert.equal(out.ok, true, out.reason);
  assert.equal(out.totalCents, quote.totalCents);
  assert.ok(SavedReservations.load(storage).some((r) => r.code === out.code));
});

test("the partner desk page loads the runtime's bridge and lists only this module", async () => {
  const page = await readFile(new URL("../partner-desk/action-bridge.html", import.meta.url), "utf8");
  assert.match(page, /src="\.\.\/runtime\/action-bridge\.js"/);
  const manifest = JSON.parse(await readFile(new URL("../partner-desk/agent-manifest.json", import.meta.url), "utf8"));
  assert.deepEqual(manifest.actions, { version: 1, module: "../partner-actions.js" });
});
