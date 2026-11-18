// Tests for the validity, policy and hygiene checks.

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { hygieneChecks } from "../js/checks/hygiene.js";
import { policyChecks } from "../js/checks/policy.js";
import { publicationChecks } from "../js/checks/publication.js";
import { NodeReader } from "../js/checks/reader.js";
import { readSnapshot } from "../js/checks/snapshot.js";
import { validityChecks } from "../js/checks/validity.js";
import { FakeWeb } from "./fake_web.mjs";
import { goodSnapshot, runCheck } from "./snapshots.mjs";

const ALL = [...validityChecks, ...policyChecks, ...hygieneChecks];
const run = (id, snapshot) => runCheck(ALL, id, snapshot);

/**
 * A good snapshot whose network file text is replaced.
 */
function withNetworkText(text) {
  const s = goodSnapshot();
  s.files.network.text = text;
  return s;
}

/**
 * A good snapshot whose first agent has the given instructions.
 */
function withInstructions(text) {
  const s = goodSnapshot();
  s.networkConfig.tools[0].instructions = text;
  return s;
}

test("ids, groups and musts are as designed", () => {
  assert.deepEqual(ALL.map((check) => check.id), [
    "net.valid", "net.front-agent", "net.descriptions", "net.schemas",
    "pol.peer-mode", "pol.allowed-peers", "pol.link-labels",
    "hyg.secrets", "hyg.instruction-size", "hyg.demo-mode", "hyg.default-model"]);
  assert.deepEqual(ALL.filter((check) => check.must).map((check) => check.id),
    ["net.valid", "net.front-agent", "pol.allowed-peers", "hyg.secrets"]);
  assert.deepEqual([...new Set(ALL.map((check) => check.group))], ["Network validity", "Policy", "Hygiene"]);
});

test("a good site passes every check", async () => {
  for (const check of ALL) {
    assert.equal((await check.run(goodSnapshot(), {})).status, "pass", check.id);
  }
});

test("network checks are not applicable without a network", async () => {
  const s = goodSnapshot();
  s.networkConfig = null;
  s.validation = null;
  for (const id of ["net.valid", "net.front-agent", "net.descriptions", "net.schemas", "pol.allowed-peers", "pol.link-labels", "hyg.instruction-size", "hyg.demo-mode", "hyg.default-model"]) {
    const o = await run(id, s);
    assert.equal(o.status, "na", id);
    assert.equal(o.evidence, "not checked: pub.network-file failed", id);
  }
});

test("net.valid reports the runtime's validation errors", async () => {
  const s = goodSnapshot();
  s.validation.errors = ["Agent 'guide' references missing tool 'ghost'."];
  const o = await run("net.valid", s);
  assert.equal(o.status, "fail");
  assert.match(o.evidence, /ghost/);
});

test("net.front-agent fails when the front agent is not in the network", async () => {
  const s = goodSnapshot();
  s.entry = { ...s.entry, front_man: "nobody" };
  const o = await run("net.front-agent", s);
  assert.equal(o.status, "fail");
  assert.match(o.evidence, /nobody/);
});

test("net.descriptions and net.schemas name the agents that lack them", async () => {
  const s = goodSnapshot();
  delete s.networkConfig.tools[1].function.description;
  delete s.networkConfig.tools[1].function.parameters;
  const d = await run("net.descriptions", s);
  assert.equal(d.status, "warn");
  assert.match(d.evidence, /lodging/);
  assert.ok(!d.evidence.includes("guide"));
  assert.equal((await run("net.schemas", s)).status, "warn");
});

test("pol.peer-mode warns on an open or absent policy", async () => {
  const open = goodSnapshot();
  open.manifest.peer_policy = { mode: "open" };
  assert.equal((await run("pol.peer-mode", open)).status, "warn");
  const absent = goodSnapshot();
  delete absent.manifest.peer_policy;
  assert.equal((await run("pol.peer-mode", absent)).status, "warn");
});

test("pol.allowed-peers compares origins, not URLs", async () => {
  const s = goodSnapshot();
  s.validation.externals = ["https://p.example/a/net"];
  s.manifest.allowed_peers = ["https://p.example"];
  assert.equal((await run("pol.allowed-peers", s)).status, "pass");
});

test("pol.allowed-peers fails on a peer and an MCP server that are not allowed", async () => {
  const s = goodSnapshot();
  s.validation.externals = ["https://p.example/net"];
  s.validation.mcps = ["https://tools.example/mcp"];
  s.manifest.allowed_peers = ["https://other.example"];
  const o = await run("pol.allowed-peers", s);
  assert.equal(o.status, "fail");
  assert.match(o.evidence, /https:\/\/p\.example/);
  assert.match(o.evidence, /https:\/\/tools\.example/);
});

test("pol.allowed-peers passes under an open policy and ignores the site's own origin", async () => {
  const open = goodSnapshot();
  open.validation.externals = ["https://p.example/net"];
  open.manifest.peer_policy = { mode: "open" };
  assert.equal((await run("pol.allowed-peers", open)).status, "pass");
  const own = goodSnapshot();
  own.validation.externals = ["https://site.example/other_net"];
  assert.equal((await run("pol.allowed-peers", own)).status, "pass");
});

