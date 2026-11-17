// Tests for the actions the guesthouse offers other sites through partner-desk/.

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { ActionRegistry } from "../runtime/actions.js";
import { Calendar } from "../js/calendar.js";
import { GuesthouseData } from "../js/guesthouse-data.js";
import { SavedBookings } from "../js/saved-bookings.js";
import { PartnerActions } from "../partner-actions.js";
import { PARTNER_CALLERS } from "../partner-callers.js";
import { memoryStorage } from "./saved.test.mjs";

const SCOPE = { base: "http://127.0.0.1:8080/partner-desk", network: "tidewhistle_partner_desk" };
const checkIn = () => Calendar.addDays(Calendar.today(), 40);
const checkOut = () => Calendar.addDays(Calendar.today(), 42);

/**
 * Register the partner actions on a fresh storage, and run one by name.
 */
async function setup() {
  const storage = memoryStorage();
  PartnerActions.storage = storage;
  const registry = new ActionRegistry();
  PartnerActions.registerActions({ register: (definition) => registry.register(SCOPE, definition) });
  const entries = [...registry.entries.values()];
  const run = (name, args) => entries.find((entry) => entry.name === name).execute(args, { requestId: "t" });
  return { storage, entries, run };
}

const booking = (extra = {}) => ({
  roomId: "garden", checkIn: checkIn(), checkOut: checkOut(), guests: 2,
  firstName: "Ana", lastName: "Silva", email: "ana@example.com", arrival: GuesthouseData.ARRIVAL_TIMES[0], ...extra,
});

test("the catalog offers two reads in a frame and one booking in the guesthouse's own window", async () => {
  const { entries } = await setup();
  assert.deepEqual(entries.map((e) => [e.name, e.effect, e.availability]), [
    ["search_rooms", "read", "bridge"], ["quote_stay", "read", "bridge"], ["place_booking", "irreversible", "top-level"]]);
  assert.ok(entries.every((e) => JSON.stringify(e.callerOrigins) === JSON.stringify(PARTNER_CALLERS)));
  assert.ok(PARTNER_CALLERS.includes("http://localhost:8093"));
});

test("search and quote return the site's prices and change nothing", async () => {
  const { run, storage } = await setup();
  const found = await run("search_rooms", { checkIn: checkIn(), checkOut: checkOut(), guests: 2 });
  assert.ok(found.rooms.length > 0);
  assert.deepEqual(Object.keys(found.rooms[0]).sort(), ["maxGuests", "name", "roomId", "totalCents"]);
  const quote = await run("quote_stay", { roomId: "garden", checkIn: checkIn(), checkOut: checkOut(), guests: 2 });
  assert.equal(quote.roomId, "garden");
  assert.equal(quote.totalCents, found.rooms.find((r) => r.roomId === "garden").totalCents);
  assert.equal(storage.items.size, 0);
});

test("a read the site refuses gives its own reason", async () => {
  const { run } = await setup();
  const out = await run("search_rooms", { checkIn: checkOut(), checkOut: checkIn(), guests: 2 });
  assert.equal(out.ok, false);
  assert.equal(typeof out.reason, "string");
  assert.ok(out.reason.length > 0);
});

test("a booking with a price that changed is refused and saves nothing", async () => {
  const { run, storage } = await setup();
  const out = await run("place_booking", booking({ expectedTotalCents: 1 }));
  assert.equal(out.ok, false);
  assert.match(out.reason, /price/i);
  assert.equal(SavedBookings.load(storage).length, 0);
});

test("a good booking is saved and returns its code and total", async () => {
  const { run, storage } = await setup();
  const quote = await run("quote_stay", { roomId: "garden", checkIn: checkIn(), checkOut: checkOut(), guests: 2 });
  const out = await run("place_booking", booking({ expectedTotalCents: quote.totalCents }));
  assert.equal(out.ok, true);
  assert.match(out.code, /^TW-/);
  assert.equal(out.totalCents, quote.totalCents);
  assert.ok(SavedBookings.load(storage).some((b) => b.code === out.code));
  const again = await run("place_booking", booking({ expectedTotalCents: quote.totalCents }));
  assert.equal(again.ok, false);
});

test("the partner desk page loads the runtime's bridge and lists only this module", async () => {
  const page = await readFile(new URL("../partner-desk/action-bridge.html", import.meta.url), "utf8");
  assert.match(page, /src="\.\.\/runtime\/action-bridge\.js"/);
  const manifest = JSON.parse(await readFile(new URL("../partner-desk/agent-manifest.json", import.meta.url), "utf8"));
  assert.deepEqual(manifest.actions, { version: 1, module: "../partner-actions.js" });
});
