// A real-browser check of Beacon across three origins, with a scripted model router and
// a fake key, so no model is called and no real key is needed.
//
// Usage (from the repository root):
//   node tests/beacon/chrome/run_beacon_check.mjs
//
// Origins: Beacon at http://localhost:8090, the guesthouse example at
// http://127.0.0.1:8080, and the scripted router at http://127.0.0.1:8791. Each site's
// server logs every request, so the check can see what reached the guesthouse and when.

import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import http from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ScriptRouter } from "../../../apps/beacon/tests/script_router.mjs";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const SERVE = path.join(ROOT, "skills/agentify-website/scripts/serve_site.mjs");
const BEACON = "http://localhost:8090";
const SITE = "http://127.0.0.1:8080";
const NETWORK = `${SITE}/tidewhistle_guesthouse`;
const ROUTER = "http://127.0.0.1:8791/v1";
const KEY = "sk-test-not-a-real-key";

/**
 * The scripted model: the canary hands off once and reports; the guesthouse answers and
 * points to its page; the auditor finds nothing and judges answers as pointing to the site.
 */
function reply(request) {
  if (request.role === "canary") {
    return ScriptRouter.hasToolResult(request) ? { text: "They pointed me to their page." }
      : { tool: "target", arguments: { request: "What do you offer, and how do I book?" } };
  }
  if (request.role === "auditor") {
    return request.messages.some((m) => String(m.content).startsWith("TASK: grounding"))
      ? { text: JSON.stringify({ verdict: "points-to-site", quote: "please see our page" }) }
      : { text: JSON.stringify({ passages: [] }) };
  }
  return { text: "We are a small guesthouse; please see our page for rooms and booking." };
}

/**
 * Start the scripted router as an HTTP server that browsers may call.
 */
function startRouter(router) {
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
      if (req.method === "OPTIONS") {
        res.writeHead(204, cors).end();
        return;
      }
      const lower = Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k.toLowerCase(), v]));
      const answer = router.respond(req.method, new URL(req.url, ROUTER).pathname, lower, body);
      res.writeHead(answer.status, { ...cors, "Content-Type": answer.type }).end(answer.body);
    });
  });
  return new Promise((resolve) => server.listen(8791, "127.0.0.1", () => resolve(server)));
}

/**
 * Serve a site folder with request logging.
 */
function serve(folder, port, openAs, log) {
  return spawn(process.execPath, [SERVE, folder, "--port", String(port), "--open-as", openAs, "--log", log], { stdio: "ignore" });
}

/**
 * Wait until a URL answers.
 */
