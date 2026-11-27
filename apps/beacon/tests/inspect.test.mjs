// Tests for the level rules, the inspect function and the command line.

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { nodeBridgeProbe } from "../js/checks/bridge.js";
import { allChecks } from "../js/checks/catalog.js";
import { inspect } from "../js/checks/inspect.js";
import { LEVEL_LABELS, levelOf } from "../js/checks/level.js";
import { NodeReader } from "../js/checks/reader.js";
import { BeaconCheck } from "../../../tools/beacon_check.mjs";
import { FakeWeb } from "./fake_web.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PARTNER = path.resolve(HERE, "../../../tests/linking/fixtures/partner_site");
const r = (status, must) => ({ status, must });

/**
 * An environment that reads the linking tests' partner site.
 */
function partnerEnv() {
  const web = new FakeWeb();
  web.serve("http://localhost:8081", PARTNER);
  const reader = new NodeReader({ fetchImpl: web.fetch });
  return { web, env: { reader, bridgeProbe: nodeBridgeProbe(reader), now: () => new Date("2026-11-16T12:00:00Z") } };
}

test("level rules", () => {
  assert.equal(levelOf([r("pass", true), r("na", true)]), "conformant");
  assert.equal(levelOf([r("pass", true), r("warn", false)]), "warnings");
  assert.equal(levelOf([r("fail", false)]), "warnings");
  assert.equal(levelOf([r("fail", true), r("pass", true)]), "not-conformant");
  assert.equal(levelOf([r("warn", true)]), "warnings");
});

test("level labels", () => {
  assert.deepEqual(LEVEL_LABELS, {
    conformant: "Conformant", warnings: "Conformant with warnings", "not-conformant": "Not conformant" });
});

test("the catalog holds every check once, in group order", () => {
  const ids = allChecks.map((check) => check.id);
  assert.equal(ids.length, 20);
  assert.equal(new Set(ids).size, 20);
  assert.deepEqual([...new Set(allChecks.map((check) => check.group))],
    ["Publication", "Network validity", "Policy", "Actions and bridge", "Hygiene"]);
});

test("garbage input gives one failure and the rest not applicable", async () => {
  const { web, env } = partnerEnv();
  const rep = await inspect("javascript:alert(1)", env);
  assert.equal(rep.level, "not-conformant");
  assert.deepEqual(rep.results.filter((x) => x.status === "fail").map((x) => x.id), ["pub.url"]);
  assert.ok(rep.results.filter((x) => x.id !== "pub.url").every((x) => x.status === "na"));
  assert.equal(web.requests.length, 0);
});

test("a report carries the check's details and the time", async () => {
  const { env } = partnerEnv();
  const rep = await inspect("http://localhost:8081/marrow_point_harbor_tours", env);
  assert.equal(rep.checkedAt, "2026-11-16T12:00:00.000Z");
  assert.equal(rep.networkName, "marrow_point_harbor_tours");
  assert.equal(rep.origin, "http://localhost:8081");
  assert.equal(typeof rep.brand, "string");
  assert.deepEqual(Object.keys(rep.results[0]).sort(),
    ["evidence", "fix", "group", "id", "must", "spec", "status", "title"]);
});

test("a crashing check is reported, not thrown", async () => {
  const { env } = partnerEnv();
  const crashing = { id: "x.crash", group: "Test", spec: "n/a", title: "Crashes", must: false, run() { throw new Error("boom"); } };
  const rep = await inspect("http://localhost:8081/marrow_point_harbor_tours", { ...env, checks: [crashing] });
  assert.deepEqual(rep.results.map((x) => [x.id, x.status, x.evidence]), [["x.crash", "fail", "check crashed: boom"]]);
});

test("a check that returns nonsense is reported as crashed", async () => {
  const { env } = partnerEnv();
  const odd = { id: "x.odd", group: "Test", spec: "n/a", title: "Odd", must: false, run() { return { status: "maybe" }; } };
  const rep = await inspect("http://localhost:8081/marrow_point_harbor_tours", { ...env, checks: [odd] });
  assert.equal(rep.results[0].status, "fail");
});

test("a hostile brand is carried as plain text of bounded length", async () => {
  const { web, env } = partnerEnv();
  const manifest = JSON.parse(await (await web.fetch("http://localhost:8081/agent-manifest.json")).text());
  manifest.brand = "<img src=x onerror=alert(1)>" + "x".repeat(500);
  web.put("http://localhost:8081/agent-manifest.json", { body: manifest, headers: { "access-control-allow-origin": "*" } });
  const rep = await inspect("http://localhost:8081/marrow_point_harbor_tours", env);
  assert.ok(rep.brand.startsWith("<img src=x"));
  assert.ok(rep.brand.length <= 120);
});

test("the linking fixture partner is conformant or better", async () => {
  const { env } = partnerEnv();
  const rep = await inspect("http://localhost:8081/marrow_point_harbor_tours", env);
  assert.notEqual(rep.level, "not-conformant", JSON.stringify(rep.results.filter((x) => x.status === "fail")));
});

test("the command line prints every check and exits by level", async () => {
  const { web } = partnerEnv();
  const lines = [];
  const code = await BeaconCheck.main(["http://localhost:8081/marrow_point_harbor_tours"], { fetchImpl: web.fetch, print: (line) => lines.push(line) });
  assert.equal(code, 0);
  assert.ok(lines.some((line) => line.includes("pub.manifest")));
  assert.match(lines.at(-1), /^Level: /);
});

test("the command line exits 1 for a site that is not conformant and 2 for bad arguments", async () => {
  const lines = [];
  const options = { fetchImpl: new FakeWeb().fetch, print: (line) => lines.push(line) };
  assert.equal(await BeaconCheck.main(["https://nowhere.example/net"], options), 1);
  assert.equal(await BeaconCheck.main([], options), 2);
  assert.equal(await BeaconCheck.main(["https://a.example/n", "--bogus"], options), 2);
});

test("the command line prints JSON with --json", async () => {
  const { web } = partnerEnv();
  const lines = [];
  await BeaconCheck.main(["http://localhost:8081/marrow_point_harbor_tours", "--json"], { fetchImpl: web.fetch, print: (line) => lines.push(line) });
  assert.equal(JSON.parse(lines.join("\n")).networkName, "marrow_point_harbor_tours");
});
