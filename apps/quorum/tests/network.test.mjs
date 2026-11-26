// Tests for Quorum's agent network, with a scripted model and vendors' real pricing.

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { ActionRegistry } from "../runtime/actions.js";
import { parseHocon } from "../runtime/hocon.js";
import { AgentNetwork, validateNetwork } from "../runtime/kernel.js";
import { runAgent } from "../runtime/runner.js";
import { TraceBus } from "../runtime/trace.js";
import { quote } from "../shared/vendor-pricing.js";
import { CATALOG as LITTLE_OVEN } from "../../market/little_oven/catalog.js";
import { CATALOG as GREEN_FORK } from "../../market/green_fork/catalog.js";
import { CATALOG as BAKEHOUSE } from "../../market/harbour_bakehouse/catalog.js";
import { Award } from "../js/award.js";
import { QuorumActions, registerActions } from "../site-actions.js";
import { ScriptedModel } from "./scripted_model.mjs";

const HERE = new URL("../", import.meta.url);
const CATALOGS = { little_oven: LITTLE_OVEN, green_fork: GREEN_FORK, harbour_bakehouse: BAKEHOUSE };
const CARD = { firstName: "Ana", lastName: "Silva", email: "ana.silva@example.com", phone: "0123 456 789" };

async function load() {
  const manifest = JSON.parse(await readFile(new URL("agent-manifest.json", HERE), "utf8"));
  const config = parseHocon(await readFile(new URL("quorum_procurement.network.json", HERE), "utf8"));
  return { manifest, network: new AgentNetwork(config, "quorum_procurement") };
}

