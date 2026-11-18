// The deploy tool's worker serves each site's files with the site's _headers rules.
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { buildWorker, parseHeaders, PROJECTS } from "../../tools/deploy_pages.mjs";

async function load(folder) {
  const { source } = await buildWorker(folder);
  const dir = await mkdtemp(path.join(tmpdir(), "worker-"));
  const file = path.join(dir, "worker.mjs");
  await writeFile(file, source);
  return (await import(file)).default;
}

test("the headers file is read into exact and prefix rules", () => {
  assert.deepEqual(parseHeaders("# c\n/a.json\n  X-A: 1\n/b/*\n  X-B: 2\n"), [
    { pattern: "/a.json", headers: { "X-A": "1" } },
    { pattern: "/b/*", headers: { "X-B": "2" } },
  ]);
});

test("Beacon's worker serves its page, public files and headers, and nothing else", async () => {
  const worker = await load(PROJECTS.beacon.dir);
  const get = (p, method = "GET") => worker.fetch(new Request(`https://oaw-beacon.pages.dev${p}`, { method }));
  const page = await get("/");
  assert.equal(page.status, 200);
  assert.match(page.headers.get("content-type"), /text\/html/);
  assert.equal(page.headers.get("content-security-policy"), "frame-ancestors 'none'");
  const manifest = await get("/agent-manifest.json");
  assert.equal(manifest.headers.get("access-control-allow-origin"), "*");
  assert.equal(JSON.parse(await manifest.text()).brand, "Beacon");
  assert.equal((await get("/tests/directory.test.mjs")).status, 404);
  assert.equal((await get("/nope")).status, 404);
  assert.equal((await get("/", "POST")).status, 405);
});

test("an unknown address gets the site's own Page not found page, with a 404 status", async () => {
  const worker = await load(PROJECTS.concierge.dir);
  const response = await worker.fetch(new Request("https://oaw-concierge.pages.dev/no/such/page"));
  assert.equal(response.status, 404);
  assert.match(response.headers.get("content-type"), /text\/html/);
  assert.match(response.headers.get("content-security-policy"), /frame-ancestors 'none'/);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  const html = await response.text();
  assert.match(html, /Page not found/);
  assert.match(html, /href="\/"/, "The page links home with an address that works from any depth.");
  assert.match(html, /script-src 'self'/);
  const head = await worker.fetch(new Request("https://oaw-concierge.pages.dev/missing", { method: "HEAD" }));
  assert.equal(head.status, 404);
  assert.equal(await head.text(), "");
});

test("a failure inside the worker returns a short error page that reveals nothing", async () => {
  const worker = await load(PROJECTS.concierge.dir);
  const broken = { method: "GET", get url() { throw new Error("secret detail /srv/worker.js:12"); } };
  const response = await worker.fetch(broken);
  assert.equal(response.status, 500);
  const html = await response.text();
  assert.match(html, /Something went wrong/);
  assert.doesNotMatch(html, /secret detail|worker\.js|Error/);
});