test("pol.allowed-peers survives a malformed allowed_peers entry", async () => {
  const s = goodSnapshot();
  s.validation.externals = ["https://p.example/net"];
  s.manifest.allowed_peers = [42, "not a url", "https://p.example/"];
  assert.equal((await run("pol.allowed-peers", s)).status, "pass");
});

test("pol.link-labels warns on a partner with no label", async () => {
  const s = goodSnapshot();
  s.validation.externals = ["https://p.example/net"];
  const o = await run("pol.link-labels", s);
  assert.equal(o.status, "warn");
  assert.match(o.evidence, /https:\/\/p\.example\/net/);
  s.networkConfig.link_labels = { "https://p.example/net": "Partner" };
  assert.equal((await run("pol.link-labels", s)).status, "pass");
});

test("hyg.secrets never echoes the secret", async () => {
  const o = await run("hyg.secrets", withNetworkText('"key": "sk-abcdefghijklmnopqrstuvwxyz123456"'));
  assert.equal(o.status, "fail");
  assert.ok(!o.evidence.includes("ghijkl"));
  assert.match(o.evidence, /sk-abc/);
  assert.match(o.evidence, /guide_net\.network\.json/);
  assert.match(o.evidence, /openai-style/);
});

test("hyg.secrets ignores the repo's test key", async () => {
  assert.equal((await run("hyg.secrets", withNetworkText("sk-test-not-a-real-key"))).status, "pass");
});

test("hyg.secrets finds each kind of credential", async () => {
  const samples = {
    otari: "otk_abcdefghijklmnop1234",
    aws: "AKIAABCDEFGHIJKLMNOP",
    github: "ghp_abcdefghijklmnopqrstuvwxyz0123456789",
    bearer: "Bearer abcdefghijklmnopqrstuvwxyz",
  };
  for (const [name, text] of Object.entries(samples)) {
    const o = await run("hyg.secrets", withNetworkText(text));
    assert.equal(o.status, "fail", name);
    assert.match(o.evidence, new RegExp(name));
  }
});

test("hyg.secrets scans the manifest too", async () => {
  const s = goodSnapshot();
  s.files.manifest.text = '{"token":"otk_abcdefghijklmnop1234"}';
  assert.match((await run("hyg.secrets", s)).evidence, /agent-manifest\.json/);
});

test("hyg.instruction-size warns above 5000 characters", async () => {
  assert.equal((await run("hyg.instruction-size", withInstructions("x".repeat(5000)))).status, "pass");
  const o = await run("hyg.instruction-size", withInstructions("x".repeat(5001)));
  assert.equal(o.status, "warn");
  assert.match(o.evidence, /guide.*5001/);
});

test("hyg.demo-mode accepts a prohibition", async () => {
  assert.equal((await run("hyg.demo-mode", withInstructions("Never invent prices."))).status, "pass");
  assert.equal((await run("hyg.demo-mode", withInstructions("Do not make up availability. Use tools."))).status, "pass");
  assert.equal((await run("hyg.demo-mode", withInstructions("If data is missing, make up a plausible price."))).status, "warn");
  assert.equal((await run("hyg.demo-mode", withInstructions("Never guess. If asked, simulate a result that looks real."))).status, "warn");
});

test("hyg.demo-mode warns on a demo_mode setting", async () => {
  const s = goodSnapshot();
  s.networkConfig.demo_mode = true;
  assert.equal((await run("hyg.demo-mode", s)).status, "warn");
});

test("hyg.default-model warns when no model is named", async () => {
  const s = goodSnapshot();
  delete s.networkConfig.llm_config;
  const o = await run("hyg.default-model", s);
  assert.equal(o.status, "warn");
  for (const agent of s.networkConfig.tools) {
    agent.llm_config = { model_name: "m" };
  }
  assert.equal((await run("hyg.default-model", s)).status, "pass");
});

test("checks survive agents of the wrong shape", async () => {
  const s = goodSnapshot();
  s.networkConfig.tools = [null, "text", { name: 5 }, { name: "ok", function: "nope", instructions: 7 }];
  for (const check of ALL) {
    await check.run(s, {});
  }
});

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EXAMPLES = path.resolve(HERE, "../../../examples");
for (const [folder, network] of [
  ["guesthouse_agentified", "tidewhistle_guesthouse"],
  ["harbor_tours_agentified", "marrow_point_harbor_tours"],
  ["pizza_restaurant_agentified", "pizza_restaurant_website_assistant"],
]) {
  test(`no check throws on examples/${folder}`, async () => {
    const web = new FakeWeb();
    web.serve("https://example.test", path.join(EXAMPLES, folder));
    const snapshot = await readSnapshot(`https://example.test/${network}`, new NodeReader({ fetchImpl: web.fetch }));
    assert.ok(snapshot.networkConfig, "the example's network was read");
    for (const check of [...publicationChecks, ...ALL]) {
      const o = await check.run(snapshot, {});
      assert.ok(["pass", "warn", "fail", "na"].includes(o.status), check.id);
    }
  });
}