test("the network is valid, grounded, and keeps the peer rule", async () => {
  const { network, manifest } = await load();
  assert.deepEqual(validateNetwork(network).errors, []);
  assert.equal(network.findFrontMan(), "procurement_lead");
  assert.equal(manifest.networks[0].front_man, "procurement_lead");
  const instructions = network.getAgentSpec("procurement_lead").instructions;
  assert.match(instructions, /Facts come only from website_\* tool results/);
  assert.match(instructions, /Only the checker decides whether a plan meets the mandate/);
  assert.match(instructions, /When you have no website_\* tools, another site's assistant is asking/);
  assert.ok(!/TODO|<[a-z_]+>|[Cc]oncierge/.test(JSON.stringify(network.config)));
});

test("a scripted visit sets the mandate, finds the best plan, places it, and the model never sees the card", async () => {
  const { network, manifest } = await load();
  const state = { mandate: { date: "2026-12-10", headcount: 30, vegetarian: 6, vegan: 3, glutenFree: 4, budgetCents: 80000, from: "17:00", to: "18:00", flexMinutes: 30, pickupAllowed: false }, search: null, award: new Award() };
  QuorumActions.context = {
    desk: {
      read: async (id, action, args) => (action === "get_catalog" ? CATALOGS[id] : quote(CATALOGS[id], args, "2026-12-01T09:00")),
      commit: async (id) => ({ status: "booked", value: { ok: true, code: `${CATALOGS[id].codePrefix}-AB12` } }),
    },
    getMandate: () => state.mandate, setMandate: (m) => { state.mandate = m; },
    getSearch: () => state.search, setSearch: (s) => { state.search = s; },
    award: () => state.award, card: () => ({ ...CARD }), save: () => {},
  };
  const registry = new ActionRegistry();
  registerActions({ register: (d) => registry.register({ base: "http://localhost:8094", network: "quorum_procurement" }, d) });
  const model = new ScriptedModel([
    { tool: "website_set_mandate", arguments: { headcount: 30 } },
    { tool: "website_find_best_plan", arguments: {} },
    { tool: "website_place_award", arguments: { plan: 0 } },
    { text: "Ordered." },
  ]);
  const ctx = {
    network, manifest, actions: registry, baseOrigin: "http://localhost:8094", displayOrigin: "localhost:8094",
    trace: new TraceBus(), isTop: true, frontMan: network.findFrontMan(), history: [], llm: model,
    confirmWebsiteActions: async () => true,
  };
  await runAgent(ctx, ctx.frontMan, "Find the best plan and order it.", null, []);
  assert.ok(state.award.list().length >= 1);
  assert.ok(state.award.list().every((o) => o.status === "booked"));
  const sent = JSON.stringify(model.calls);
  for (const secret of Object.values(CARD)) {
    assert.ok(!sent.includes(secret), secret);
  }
});

test("the network has two agents, and the plan auditor checks plans with the checker", async () => {
  const { network, manifest } = await load();
  assert.deepEqual(network.config.tools.map((a) => a.name), ["procurement_lead", "plan_auditor"]);
  assert.deepEqual(network.getAgentSpec("procurement_lead").tools, ["plan_auditor"]);
  const auditor = network.getAgentSpec("plan_auditor").instructions;
  assert.match(auditor, /website_check_plan/);
  assert.match(auditor, /never call a plan acceptable that the checker rejects/i);
  const state = { mandate: { date: "2026-12-10", headcount: 12, vegetarian: 6, vegan: 0, glutenFree: 6, budgetCents: 100000, from: "17:00", to: "18:00", flexMinutes: 30, pickupAllowed: false }, search: null, award: new Award() };
  QuorumActions.context = {
    desk: { read: async (id, action, args) => (action === "get_catalog" ? CATALOGS[id] : quote(CATALOGS[id], args, "2026-12-01T09:00")) },
    getMandate: () => state.mandate, setMandate: (m) => { state.mandate = m; }, getSearch: () => state.search, setSearch: (s) => { state.search = s; },
    award: () => state.award, card: () => ({}), save: () => {},
  };
  const registry = new ActionRegistry();
  registerActions({ register: (d) => registry.register({ base: "http://localhost:8094", network: "quorum_procurement" }, d) });
  const ordersJson = JSON.stringify([{ vendor: "harbour_bakehouse", time: "17:00", fulfilment: "delivery", items: [{ id: "gf-platter", qty: 1 }, { id: "classic-platter", qty: 1 }] }]);
  const model = new ScriptedModel([
    { tool: "plan_auditor", arguments: { request: `Check this plan: ${ordersJson}` } },
    { tool: "website_check_plan", arguments: { ordersJson } },
    { text: "It fails: some people would have nothing suitable." },
    { text: "That plan does not feed everyone." },
  ]);
  const ctx = {
    network, manifest, actions: registry, baseOrigin: "http://localhost:8094", displayOrigin: "localhost:8094",
    trace: new TraceBus(), isTop: true, frontMan: network.findFrontMan(), history: [], llm: model,
    confirmWebsiteActions: async () => true,
  };
  await runAgent(ctx, ctx.frontMan, "Is the two-platter plan fine?", null, []);
  assert.match(model.calls[1].messages[0].content, /plan auditor/i);
  assert.equal(model.toolResults(2)[0].result.ok, false);
});

test("any question whether an order or plan would work goes to the plan auditor, even for one vendor", async () => {
  const { network } = await load();
  const instructions = network.getAgentSpec("procurement_lead").instructions;
  assert.match(instructions, /Whenever the visitor asks whether an order or plan would work, even one order from one vendor, ask plan_auditor/);
  assert.match(instructions, /Never judge a plan yourself, even from a quote/);
  assert.doesNotMatch(instructions, /For a "what if" about one vendor, call website_request_quote/, "This rule led a real model to judge a plan itself.");
  assert.ok(instructions.length < 5000);
});

test("money reaches the visitor in dollars, never in cents", async () => {
  const { network } = await load();
  const instructions = network.getAgentSpec("procurement_lead").instructions;
  assert.match(instructions, /Always show money to the visitor in dollars, such as \$131\.99, never in cents\./);
});
