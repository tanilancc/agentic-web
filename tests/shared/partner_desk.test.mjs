// Tests for PartnerDesk, the caller's side of the town's partner desks.

import assert from "node:assert/strict";
import test from "node:test";
import { validateData } from "../../skills/agentify-website/runtime/actions.js";
import { PartnerDesk } from "../../apps/shared/partner-desk.js";

const CATALOG = [
  { name: "search_rooms", effect: "read", availability: "bridge", inputSchema: { type: "object", additionalProperties: false, required: ["guests"], properties: { guests: { type: "integer", minimum: 1 } } } },
  { name: "place_booking", effect: "irreversible", availability: "top-level", inputSchema: { type: "object", additionalProperties: false, required: ["guests"], properties: { guests: { type: "integer", minimum: 1 } } } },
];

/**
 * A stand-in for the runtime's ActionBridgeClient. `script` decides what each step does.
 */
function clientClass(script = {}) {
  const log = { connects: [], executes: [], disposed: 0 };
  class Client {
    constructor(url) { this.url = url; }
    async connect(popup) {
      log.connects.push({ url: this.url, popup });
      if (popup && script.popup === "cancel") throw new Error("Action window cancelled; action not started.");
    }
    async request(type, payload) {
      if (type === "catalog") return CATALOG;
      log.executes.push(payload);
      const step = script[payload.name];
      if (step === "hang") return new Promise(() => {});
      if (step === "close") throw new Error("Action bridge closed; outcome unknown.");
      if (step === "decline") throw new Error("User declined; action not started.");
      if (typeof step === "function") return step(payload.args);
      return { ok: true, code: "TW-1234" };
    }
    dispose() { log.disposed += 1; }
  }
  return { Client, log };
}

const PARTNERS = [{ id: "guesthouse", label: "Tidewhistle Guesthouse", origin: "http://127.0.0.1:8080", bridgeUrl: "http://127.0.0.1:8080/partner-desk/action-bridge.html" }];

function desk({ script, decision = "allow", ...options } = {}) {
  const { Client, log } = clientClass(script);
  const cards = [];
  const d = new PartnerDesk({
    partners: PARTNERS, ClientClass: Client, validate: validateData,
    consent: async (info) => { cards.push(info); return decision; }, ...options,
  });
  return { d, log, cards };
}

test("a bridge on another origin than its partner is refused at construction", () => {
  assert.throws(() => new PartnerDesk({ partners: [{ ...PARTNERS[0], bridgeUrl: "https://evil.example/b.html" }], ClientClass: class {}, validate: validateData, consent: async () => "allow" }), /origin/);
});

test("the visitor is asked once per partner origin, before any contact", async () => {
  const { d, log, cards } = desk();
  await d.read("guesthouse", "search_rooms", { guests: 2 });
  await d.read("guesthouse", "search_rooms", { guests: 3 });
  assert.equal(cards.length, 1);
  assert.equal(cards[0].peerOrigin, "127.0.0.1:8080");
  assert.equal(cards[0].peerLabel, "Tidewhistle Guesthouse");
  assert.equal(log.executes.length, 2);
});

test("a decline contacts nothing", async () => {
  const { d, log } = desk({ decision: "decline" });
  const out = await d.read("guesthouse", "search_rooms", { guests: 2 });
  assert.deepEqual(out, { ok: false, reason: "The visitor declined to contact 127.0.0.1:8080." });
  assert.equal(log.connects.length, 0);
});

test("an unknown partner and a non-read action are refused", async () => {
  const { d, log } = desk();
  assert.match((await d.read("nobody", "search_rooms", {})).reason, /No partner named/);
  assert.match((await d.read("guesthouse", "place_booking", { guests: 2 })).reason, /not a read/);
  assert.match((await d.read("guesthouse", "missing_action", {})).reason, /does not offer/);
  assert.equal(log.executes.length, 0);
});

test("invalid arguments are refused before anything is sent", async () => {
  const { d, log } = desk();
  const out = await d.read("guesthouse", "search_rooms", { guests: 0 });
  assert.equal(out.ok, false);
  assert.match(out.reason, /guests/);
  assert.equal(log.executes.length, 0);
});

test("a read that never answers ends with a reason", async () => {
  const { d } = desk({ script: { search_rooms: "hang" }, readTimeoutMs: 30 });
  const out = await d.read("guesthouse", "search_rooms", { guests: 2 });
  assert.deepEqual(out, { ok: false, reason: "Tidewhistle Guesthouse did not answer in time." });
});

test("a booking runs in the partner's own window and returns its code", async () => {
  const { d, log } = desk();
  const out = await d.commit("guesthouse", "place_booking", { guests: 2 });
  assert.deepEqual(out, { status: "booked", value: { ok: true, code: "TW-1234" } });
  assert.deepEqual(log.connects.map((c) => c.popup), [false, true]);
});

test("a booking the partner refuses is refused, with its reason", async () => {
  const { d } = desk({ script: { place_booking: () => ({ ok: false, reason: "The price is now $10.00." }) } });
  assert.deepEqual(await d.commit("guesthouse", "place_booking", { guests: 2 }), { status: "refused", reason: "The price is now $10.00." });
});

test("cancelling before anything was sent is declined", async () => {
  for (const script of [{ popup: "cancel" }, { place_booking: "decline" }]) {
    const { d } = desk({ script });
    assert.equal((await d.commit("guesthouse", "place_booking", { guests: 2 })).status, "declined");
  }
});

test("a window closed or silent after the request was sent is unknown, and never retried", async () => {
  for (const [script, extra] of [[{ place_booking: "close" }, {}], [{ place_booking: "hang" }, { commitTimeoutMs: 30 }]]) {
    const { d, log } = desk({ script, ...extra });
    const out = await d.commit("guesthouse", "place_booking", { guests: 2 });
    assert.equal(out.status, "unknown");
    assert.match(out.reason, /may have been booked/);
    assert.equal(log.executes.filter((e) => e.name === "place_booking").length, 1);
  }
});

test("a commit must not be a read, and its arguments are checked first", async () => {
  const { d, log } = desk();
  assert.equal((await d.commit("guesthouse", "search_rooms", { guests: 2 })).status, "refused");
  assert.equal((await d.commit("guesthouse", "place_booking", { guests: "two" })).status, "refused");
  assert.equal(log.executes.length, 0);
});

test("every client is disposed", async () => {
  const { d, log } = desk();
  await d.read("guesthouse", "search_rooms", { guests: 2 });
  await d.commit("guesthouse", "place_booking", { guests: 2 });
  assert.equal(log.disposed, log.connects.length);
});
