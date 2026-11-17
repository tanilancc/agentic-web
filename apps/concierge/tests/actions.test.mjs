// Tests for the Concierge's tools, with a stand-in partner desk.

import assert from "node:assert/strict";
import test from "node:test";
import { ActionRegistry } from "../runtime/actions.js";
import { Itinerary } from "../js/itinerary.js";
import { ConciergeActions, registerActions } from "../site-actions.js";

const CARD = { firstName: "Ana", lastName: "Silva", email: "ana.silva@example.com", phone: "0123 456 789" };
const SECRETS = ["Ana", "Silva", "ana.silva@example.com", "0123 456 789"];
const STAY = { roomId: "garden", checkIn: "2026-12-10", checkOut: "2026-12-12", guests: 2, arrival: "3 pm to 5 pm" };
const TRIP = { tourId: "seal-rocks", date: "2026-12-11", time: "10:00", adults: 2, children: 0 };

/**
 * A desk that quotes fixed prices and books what it is told.
 */
function fakeDesk({ prices = { guesthouse: 36000, harbor_tours: 7600 }, bookAs = {} } = {}) {
  const calls = [];
  return {
    calls,
    list: () => [{ id: "guesthouse", label: "Tidewhistle Guesthouse", origin: "http://127.0.0.1:8080" }, { id: "harbor_tours", label: "Marrow Point Harbor Tours", origin: "http://localhost:8081" }],
    catalog: async (id) => {
      calls.push(["catalog", id]);
      return id === "guesthouse"
        ? [{ name: "search_rooms", effect: "read", description: "Free rooms.", inputSchema: {} }, { name: "quote_stay", effect: "read", description: "Price.", inputSchema: {} },
          { name: "place_booking", effect: "irreversible", description: "Book.", inputSchema: { properties: { arrival: { enum: ["3 pm to 5 pm", "5 pm to 7 pm"] } } } }]
        : [{ name: "find_departures", effect: "read", description: "Departures.", inputSchema: {} }, { name: "quote_trip", effect: "read", description: "Price.", inputSchema: {} },
          { name: "reserve_trip", effect: "irreversible", description: "Reserve.", inputSchema: {} }];
    },
    read: async (id, action, args) => {
      calls.push(["read", id, action, args]);
      if (args.roomId === "nope") return { ok: false, reason: "Choose a room." };
      if (action === "quote_stay") return { roomId: args.roomId, name: "Garden Room", checkIn: args.checkIn, checkOut: args.checkOut, guests: args.guests, totalCents: prices.guesthouse };
      if (action === "quote_trip") return { tourId: args.tourId, name: "<b>Seal Rocks</b> Cruise", date: args.date, time: args.time, minutes: 90, adults: args.adults, children: args.children, totalCents: prices.harbor_tours };
      return { rooms: [{ roomId: "garden", name: "Garden Room", maxGuests: 2, totalCents: prices.guesthouse }] };
    },
    commit: async (id, action, args) => {
      calls.push(["commit", id, action, args]);
      return bookAs[id] || { status: "booked", value: { ok: true, code: id === "guesthouse" ? "TW-ABCD" : "HT-EFGH", totalCents: args.expectedTotalCents } };
    },
  };
}

/**
 * Register the tools with a desk, a plan and a card, and run one by name.
 */
function setup({ desk = fakeDesk(), card = CARD } = {}) {
  const plan = new Itinerary();
  let saved = 0;
  ConciergeActions.context = { desk, plan, card: () => ({ ...card }), save: () => { saved += 1; }, now: () => "2026-12-01T09:00" };
  const registry = new ActionRegistry();
  registerActions({ register: (definition) => registry.register({ base: "http://localhost:8093", network: "marrow_point_concierge" }, definition) });
  const entries = [...registry.entries.values()];
  const run = (name, args) => entries.find((entry) => entry.name === name).execute(args, { requestId: "t" });
  return { desk, plan, entries, run, saved: () => saved };
}

test("the tools and their effects", () => {
  const { entries } = setup();
  assert.deepEqual(entries.map((e) => [e.name, e.effect]), [
    ["list_partners", "read"], ["search_partner", "read"], ["plan_leg", "write"], ["remove_leg", "write"], ["get_itinerary", "read"], ["book_trip", "irreversible"]]);
  assert.ok(entries.every((e) => e.availability === "local-only"));
});

test("list_partners says what each partner offers and what a booking needs", async () => {
  const { run } = setup();
  const out = await run("list_partners", {});
  const guesthouse = out.partners.find((p) => p.id === "guesthouse");
  assert.deepEqual(guesthouse.reads.map((r) => r.action), ["search_rooms", "quote_stay"]);
  assert.deepEqual(guesthouse.bookingNeeds, [{ field: "arrival", options: ["3 pm to 5 pm", "5 pm to 7 pm"] }]);
});

test("search_partner passes a read through", async () => {
  const { run, desk } = setup();
  const out = await run("search_partner", { partner: "guesthouse", action: "search_rooms", argsJson: JSON.stringify({ checkIn: "2026-12-10", checkOut: "2026-12-12", guests: 2 }) });
  assert.equal(out.rooms[0].roomId, "garden");
  assert.deepEqual(desk.calls.at(-1), ["read", "guesthouse", "search_rooms", { checkIn: "2026-12-10", checkOut: "2026-12-12", guests: 2 }]);
});

test("search_partner refuses arguments that are not a JSON object", async () => {
  const { run } = setup();
  for (const argsJson of ["not json", "[1]", "null"]) {
    const out = await run("search_partner", { partner: "guesthouse", action: "search_rooms", argsJson });
    assert.equal(out.ok, false);
  }
});

