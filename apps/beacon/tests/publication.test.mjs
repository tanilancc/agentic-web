// Tests for the publication checks.

import assert from "node:assert/strict";
import test from "node:test";
import { publicationChecks } from "../js/checks/publication.js";
import { Status, outcome } from "../js/checks/result.js";
import { goodSnapshot, runCheck } from "./snapshots.mjs";

const run = (id, snapshot) => runCheck(publicationChecks, id, snapshot);

test("outcome builds a plain result", () => {
  assert.deepEqual(outcome(Status.PASS, "fine"), { status: "pass", evidence: "fine", fix: "" });
});

test("the checks come in a fixed order with spec references", () => {
  assert.deepEqual(publicationChecks.map((check) => check.id),
    ["pub.url", "pub.https", "pub.manifest", "pub.network-name", "pub.network-file", "pub.links", "pub.redirect"]);
  assert.ok(publicationChecks.every((check) => check.group === "Publication" && check.spec && check.title));
  assert.deepEqual(publicationChecks.filter((check) => check.must).map((check) => check.id),
    ["pub.url", "pub.https", "pub.manifest", "pub.network-name", "pub.network-file"]);
});

test("a good site passes every publication check", async () => {
  for (const check of publicationChecks) {
    assert.equal((await check.run(goodSnapshot(), {})).status, "pass", check.id);
  }
});

test("pub.url fails on an address that is not a site", async () => {
  const s = { ...goodSnapshot(), urlError: "Only http:// and https:// addresses can be inspected." };
  const o = await run("pub.url", s);
  assert.equal(o.status, "fail");
  assert.match(o.evidence, /Only http/);
});

test("pub.https warns on loopback and fails elsewhere", async () => {
  const local = { ...goodSnapshot(), origin: "http://localhost:8081", base: "http://localhost:8081" };
  assert.equal((await run("pub.https", local)).status, "warn");
  assert.match((await run("pub.https", local)).evidence, /local development only/);
  const plain = { ...goodSnapshot(), origin: "http://site.example", base: "http://site.example" };
  const o = await run("pub.https", plain);
  assert.equal(o.status, "fail");
  assert.match(o.evidence, /http:\/\/site\.example/);
});

test("pub.manifest fails when the manifest is unreachable", async () => {
  const s = goodSnapshot();
  s.files.manifest = { ...s.files.manifest, ok: false, corsReadable: false, error: "unreachable", text: "" };
  s.manifest = null;
  const o = await run("pub.manifest", s);
  assert.equal(o.status, "fail");
  assert.match(o.evidence, /https:\/\/site\.example\/agent-manifest\.json/);
  assert.match(o.evidence, /unreachable/);
});

test("pub.manifest fails when another origin cannot read it", async () => {
  const s = goodSnapshot();
  s.files.manifest.corsReadable = false;
  const o = await run("pub.manifest", s);
  assert.equal(o.status, "fail");
  assert.match(o.fix, /Access-Control-Allow-Origin/);
});

test("pub.manifest fails without a networks list", async () => {
  const s = goodSnapshot();
  s.manifest = { networks: "nope" };
  assert.equal((await run("pub.manifest", s)).status, "fail");
});

test("pub.manifest is not applicable after a bad address", async () => {
  const s = { ...goodSnapshot(), urlError: "bad", files: { manifest: null, network: null, links: null }, manifest: null };
  const o = await run("pub.manifest", s);
  assert.equal(o.status, "na");
  assert.equal(o.evidence, "not checked: pub.url failed");
});

test("pub.network-name fails on a near miss and lists the published names", async () => {
  const s = goodSnapshot();
  s.networkName = "guide";
  s.entry = null;
  const o = await run("pub.network-name", s);
  assert.equal(o.status, "fail");
  assert.match(o.evidence, /guide_net/);
});

test("pub.network-name asks for a name when a site has several networks", async () => {
  const s = goodSnapshot();
  s.networkName = "";
  s.entry = null;
  s.networks = ["a", "b"];
  const o = await run("pub.network-name", s);
  assert.equal(o.status, "fail");
  assert.match(o.evidence, /a, b/);
});

test("pub.network-file fails when the file cannot be parsed", async () => {
  const s = goodSnapshot();
  s.files.network.error = "not a network definition: bad";
  s.networkConfig = null;
  const o = await run("pub.network-file", s);
  assert.equal(o.status, "fail");
  assert.match(o.evidence, /guide_net\.network\.json/);
});

test("pub.network-file fails when another origin cannot read it", async () => {
  const s = goodSnapshot();
  s.files.network.corsReadable = false;
  assert.equal((await run("pub.network-file", s)).status, "fail");
});

test("pub.network-file is not applicable without a matching network", async () => {
  const s = goodSnapshot();
  s.entry = null;
  s.files.network = null;
  assert.equal((await run("pub.network-file", s)).evidence, "not checked: pub.network-name failed");
});

test("pub.links warns when links.json is missing", async () => {
  const s = goodSnapshot();
  s.files.links = { ...s.files.links, ok: false, status: 404, error: "HTTP 404" };
  const o = await run("pub.links", s);
  assert.equal(o.status, "warn");
  assert.match(o.evidence, /links\.json/);
});

test("pub.redirect warns on a redirect to another origin and names both", async () => {
  const s = goodSnapshot();
  s.files.network.redirectedTo = "https://elsewhere.example/n.json";
  const o = await run("pub.redirect", s);
  assert.equal(o.status, "warn");
  assert.match(o.evidence, /site\.example/);
  assert.match(o.evidence, /elsewhere\.example/);
});

test("pub.redirect passes on a redirect within the origin", async () => {
  const s = goodSnapshot();
  s.files.network.redirectedTo = "https://site.example/v2/n.json";
  assert.equal((await run("pub.redirect", s)).status, "pass");
});
