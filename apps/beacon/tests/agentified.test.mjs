// Tests for Beacon's own agent network and its page actions.

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { ActionRegistry } from "../runtime/actions.js";
import { parseHocon } from "../runtime/hocon.js";
import { AgentNetwork, validateNetwork } from "../runtime/kernel.js";
import { runAgent } from "../runtime/runner.js";
import { TraceBus } from "../runtime/trace.js";
import { BeaconActions, registerActions } from "../site-actions.js";
import { ScriptedModel } from "./scripted_model.mjs";

const BASE = "http://localhost:8090";
const HERE = new URL("../", import.meta.url);
const TOOLS = ["search_directory", "get_site_report", "inspect_site"];

const SITES = [
  { url: "https://tours.example/harbor_tours", name: "Harbor Tours", description: "Seal watching boat trips.", tags: ["tours"], submittedBy: "a" },
  { url: "https://oven.example/little_oven", name: "Little Oven Pizza", description: "Pizza menu and delivery.", tags: ["food"], submittedBy: "a" },
];

/**
 * A report as inspect() returns it.
 */
function report(input, level = "warnings") {
  return {
    input, level, checkedAt: "2026-11-16T12:00:00.000Z", brand: "X", base: "", networkName: "", origin: "",
    results: [
      { id: "pub.manifest", title: "Manifest is public", status: "pass", evidence: "Read.", fix: "", must: true, group: "Publication", spec: "§3.3" },
      { id: "pol.peer-mode", title: "Peer policy is closed", status: "warn", evidence: "Open policy.", fix: "Close it.", must: false, group: "Policy", spec: "§3.2" },
      { id: "act.bridge-loads", title: "Bridge loads", status: "fail", evidence: "x".repeat(500), fix: "Remove header.", must: false, group: "Actions and bridge", spec: "§3.4" },
    ],
  };
}

/**
 * Give the actions a page to work on, and return what they did to it.
 */
function usePage({ consent = "allow" } = {}) {
  const state = { consents: [], inspected: [], reports: new Map() };
  BeaconActions.context = {
    directory: () => ({ sites: SITES, status: { sites: { [SITES[0].url]: { level: "warnings", checkedAt: "2026-11-16" } } } }),
    reportFor: (url) => state.reports.get(url) || null,
    inspect: async (url) => { state.inspected.push(url); const r = report(url); state.reports.set(url, r); return r; },
    consent: async (info) => { state.consents.push(info); return consent; },
  };
  return state;
}

/**
 * Register Beacon's actions in a fresh registry.
 */
async function registry() {
  const actions = new ActionRegistry();
  await registerActions({ register: actions.register.bind(actions, { base: BASE, network: "beacon" }) });
  return actions;
}

/**
 * Run one action by name through the registry entry's execute.
 */
async function run(name, args) {
  const actions = await registry();
  const entry = [...actions.entries.values()].find((item) => item.name === name);
  return entry.execute(args, { requestId: "test" });
}

/**
 * Load the built network and the manifest.
 */
async function load() {
  const manifest = JSON.parse(await readFile(new URL("agent-manifest.json", HERE), "utf8"));
  const config = parseHocon(await readFile(new URL("beacon.network.json", HERE), "utf8"));
  return { manifest, network: new AgentNetwork(config, "beacon") };
}