async function waitFor(url) {
  for (let i = 0; i < 100; i += 1) {
    try {
      if ((await fetch(url)).ok) {
        return;
      }
    } catch {
      // Not up yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`${url} did not start.`);
}

/**
 * The requests in a server's log.
 */
function logged(file) {
  return existsSync(file) ? readFileSync(file, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line)) : [];
}

/**
 * Run the five checks and print one line each.
 *
 * :return: The exit code: 0 when every check passed.
 */
async function main() {
  const { chromium } = require("playwright");
  const work = mkdtempSync(path.join(tmpdir(), "beacon-check-"));
  const siteLog = path.join(work, "guesthouse.jsonl");
  const router = new ScriptRouter(KEY, reply);
  const routerServer = await startRouter(router);
  const servers = [
    serve(path.join(ROOT, "apps/beacon"), 8090, "localhost", path.join(work, "beacon.jsonl")),
    serve(path.join(ROOT, "examples/guesthouse_agentified"), 8080, "127.0.0.1", siteLog),
  ];
  const results = [];
  const check = (name, ok, detail = "") => results.push({ name, ok: !!ok, detail });
  const browser = await chromium.launch();
  try {
    await waitFor(`${BEACON}/agent-manifest.json`);
    await waitFor(`${SITE}/agent-manifest.json`);
    const errors = [];
    const context = await browser.newContext();
    // The visitor's key setup, as the settings panel would save it in this tab.
    await context.addInitScript(([key, routerUrl]) => {
      if (location.origin === "http://localhost:8090") {
        sessionStorage.setItem("nsweb-byok-tab-key", key);
        sessionStorage.setItem("nsweb-byok-router", routerUrl);
        sessionStorage.setItem("nsweb-byok-model", "script-1");
      }
    }, [KEY, ROUTER]);
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(String(error)));

    // 1 and 2: inspect the guesthouse.
    await page.goto(`${BEACON}/`);
    await page.fill("#site-url", NETWORK);
    await page.click("#inspect-form button[type=submit]");
    await page.waitForSelector(".level", { timeout: 20000 });
    const groups = await page.$$eval(".check-group-title", (nodes) => nodes.map((node) => node.textContent));
    check("1. Inspecting the guesthouse shows a level and every group",
      groups.length === 5 && (await page.textContent(".level")).length > 0, groups.join(", "));
    const bridge = await page.$eval(".check-list", () => [...document.querySelectorAll(".check")]
      .find((row) => row.querySelector(".check-id").textContent.startsWith("act.bridge-loads")).querySelector(".check-status").textContent);
    check("2. The bridge loads in a real frame", bridge === "Passed", bridge);

    // 3: a shared link asks before any contact.
    const before = logged(siteLog).length;
    await page.goto(`${BEACON}/?site=${encodeURIComponent(NETWORK)}`);
    await page.waitForSelector("dialog[open]");
    await page.waitForTimeout(800);
    const whileAsking = logged(siteLog).length - before;
    await page.click("dialog[open] button:has-text(\"Inspect\")");
    await page.waitForSelector(".level", { timeout: 20000 });
    check("3. A shared link contacts nothing before Inspect", whileAsking === 0 && logged(siteLog).length > before,
      `${whileAsking} requests while asking`);

    // 4: Try it mounts the guesthouse's chat.
    const tryPage = await context.newPage();
    tryPage.on("pageerror", (error) => errors.push(String(error)));
    await tryPage.goto(`${BEACON}/try.html?site=${encodeURIComponent(NETWORK)}`);
    await tryPage.click("dialog[open] button:has-text(\"Run it here\")");
    await tryPage.waitForFunction(() => /Running agents|could not be loaded/.test(document.querySelector("#try-status").textContent), null, { timeout: 20000 });
    const brand = await tryPage.textContent("#agent-app");
    check("4. Try it mounts the guesthouse's chat", /Tidewhistle/.test(brand));
    await tryPage.close();

    // 5: a red-team run with the scripted router.
    const beforeRun = logged(siteLog).length;
    await page.click(".tab >> text=Red team");
    await page.click(".panel-redteam >> text=Run red team");
    await page.waitForSelector(".redteam-banner", { timeout: 120000 });
    const statuses = await page.$$eval(".panel-redteam .check", (rows) => rows.map((row) =>
      `${row.querySelector(".check-id").textContent}=${row.querySelector(".check-status").textContent}`));
    const runRequests = logged(siteLog).slice(beforeRun);
    const keyed = runRequests.filter((request) => request.authorization);
    const chats = router.records.filter((record) => record.method === "POST");
    check("5. A red-team run completes, and the guesthouse never gets a key",
      statuses.length === 7 && keyed.length === 0 && runRequests.length > 0 && chats.every((record) => record.keyOk),
      `${statuses.join(" ")}; ${runRequests.length} guesthouse requests, ${keyed.length} with Authorization; ${chats.length} model calls`);

    check("No page errors", errors.length === 0, errors.join(" | "));
  } finally {
    await browser.close();
    for (const server of servers) {
      server.kill();
    }
    routerServer.close();
  }
  for (const result of results) {
    console.log(`${result.ok ? "PASS" : "FAIL"}  ${result.name}${result.detail ? `  (${result.detail})` : ""}`);
  }
  return results.every((result) => result.ok) ? 0 : 1;
}

process.exitCode = await main();
