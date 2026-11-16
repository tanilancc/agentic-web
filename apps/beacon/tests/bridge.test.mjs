// Tests for the action bridge checks and probes.

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { ExampleWeb } from "../../../tests/linking/example_web.mjs";
import { bridgeChecks, browserBridgeProbe, nodeBridgeProbe } from "../js/checks/bridge.js";
import { NodeReader } from "../js/checks/reader.js";
import { FakeWeb } from "./fake_web.mjs";
import { goodSnapshot, runCheck } from "./snapshots.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PARTNER = path.resolve(HERE, "../../../tests/linking/fixtures/partner_site");

/**
 * A good snapshot whose manifest declares actions with a bridge.
 */
function withActions(actions = { version: 1, bridge: "./bridge/action-bridge.html" }) {
  const s = goodSnapshot();
  s.manifest.actions = actions;
  return s;
}

/**
 * An environment whose probe returns a fixed result and counts its calls.
 */
function probeEnv(result) {
  const env = { calls: [], bridgeProbe: async (url) => { env.calls.push(url); return result; } };
  return env;
}

test("ids and groups", () => {
  assert.deepEqual(bridgeChecks.map((check) => check.id), ["act.bridge-loads", "act.bridge-catalog"]);
  assert.ok(bridgeChecks.every((check) => check.group === "Actions and bridge" && !check.must));
});

test("both checks are not applicable when the site declares no actions", async () => {
  const env = probeEnv({ loaded: true, catalog: [], error: "" });
  for (const check of bridgeChecks) {
    assert.equal((await check.run(goodSnapshot(), env)).status, "na", check.id);
  }
  assert.equal(env.calls.length, 0);
});

test("act.bridge-loads fails when the manifest names no bridge", async () => {
  const o = await runCheck(bridgeChecks, "act.bridge-loads", withActions({ version: 1 }), probeEnv({ loaded: true, catalog: [], error: "" }));
  assert.equal(o.status, "fail");
  assert.match(o.evidence, /actions\.bridge/);
});

test("act.bridge-loads fails on a bridge on another origin without probing it", async () => {
  const env = probeEnv({ loaded: true, catalog: [], error: "" });
  const o = await runCheck(bridgeChecks, "act.bridge-loads", withActions({ version: 1, bridge: "https://evil.example/b.html" }), env);
  assert.equal(o.status, "fail");
  assert.equal(env.calls.length, 0);
});

test("act.bridge-loads passes and probes the resolved bridge URL once for both checks", async () => {
  const env = probeEnv({ loaded: true, catalog: [], error: "" });
  const s = withActions();
  assert.equal((await runCheck(bridgeChecks, "act.bridge-loads", s, env)).status, "pass");
  assert.equal((await runCheck(bridgeChecks, "act.bridge-catalog", s, env)).status, "pass");
  assert.deepEqual(env.calls, ["https://site.example/bridge/action-bridge.html"]);
});

test("act.bridge-loads fails with the probe's reason", async () => {
  const o = await runCheck(bridgeChecks, "act.bridge-loads", withActions(), probeEnv({ loaded: false, catalog: null, error: "X-Frame-Options forbids framing" }));
  assert.equal(o.status, "fail");
  assert.match(o.evidence, /X-Frame-Options/);
});

test("act.bridge-catalog lists exposed actions with their effects", async () => {
  const catalog = [{ name: "search_rooms", effect: "read", availability: "bridge" }, { name: "place_booking", effect: "irreversible", availability: "top-level" }];
  const o = await runCheck(bridgeChecks, "act.bridge-catalog", withActions(), probeEnv({ loaded: true, catalog, error: "" }));
  assert.equal(o.status, "pass");
  assert.match(o.evidence, /search_rooms \(read\)/);
  assert.match(o.evidence, /place_booking \(irreversible\)/);
});

test("act.bridge-catalog warns on a write that does not need its own window", async () => {
  const catalog = [{ name: "add_to_cart", effect: "write", availability: "bridge" }];
  const o = await runCheck(bridgeChecks, "act.bridge-catalog", withActions(), probeEnv({ loaded: true, catalog, error: "" }));
  assert.equal(o.status, "warn");
  assert.match(o.evidence, /add_to_cart/);
});

test("act.bridge-catalog is not applicable when the catalog cannot be read", async () => {
  const o = await runCheck(bridgeChecks, "act.bridge-catalog", withActions(), probeEnv({ loaded: true, catalog: null, error: "" }));
  assert.equal(o.status, "na");
});

test("act.bridge-catalog ignores catalog entries of the wrong shape", async () => {
  const catalog = [null, 5, { name: "<b>x</b>", effect: "read", availability: "bridge" }];
  const o = await runCheck(bridgeChecks, "act.bridge-catalog", withActions(), probeEnv({ loaded: true, catalog, error: "" }));
  assert.equal(o.status, "pass");
});

test("the browser probe reads the partner fixture's empty catalog and removes its frame", async () => {
  const web = new ExampleWeb(null, "http://127.0.0.1:8791", "sk-test-not-a-real-key");
  web.serve("http://localhost:8081", PARTNER);
  web.install();
  try {
    const result = await browserBridgeProbe("http://localhost:8081/bridge/action-bridge.html");
    assert.deepEqual(result, { loaded: true, catalog: [], error: "" });
    assert.equal(web.frames.length, 1);
    assert.equal(web.frames[0].removed, true);
  } finally {
    web.restore();
  }
});

test("the browser probe never falls back to a popup and reports the failure", async () => {
  const calls = [];
  class FailingClient {
    constructor(url) { this.url = url; }
    async connect(popup) { calls.push(popup); throw new Error("Action bridge unavailable."); }
    dispose() { calls.push("disposed"); }
  }
  const result = await browserBridgeProbe("https://x.example/bridge/action-bridge.html", { ClientClass: FailingClient });
  assert.equal(result.loaded, false);
  assert.equal(result.catalog, null);
  assert.match(result.error, /unavailable/);
  assert.deepEqual(calls, [false, "disposed"]);
});

test("the Node probe reads framing headers", async () => {
  const web = new FakeWeb();
  web.put("https://a.example/bridge/action-bridge.html", { body: "<html></html>" });
  web.put("https://b.example/bridge/action-bridge.html", { body: "<html></html>", headers: { "x-frame-options": "DENY" } });
  web.put("https://c.example/bridge/action-bridge.html", { body: "<html></html>", headers: { "content-security-policy": "default-src 'self'; frame-ancestors 'none'" } });
  const probe = nodeBridgeProbe(new NodeReader({ fetchImpl: web.fetch }));
  assert.deepEqual(await probe("https://a.example/bridge/action-bridge.html"), { loaded: true, catalog: null, error: "" });
  assert.equal((await probe("https://b.example/bridge/action-bridge.html")).loaded, false);
  assert.match((await probe("https://c.example/bridge/action-bridge.html")).error, /frame-ancestors/);
  assert.equal((await probe("https://missing.example/bridge/action-bridge.html")).loaded, false);
});
