// Tests for tools/beacon_recheck.mjs: re-checking the directory and drawing badges.

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { FakeWeb } from "../../apps/beacon/tests/fake_web.mjs";
import { IndexRecheck, badgeName, badgeSvg, main } from "../../tools/beacon_recheck.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PARTNER = path.resolve(HERE, "../linking/fixtures/partner_site");
const GOOD = "http://localhost:8081/marrow_point_harbor_tours";
const DOWN = "https://down.example/net";
const NOW = () => new Date("2026-11-16T12:00:00Z");

const entry = (url, name) => ({ url, name, description: "A site.", tags: [], submittedBy: "a" });

/**
 * A web where the partner fixture is up and down.example never answers.
 */
function web() {
  const fake = new FakeWeb();
  fake.serve("http://localhost:8081", PARTNER);
  fake.put(`${DOWN.replace("/net", "")}/agent-manifest.json`, () => new Promise(() => {}));
  return fake;
}

test("badge names come from the host and path only", () => {
  assert.equal(badgeName("https://Site.example:8443/Agents/Net_1"), "site-example-8443-agents-net-1.svg");
  assert.equal(badgeName(GOOD), "localhost-8081-marrow-point-harbor-tours.svg");
});

test("a badge says the level and date and carries no text from the site", () => {
  const svg = badgeSvg("not-conformant", "2026-11-16T12:00:00.000Z");
  assert.match(svg, /^<svg /);
  assert.match(svg, /agentic web/);
  assert.match(svg, /not conformant/);
  assert.match(svg, /<title>agentic web: not conformant, checked 2026-11-16<\/title>/);
  assert.equal(badgeSvg("conformant", "2026-11-16").includes("<script"), false);
});

test("a recheck keeps a failing site, lists it, and moves on after a timeout", async () => {
  const fake = web();
  const recheck = new IndexRecheck({ fetchImpl: fake.fetch, now: NOW, timeoutMs: 30 });
  const out = await recheck.run({ version: 1, sites: [entry(DOWN, "Down"), entry(GOOD, "Tours")] });
  assert.equal(out.status.version, 1);
  assert.equal(out.status.checkedAt, "2026-11-16T12:00:00.000Z");
  assert.equal(out.status.sites[DOWN].level, "not-conformant");
  assert.match(out.status.sites[DOWN].reason, /timed out/);
  assert.notEqual(out.status.sites[GOOD].level, "not-conformant");
  assert.deepEqual(out.failures, [DOWN]);
  assert.deepEqual(Object.keys(out.badges).sort(), [badgeName(DOWN), badgeName(GOOD)].sort());
});

test("only the named entries are checked", async () => {
  const fake = web();
  const recheck = new IndexRecheck({ fetchImpl: fake.fetch, now: NOW, timeoutMs: 30 });
  const out = await recheck.run({ version: 1, sites: [entry(DOWN, "Down"), entry(GOOD, "Tours")] }, { only: [GOOD] });
  assert.deepEqual(Object.keys(out.status.sites), [GOOD]);
  assert.equal(fake.requestsTo("https://down.example").length, 0);
});

/**
 * A stand-in repository with an index file, for the command line.
 */
function repo(sites) {
  const root = mkdtempSync(path.join(tmpdir(), "recheck-"));
  mkdirSync(path.join(root, "apps", "beacon", "index"), { recursive: true });
  writeFileSync(path.join(root, "apps", "beacon", "index", "sites.json"), JSON.stringify({ version: 1, sites }));
  return root;
}

test("an invalid index stops before any fetch", async () => {
  const fake = web();
  const lines = [];
  const root = repo([{ url: "nope", name: "", description: "", tags: [], submittedBy: "" }]);
  const code = await main([], { root, fetchImpl: fake.fetch, print: (line) => lines.push(line), now: NOW });
  assert.equal(code, 1);
  assert.equal(fake.requests.length, 0);
  assert.ok(lines.some((line) => /sites\[0\]/.test(line)));
});

test("--only-changed checks only entries new since the base and fails on a new failing site", async () => {
  const fake = web();
  const lines = [];
  const root = repo([entry(GOOD, "Tours"), entry(DOWN, "Down")]);
  const baseIndex = JSON.stringify({ version: 1, sites: [entry(GOOD, "Tours")] });
  const code = await main(["--only-changed", "origin/main"], {
    root, fetchImpl: fake.fetch, print: (line) => lines.push(line), now: NOW, timeoutMs: 30,
    gitShow: (ref, file) => { assert.equal(ref, "origin/main"); assert.equal(file, "apps/beacon/index/sites.json"); return baseIndex; },
  });
  assert.equal(code, 1);
  assert.equal(fake.requestsTo("http://localhost:8081").length, 0);
  assert.ok(lines.some((line) => line.includes(DOWN) && /Not conformant/.test(line)));
});

test("--only-changed with no base index checks every entry", async () => {
  const fake = web();
  const root = repo([entry(GOOD, "Tours")]);
  const code = await main(["--only-changed", "origin/main"], {
    root, fetchImpl: fake.fetch, print: () => {}, now: NOW, gitShow: () => { throw new Error("no such path"); },
  });
  assert.equal(code, 0);
  assert.ok(fake.requestsTo("http://localhost:8081").length > 0);
});

test("without --write nothing is written, and a full recheck exits 0 even when a site fails", async () => {
  const fake = web();
  const lines = [];
  const root = repo([entry(GOOD, "Tours"), entry(DOWN, "Down")]);
  const code = await main([], { root, fetchImpl: fake.fetch, print: (line) => lines.push(line), now: NOW, timeoutMs: 30 });
  assert.equal(code, 0);
  assert.equal(lines.filter((line) => line.startsWith("http")).length, 2);
  assert.equal(existsSync(path.join(root, "apps", "beacon", "index", "status.json")), false);
});

test("--write writes the status file and one badge per site", async () => {
  const fake = web();
  const root = repo([entry(GOOD, "Tours")]);
  await main(["--write"], { root, fetchImpl: fake.fetch, print: () => {}, now: NOW });
  const status = JSON.parse(readFileSync(path.join(root, "apps", "beacon", "index", "status.json"), "utf8"));
  assert.ok(status.sites[GOOD]);
  assert.ok(existsSync(path.join(root, "apps", "beacon", "badges", badgeName(GOOD))));
});

test("bad arguments exit 2", async () => {
  assert.equal(await main(["--bogus"], { root: repo([]), print: () => {} }), 2);
  assert.equal(await main(["--only-changed"], { root: repo([]), print: () => {} }), 2);
});
