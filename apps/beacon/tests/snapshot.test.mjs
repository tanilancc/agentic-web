// Tests for reading a site's public files into a snapshot.

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { BrowserReader, NodeReader } from "../js/checks/reader.js";
import { parseNetworkUrl, readSnapshot } from "../js/checks/snapshot.js";
import { FakeWeb } from "./fake_web.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PARTNER = path.resolve(HERE, "../../../tests/linking/fixtures/partner_site");
const TOURS = "http://localhost:8081";
const NETWORK = "marrow_point_harbor_tours";

/**
 * A web that serves the linking tests' partner site, and a Node reader on it.
 *
 * :param options: Options for FakeWeb.serve.
 * :return: The web and the reader.
 */
function partnerWeb(options) {
  const web = new FakeWeb();
  web.serve(TOURS, PARTNER, options);
  return { web, reader: new NodeReader({ fetchImpl: web.fetch }) };
}

test("parseNetworkUrl splits the site base from the network name", () => {
  assert.deepEqual(parseNetworkUrl("https://x.example/agents/transit"),
    { base: "https://x.example/agents", networkName: "transit", origin: "https://x.example" });
  assert.deepEqual(parseNetworkUrl("https://x.example/transit?a=1#b"),
    { base: "https://x.example", networkName: "transit", origin: "https://x.example" });
  assert.deepEqual(parseNetworkUrl("https://x.example"),
    { base: "https://x.example", networkName: "", origin: "https://x.example" });
  assert.deepEqual(parseNetworkUrl("https://x.example/agents/"),
    { base: "https://x.example/agents", networkName: "", origin: "https://x.example" });
});

test("reads a well-formed site", async () => {
  const { reader } = partnerWeb();
  const s = await readSnapshot(`${TOURS}/${NETWORK}`, reader);
  assert.equal(s.urlError, "");
  assert.equal(s.files.manifest.corsReadable, true);
  assert.equal(s.entry.name, NETWORK);
  assert.deepEqual(s.validation.errors, []);
  assert.equal(s.files.links.ok, true);
});

test("the reader sends the caller's Origin", async () => {
  const { web, reader } = partnerWeb();
  await readSnapshot(`${TOURS}/${NETWORK}`, reader);
  assert.ok(web.requests.every((request) => request.headers.origin === "https://caller.example"));
});

test("exact name only", async () => {
  const { reader } = partnerWeb();
  const s = await readSnapshot(`${TOURS}/harbor_tours`, reader);
  assert.equal(s.entry, null);
  assert.deepEqual(s.networks, [NETWORK]);
  assert.equal(s.files.network, null);
});

test("a site URL with one network picks that network", async () => {
  const { reader } = partnerWeb();
  const s = await readSnapshot(`${TOURS}/`, reader);
  assert.equal(s.entry.name, NETWORK);
});

for (const bad of ["", "javascript:alert(1)", "ftp://x/y", "not a url"]) {
  test(`rejects ${JSON.stringify(bad)}`, async () => {
    const { web, reader } = partnerWeb();
    const s = await readSnapshot(bad, reader);
    assert.ok(s.urlError);
    assert.equal(s.files.manifest, null);
    assert.equal(web.requests.length, 0);
  });
}

test("a hanging file times out", async () => {
  const r = new NodeReader({ fetchImpl: () => new Promise(() => {}), timeoutMs: 20 });
  const read = await r.read("https://x.example/agent-manifest.json");
  assert.equal(read.error, "timed out");
  assert.equal(read.ok, false);
});

test("an oversized file is refused", async () => {
  const r = new NodeReader({ fetchImpl: async () => new Response("x".repeat(2000)), maxBytes: 1000 });
  const read = await r.read("https://x.example/a.json");
  assert.equal(read.error, "larger than 1 MB");
  assert.equal(read.text, "");
});

test("HTML in place of a manifest", async () => {
  const { web, reader } = partnerWeb();
  web.put(`${TOURS}/agent-manifest.json`, { body: "<!doctype html><p>Not found</p>", headers: { "access-control-allow-origin": "*" } });
  const s = await readSnapshot(`${TOURS}/${NETWORK}`, reader);
  assert.equal(s.manifest, null);
  assert.match(s.files.manifest.error, /not JSON/);
});

test("JSON of the wrong shape", async () => {
  const { web, reader } = partnerWeb();
  web.put(`${TOURS}/agent-manifest.json`, { body: { networks: "nope" }, headers: { "access-control-allow-origin": "*" } });
  const s = await readSnapshot(`${TOURS}/${NETWORK}`, reader);
  assert.equal(s.entry, null);
  assert.deepEqual(s.networks, []);
});

test("a network file that is not a network", async () => {
  const { web, reader } = partnerWeb();
  web.put(`${TOURS}/${NETWORK}.network.json`, { body: "[1, 2", headers: { "access-control-allow-origin": "*" } });
  const s = await readSnapshot(`${TOURS}/${NETWORK}`, reader);
  assert.equal(s.networkConfig, null);
  assert.equal(s.validation, null);
  assert.ok(s.files.network.error);
});

test("a redirect to another origin is recorded", async () => {
  const { web, reader } = partnerWeb();
  web.put(`${TOURS}/${NETWORK}.network.json`, { status: 302, headers: { location: "https://elsewhere.example/n.json" } });
  web.put("https://elsewhere.example/n.json", { body: { tools: [] }, headers: { "access-control-allow-origin": "*" } });
  const s = await readSnapshot(`${TOURS}/${NETWORK}`, reader);
  assert.equal(new URL(s.files.network.redirectedTo).origin, "https://elsewhere.example");
});

test("a redirect loop ends as a failed read", async () => {
  const web = new FakeWeb();
  web.put("https://x.example/a", { status: 302, headers: { location: "https://x.example/a" } });
  const read = await new NodeReader({ fetchImpl: web.fetch }).read("https://x.example/a");
  assert.equal(read.ok, false);
  assert.equal(read.error, "too many redirects");
});

test("missing CORS header", async () => {
  const { reader } = partnerWeb({ cors: false });
  const s = await readSnapshot(`${TOURS}/${NETWORK}`, reader);
  assert.equal(s.files.manifest.corsReadable, false);
  // Node can still read it, so the rest of the snapshot is filled in for the other checks.
  assert.equal(s.entry.name, NETWORK);
});

test("an unreachable site", async () => {
  const s = await readSnapshot("https://nowhere.example/net", new NodeReader({ fetchImpl: new FakeWeb().fetch }));
  assert.equal(s.files.manifest.ok, false);
  assert.equal(s.files.manifest.error, "unreachable");
  assert.equal(s.manifest, null);
});

test("the browser reader tells blocked from unreachable", async () => {
  const blocked = new BrowserReader({
    fetchImpl: async (url, init) => {
      if (init.mode === "no-cors") {
        return new Response(null, { status: 200 });
      }
      throw new TypeError("Failed to fetch");
    },
  });
  assert.equal((await blocked.read("https://x.example/a.json")).error, "blocked by CORS");
  const down = new BrowserReader({ fetchImpl: async () => { throw new TypeError("Failed to fetch"); } });
  assert.equal((await down.read("https://x.example/a.json")).error, "unreachable");
});

test("the browser reader sends no credentials", async () => {
  const seen = [];
  const reader = new BrowserReader({ fetchImpl: async (url, init) => { seen.push(init); return new Response("{}"); } });
  const read = await reader.read("https://x.example/a.json");
  assert.equal(read.corsReadable, true);
  assert.equal(seen[0].credentials, "omit");
});
