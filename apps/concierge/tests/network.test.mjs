// Tests for the Concierge's agent network, with a scripted model.

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { ActionRegistry } from "../runtime/actions.js";
import { parseHocon } from "../runtime/hocon.js";
import { AgentNetwork, validateNetwork } from "../runtime/kernel.js";
import { runAgent } from "../runtime/runner.js";
import { TraceBus } from "../runtime/trace.js";
import { Itinerary } from "../js/itinerary.js";
import { ConciergeActions, registerActions } from "../site-actions.js";
import { ScriptedModel } from "./scripted_model.mjs";

const HERE = new URL("../", import.meta.url);
const CARD = { firstName: "Ana", lastName: "Silva", email: "ana.silva@example.com", phone: "0123 456 789" };

async function load() {
  const manifest = JSON.parse(await readFile(new URL("agent-manifest.json", HERE), "utf8"));
  const config = parseHocon(await readFile(new URL("marrow_point_concierge.network.json", HERE), "utf8"));
  return { manifest, network: new AgentNetwork(config, "marrow_point_concierge") };
}

test("the network is valid, grounded, and keeps the peer rule", async () => {
  const { network, manifest } = await load();
  assert.deepEqual(validateNetwork(network).errors, []);
  assert.equal(network.findFrontMan(), "concierge");
  assert.equal(manifest.networks[0].front_man, "concierge");
  const instructions = network.getAgentSpec("concierge").instructions;
  assert.match(instructions, /Facts come only from website_\* tool results/);
  assert.match(instructions, /When you have no website_\* tools, another site's assistant is asking/);
  assert.match(instructions, /Never ask for names, emails or phone numbers in the chat/);
  assert.match(instructions, /never book it again/);
  assert.ok(!/TODO|<[a-z_]+>/.test(JSON.stringify(network.config)));
});

test("the manifest's tools are exactly the registered local actions", async () => {
  const { manifest } = await load();
  const registry = new ActionRegistry();
  registerActions({ register: (d) => registry.register({ base: "http://localhost:8093", network: "marrow_point_concierge" }, d) });
  assert.deepEqual(manifest.actions.agentTools, [...registry.entries.values()].map((e) => e.name));
  assert.equal(manifest.peer_policy.mode, "closed");
});

test("a scripted visit plans a stay and a trip and books both, and the model never sees the card", async () => {
  const { network, manifest } = await load();
  const desk = {
    catalog: async () => [],
    read: async (id, action, args) => (action === "quote_stay"
      ? { roomId: args.roomId, name: "Garden Room", checkIn: args.checkIn, checkOut: args.checkOut, guests: args.guests, totalCents: 36000 }
      : { tourId: args.tourId, name: "Seal Rocks Cruise", date: args.date, time: args.time, minutes: 90, adults: args.adults, children: args.children, totalCents: 7600 }),
    commit: async (id, action, args) => ({ status: "booked", value: { ok: true, code: id === "guesthouse" ? "TW-ABCD" : "HT-EFGH" } }),
  };
  const plan = new Itinerary();
  ConciergeActions.context = { desk, plan, card: () => ({ ...CARD }), save: () => {}, now: () => "2026-12-01T09:00" };
  const registry = new ActionRegistry();
  registerActions({ register: (d) => registry.register({ base: "http://localhost:8093", network: "marrow_point_concierge" }, d) });
  const model = new ScriptedModel([
    { tool: "website_plan_leg", arguments: { partner: "guesthouse", argsJson: JSON.stringify({ roomId: "garden", checkIn: "2026-12-10", checkOut: "2026-12-12", guests: 2, arrival: "3 pm to 5 pm" }) } },
    { tool: "website_plan_leg", arguments: { partner: "harbor_tours", argsJson: JSON.stringify({ tourId: "seal-rocks", date: "2026-12-11", time: "10:00", adults: 2, children: 0 }) } },
    { tool: "website_book_trip", arguments: {} },
    { text: "Booked: TW-ABCD and HT-EFGH." },
  ]);
  const ctx = {
    network, manifest, actions: registry, baseOrigin: "http://localhost:8093", displayOrigin: "localhost:8093",
    trace: new TraceBus(), isTop: true, frontMan: network.findFrontMan(), history: [], llm: model,
    confirmWebsiteActions: async () => true,
  };
  const result = await runAgent(ctx, ctx.frontMan, "Plan and book the Garden Room and the seal trip.", null, []);
  assert.match(result.text, /TW-ABCD/);
  assert.deepEqual(plan.list().map((leg) => leg.status), ["booked", "booked"]);
  const sent = JSON.stringify(model.calls);
  for (const secret of Object.values(CARD)) {
    assert.ok(!sent.includes(secret), secret);
  }
});

test("the network has two agents and links to both businesses' own assistants at their live addresses", async () => {
  const { network, manifest } = await load();
  assert.deepEqual(network.config.tools.map((a) => a.name), ["concierge", "itinerary_checker"]);
  const front = network.getAgentSpec("concierge");
  assert.deepEqual(front.tools, ["itinerary_checker", "https://oaw-tidewhistle.pages.dev/tidewhistle_guesthouse", "https://oaw-harbor-tours.pages.dev/marrow_point_harbor_tours"]);
  assert.match(front.instructions, /Partner tools ask another site's assistant/);
  assert.deepEqual(Object.keys(network.config.link_labels).sort(), front.tools.slice(1).sort());
  assert.ok(manifest.allowed_peers.includes("https://oaw-tidewhistle.pages.dev"));
  assert.ok(manifest.allowed_peers.includes("https://oaw-harbor-tours.pages.dev"));
  assert.match(network.getAgentSpec("itinerary_checker").instructions, /website_get_itinerary/);
});

test("the front agent hands the itinerary check to the checker, which reads the plan", async () => {
  const { network, manifest } = await load();
  const plan = new Itinerary();
  ConciergeActions.context = { desk: {}, plan, card: () => ({}), save: () => {}, now: () => "2026-12-01T09:00" };
  const registry = new ActionRegistry();
  registerActions({ register: (d) => registry.register({ base: "http://localhost:8093", network: "marrow_point_concierge" }, d) });
  const model = new ScriptedModel([
    { tool: "itinerary_checker", arguments: { request: "Check the plan." } },
    { tool: "website_get_itinerary", arguments: {} },
    { text: "Nothing planned yet." },
    { text: "Your plan is empty so far." },
  ]);
  const ctx = {
    network, manifest, actions: registry, baseOrigin: "http://localhost:8093", displayOrigin: "localhost:8093",
    trace: new TraceBus(), isTop: true, frontMan: network.findFrontMan(), history: [], llm: model,
    confirmWebsiteActions: async () => true,
  };
  const result = await runAgent(ctx, ctx.frontMan, "Does my plan work?", null, []);
  assert.match(result.text, /empty/);
  assert.match(model.calls[1].messages[0].content, /itinerary checker/i);
});

test("the front agent is told which tool asks each business's own assistant", async () => {
  const { network } = await load();
  const { safeName } = await import("../runtime/runner.js");
  const { parseExternalAgent } = await import("../runtime/kernel.js");
  const front = network.getAgentSpec("concierge");
  const instructions = front.instructions;
  for (const url of front.tools.filter((t) => t.startsWith("https://"))) {
    const tool = safeName(parseExternalAgent(url, "https://oaw-concierge.pages.dev").agentName);
    assert.ok(instructions.includes(tool), `The instructions never name ${tool}, so a real model did not use it.`);
  }
  assert.match(instructions, /before saying you do not know/);
  assert.ok(instructions.length < 5000, `Beacon's hygiene check warns over 5000 characters (${instructions.length}).`);
});