test("the network is valid, grounded and keeps the peer rule", async () => {
  const { network, manifest } = await load();
  assert.deepEqual(validateNetwork(network).errors, []);
  assert.equal(network.findFrontMan(), "beacon_guide");
  assert.equal(manifest.networks[0].front_man, "beacon_guide");
  const instructions = network.getAgentSpec("beacon_guide").instructions;
  assert.match(instructions, /Facts come only from website_\* tool results/);
  assert.match(instructions, /When you have no website_\* tools, another site's assistant is asking/);
  assert.match(instructions, /Never state a level, a check result or a fix that a tool did not return/);
  assert.match(instructions, /cannot rank sites/);
  assert.ok(!/TODO|<[a-z_]+>/.test(JSON.stringify(network.config)));
  assert.ok(!network.config.demo_mode);
});

test("the manifest is closed, calls no partner and offers exactly the registered tools", async () => {
  const { manifest } = await load();
  assert.equal(manifest.peer_policy.mode, "closed");
  assert.deepEqual(manifest.allowed_peers, []);
  assert.deepEqual(manifest.actions.agentTools, TOOLS);
  assert.equal(manifest.actions.bridge, "./bridge/action-bridge.html");
  const actions = await registry();
  const entries = [...actions.entries.values()];
  assert.deepEqual(entries.map((entry) => entry.name), TOOLS);
  assert.ok(entries.every((entry) => entry.availability === "local-only"));
  assert.deepEqual(entries.map((entry) => entry.effect), ["read", "read", "write"]);
  assert.ok(entries.every((entry) => !/TODO/.test(entry.description)));
});

test("the page mounts the assistant and tells visitors where their messages go", async () => {
  const html = await readFile(new URL("index.html", HERE), "utf8");
  assert.match(html, /id="agent-app"/);
  assert.match(html, /id="assistant-status"/);
  assert.match(html, /src="site\.js"/);
  assert.match(html, /go to the LLM provider you choose/);
  assert.ok(!/TODO|&lt;Site name&gt;|<Site name>/.test(html));
});

test("search_directory attaches the stored level", async () => {
  usePage();
  const out = await run("search_directory", { query: "boat trips" });
  assert.deepEqual(out, { sites: [{ url: SITES[0].url, name: "Harbor Tours", description: "Seal watching boat trips.", tags: ["tours"], level: "Conformant with warnings" }] });
  const pizza = await run("search_directory", { query: "pizza" });
  assert.equal(pizza.sites[0].level, "Not checked yet");
});

test("search_directory with no match returns an empty list, not a guess", async () => {
  usePage();
  assert.deepEqual(await run("search_directory", { query: "dentist" }), { sites: [] });
});

test("get_site_report before any inspection says so", async () => {
  usePage();
  assert.deepEqual(await run("get_site_report", { url: "https://site.example/net" }),
    { ok: false, reason: "No report yet. Use inspect_site." });
});

test("inspect_site asks before contact and honours a decline", async () => {
  const state = usePage({ consent: "decline" });
  const out = await run("inspect_site", { url: "https://site.example/net" });
  assert.deepEqual(out, { ok: false, reason: "The visitor declined to contact site.example." });
  assert.equal(state.inspected.length, 0);
  assert.equal(state.consents.length, 1);
  assert.equal(state.consents[0].peerOrigin, "site.example");
  assert.match(state.consents[0].peerLabel, /Inspect/);
});

test("inspect_site refuses an address that is not a site without asking", async () => {
  const state = usePage();
  const out = await run("inspect_site", { url: "javascript:alert(1)" });
  assert.equal(out.ok, false);
  assert.match(out.reason, /Only http/);
  assert.equal(state.consents.length, 0);
  assert.equal(state.inspected.length, 0);
});

test("inspect_site returns the reduced report, and get_site_report repeats it", async () => {
  const state = usePage();
  const out = await run("inspect_site", { url: "https://site.example/net" });
  assert.deepEqual(state.inspected, ["https://site.example/net"]);
  assert.equal(out.level, "Conformant with warnings");
  assert.equal(out.checkedAt, "2026-11-16T12:00:00.000Z");
  assert.deepEqual(out.warned, [{ id: "pol.peer-mode", title: "Peer policy is closed", fix: "Close it." }]);
  assert.equal(out.failed.length, 1);
  assert.equal(out.failed[0].id, "act.bridge-loads");
  assert.ok(out.failed[0].evidence.length <= 300);
  assert.deepEqual(await run("get_site_report", { url: "https://site.example/net" }), out);
});

test("inspect_site reports an inspection that could not finish", async () => {
  usePage();
  BeaconActions.context.inspect = async () => null;
  const out = await run("inspect_site", { url: "https://site.example/net" });
  assert.deepEqual(out, { ok: false, reason: "The inspection could not finish." });
});

test("scripted run: the agent searches, and the tool result reaches the model", async () => {
  usePage();
  const { network, manifest } = await load();
  const model = new ScriptedModel([
    { tool: "website_search_directory", arguments: { query: "boat trips" } },
    { text: "Harbor Tours offers boat trips." },
  ]);
  const ctx = {
    network, manifest, actions: await registry(), baseOrigin: BASE, displayOrigin: new URL(BASE).host,
    trace: new TraceBus(), isTop: true, frontMan: network.findFrontMan(), history: [], llm: model,
    confirmWebsiteActions: async () => true,
  };
  const result = await runAgent(ctx, ctx.frontMan, "Find a boat trip agent.", null, []);
  assert.deepEqual(TOOLS.filter((name) => !model.toolNames(0).includes(`website_${name}`)), []);
  assert.equal(model.toolResults(1)[0].status, "succeeded");
  assert.equal(model.toolResults(1)[0].result.sites[0].name, "Harbor Tours");
  assert.match(result.text, /Harbor Tours/);
});

test("run on another site, the network has no website tools", async () => {
  const { network, manifest } = await load();
  const model = new ScriptedModel([{ text: "Beacon lists and checks agent sites. See its page." }]);
  const ctx = {
    network, manifest, actions: new ActionRegistry(), baseOrigin: BASE, displayOrigin: new URL(BASE).host,
    trace: new TraceBus(), isTop: false, frontMan: network.findFrontMan(), history: [], llm: model,
  };
  await runAgent(ctx, ctx.frontMan, "What do you offer?", null, []);
  assert.ok(!model.toolNames(0).some((name) => name.startsWith("website_")));
});