test("plan_leg takes the price and name from the partner's quote", async () => {
  const { run, plan, saved } = setup();
  const out = await run("plan_leg", { partner: "guesthouse", argsJson: JSON.stringify({ ...STAY, totalCents: 1 }) });
  assert.equal(out.leg.totalCents, 36000);
  assert.equal(out.leg.title, "Garden Room");
  assert.equal(out.leg.start, "2026-12-10T15:00");
  assert.equal(plan.list().length, 1);
  assert.equal(saved(), 1);
});

test("plan_leg passes on the partner's refusal and adds nothing", async () => {
  const { run, plan } = setup();
  const out = await run("plan_leg", { partner: "guesthouse", argsJson: JSON.stringify({ ...STAY, roomId: "nope" }) });
  assert.deepEqual(out, { ok: false, reason: "Choose a room." });
  assert.equal(plan.list().length, 0);
});

test("get_itinerary lists legs, the total and conflicts, with no booking details", async () => {
  const { run } = setup();
  await run("plan_leg", { partner: "guesthouse", argsJson: JSON.stringify(STAY) });
  await run("plan_leg", { partner: "harbor_tours", argsJson: JSON.stringify({ ...TRIP, adults: 4 }) });
  const out = await run("get_itinerary", {});
  assert.equal(out.legs.length, 2);
  assert.equal(out.totalCents, 36000 + 7600);
  assert.match(out.conflicts[0], /more people than the stay/);
  assert.ok(!JSON.stringify(out).includes("commit"));
});

test("remove_leg removes a leg and refuses an unknown id", async () => {
  const { run, plan } = setup();
  const { leg } = await run("plan_leg", { partner: "guesthouse", argsJson: JSON.stringify(STAY) });
  assert.equal((await run("remove_leg", { id: "leg-99" })).ok, false);
  await run("remove_leg", { id: leg.id });
  assert.equal(plan.list().length, 0);
});

test("book_trip books every planned leg with the card and the price the visitor saw", async () => {
  const { run, desk } = setup();
  await run("plan_leg", { partner: "guesthouse", argsJson: JSON.stringify(STAY) });
  await run("plan_leg", { partner: "harbor_tours", argsJson: JSON.stringify(TRIP) });
  const out = await run("book_trip", {});
  assert.deepEqual(out.legs.map((l) => [l.status, l.code]), [["booked", "TW-ABCD"], ["booked", "HT-EFGH"]]);
  const commits = desk.calls.filter((c) => c[0] === "commit");
  assert.deepEqual(commits[0].slice(1, 3), ["guesthouse", "place_booking"]);
  assert.equal(commits[0][3].firstName, "Ana");
  assert.equal(commits[0][3].arrival, "3 pm to 5 pm");
  assert.equal(commits[0][3].expectedTotalCents, 36000);
  assert.equal(commits[1][3].expectedTotalCents, 7600);
});

test("a leg whose price changed is refused and the rest are still booked", async () => {
  const desk = fakeDesk({ bookAs: { guesthouse: { status: "refused", reason: "The price is now $380.00, not $360.00. Nothing was booked." } } });
  const { run, plan } = setup({ desk });
  await run("plan_leg", { partner: "guesthouse", argsJson: JSON.stringify(STAY) });
  await run("plan_leg", { partner: "harbor_tours", argsJson: JSON.stringify(TRIP) });
  const out = await run("book_trip", {});
  assert.deepEqual(out.legs.map((l) => l.status), ["refused", "booked"]);
  assert.match(out.legs[0].reason, /price is now/);
  assert.equal(plan.list()[0].status, "refused");
});

test("an incomplete card refuses before any partner is contacted, naming what is missing", async () => {
  const { run, desk } = setup({ card: { ...CARD, email: "", phone: "" } });
  await run("plan_leg", { partner: "harbor_tours", argsJson: JSON.stringify(TRIP) });
  const before = desk.calls.length;
  const out = await run("book_trip", {});
  assert.equal(out.ok, false);
  assert.match(out.reason, /email/);
  assert.match(out.reason, /phone/);
  assert.equal(desk.calls.length, before);
});

test("book_trip with nothing planned refuses", async () => {
  const { run } = setup();
  assert.equal((await run("book_trip", {})).ok, false);
});

test("an unknown outcome is reported and never retried", async () => {
  const desk = fakeDesk({ bookAs: { harbor_tours: { status: "unknown", reason: "No answer ... may have been booked." } } });
  const { run } = setup({ desk });
  await run("plan_leg", { partner: "harbor_tours", argsJson: JSON.stringify(TRIP) });
  const out = await run("book_trip", {});
  assert.equal(out.legs[0].status, "unknown");
  const again = await run("book_trip", {});
  assert.equal(again.ok, false);
  assert.equal(desk.calls.filter((c) => c[0] === "commit").length, 1);
});

test("no tool result ever holds the card's name, email or phone", async () => {
  const { run } = setup();
  const results = [];
  results.push(await run("list_partners", {}));
  results.push(await run("plan_leg", { partner: "guesthouse", argsJson: JSON.stringify(STAY) }));
  results.push(await run("plan_leg", { partner: "harbor_tours", argsJson: JSON.stringify(TRIP) }));
  results.push(await run("get_itinerary", {}));
  results.push(await run("book_trip", {}));
  const text = JSON.stringify(results);
  for (const secret of SECRETS) {
    assert.ok(!text.includes(secret), secret);
  }
});
