// A real-browser check of Quorum with the market's three vendors, a scripted model router
// and a fake key, so no model is called and no real key is needed.
//
// Usage (from the repository root):
//   node tests/quorum/chrome/run_quorum_check.mjs
//
// Origins: Quorum http://localhost:8094, vendors http://127.0.0.1:8095 to 8097, scripted
// router http://127.0.0.1:8791. Each vendor's server logs every request.

import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import http from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ScriptRouter } from "../../../apps/beacon/tests/script_router.mjs";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const SERVE = path.join(ROOT, "skills/agentify-website/scripts/serve_site.mjs");
const QUORUM = "http://localhost:8094";
const VENDORS = [["little_oven", 8095], ["green_fork", 8096], ["harbour_bakehouse", 8097]];
const ROUTER = "http://127.0.0.1:8791/v1";
const KEY = "sk-test-not-a-real-key";
const CARD = { firstName: "Ana", lastName: "Silva", email: "ana.silva@example.com", phone: "0123 456 789" };

/**
 * The scripted assistant: find the best plan, place it, then answer.
 */
function reply(request) {
  const done = request.messages.filter((message) => message.role === "tool").length;
  const steps = [{ tool: "website_find_best_plan", arguments: {} }, { tool: "website_place_award", arguments: { plan: 0 } }];
  return steps[done] || { text: `Done: ${ScriptRouter.lastToolResult(request).slice(0, 400)}` };
}

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
      const headers = Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k.toLowerCase(), v]));
      const answer = router.respond(req.method, new URL(req.url, ROUTER).pathname, headers, body);
      res.writeHead(answer.status, { ...cors, "Content-Type": answer.type }).end(answer.body);
    });
  });
  return new Promise((resolve) => server.listen(8791, "127.0.0.1", () => resolve(server)));
}

function serve(folder, port, openAs, log) {
  return spawn(process.execPath, [SERVE, folder, "--port", String(port), "--open-as", openAs, "--log", log], { stdio: "ignore" });
}

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

function logged(file) {
  return existsSync(file) ? readFileSync(file, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line)) : [];
}

/**
 * Confirm one booking: the Concierge's "Open action site" dialog, then the partner's
 * window and its own confirmation.
 */
async function confirmInPartnerWindow(context, page) {
  const popupEvent = context.waitForEvent("page", { timeout: 30000 });
  await page.click("dialog[open] button:has-text(\"Open action site\")", { timeout: 30000 });
  const popup = await popupEvent;
  await popup.waitForSelector("dialog[open]", { timeout: 15000 });
  const title = await popup.textContent("dialog[open] h2");
  const shown = await popup.textContent("dialog[open]");
  await popup.click("dialog[open] button:has-text(\"Confirm actions\")");
  return { origin: new URL(popup.url()).origin, title, shown };
}

async function main() {
  const { chromium } = require("playwright");
  const work = mkdtempSync(path.join(tmpdir(), "quorum-check-"));
  const logs = Object.fromEntries(VENDORS.map(([id]) => [id, path.join(work, `${id}.jsonl`)]));
  const router = new ScriptRouter(KEY, reply);
  const routerServer = await startRouter(router);
  const servers = [
    serve(path.join(ROOT, "apps/quorum"), 8094, "localhost", path.join(work, "quorum.jsonl")),
    ...VENDORS.map(([id, port]) => serve(path.join(ROOT, "apps/market", id), port, "127.0.0.1", logs[id])),
  ];
  const results = [];
  const check = (name, ok, detail = "") => results.push({ name, ok: !!ok, detail });
  const browser = await chromium.launch();
  try {
    await Promise.all([waitFor(`${QUORUM}/agent-manifest.json`), ...VENDORS.map(([, port]) => waitFor(`http://127.0.0.1:${port}/partner-desk/agent-manifest.json`))]);
    const context = await browser.newContext();
    await context.addInitScript(([key, routerUrl]) => {
      window.__cspViolations = [];
      document.addEventListener("securitypolicyviolation", (event) => window.__cspViolations.push(`${event.violatedDirective} ${event.blockedURI}`));
      if (location.origin === "http://localhost:8094") {
        sessionStorage.setItem("nsweb-byok-tab-key", key);
        sessionStorage.setItem("nsweb-byok-router", routerUrl);
        sessionStorage.setItem("nsweb-byok-model", "script-1");
      }
    }, [KEY, ROUTER]);
    const errors = [];
    context.on("page", (p) => p.on("pageerror", (error) => errors.push(`${p.url()}: ${error}`)));
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(String(error)));
    const pageOpenedAt = Date.now();
    await page.goto(`${QUORUM}/`);
    await page.waitForFunction(() => /connected/.test(document.querySelector("#assistant-status").textContent), null, { timeout: 20000 });
    for (const [name, value] of Object.entries(CARD)) {
      await page.fill(`#contact-card input[name="${name}"]`, value);
    }

    // Search: one consent card per vendor, before any contact with it. Record when each
    // vendor was allowed, to compare with the first request in its log.
    await page.evaluate(() => {
      const engine = window.__nsweb.engine;
      const ask = engine.requestConsent.bind(engine);
      window.__consents = [];
      engine.requestConsent = async (info) => {
        const decision = await ask(info);
        window.__consents.push({ host: info.peerOrigin, at: Date.now(), decision });
        return decision;
      };
    });
    await page.fill("#ns-input", "Find the best plan for our team dinner and order it.");
    await page.click("#ns-send");
    for (let i = 0; i < VENDORS.length; i += 1) {
      await page.locator(".ns-consent-actions button[data-d=allow]").last().click({ timeout: 30000 });
      await page.waitForFunction((n) => window.__consents.length >= n, i + 1, { timeout: 30000 });
    }
    const consents = await page.evaluate(() => window.__consents);
    let contactedWhileAsking = 0;
    for (const [id, port] of VENDORS) {
      const allowed = consents.find((c) => c.host === `127.0.0.1:${port}`);
      // Requests before pageOpenedAt are this script's own check that the server is up.
      contactedWhileAsking += logged(logs[id]).filter((r) => r.time >= pageOpenedAt && (!allowed || r.time < allowed.at)).length;
    }
    check("1. Each vendor is contacted only after the visitor allows it", contactedWhileAsking === 0, `${contactedWhileAsking} vendor requests while asking`);

    await page.waitForSelector(".plan", { timeout: 60000 });
    const plans = await page.textContent("#plans");
    check("2. The best plan is shown beside the best single vendor, from the vendors' quotes", /Best plan/.test(plans) && /quotes from the vendors/.test(plans), plans.slice(0, 260));

    // Ordering: Quorum's dialog, then each vendor's own window.
    await page.waitForSelector("dialog.assistant-review[open]", { timeout: 30000 });
    const review = await page.textContent("dialog.assistant-review[open]");
    const orderCount = (review.match(/Order \d+:/g) || []).length;
    await page.click("dialog.assistant-review[open] button:has-text(\"Place the orders\")");
    const windows = [];
    for (let i = 0; i < orderCount; i += 1) {
      windows.push(await confirmInPartnerWindow(context, page));
    }
    check("3. The orders are reviewed here, then each in its vendor's own window",
      orderCount >= 1 && /Ana Silva/.test(review) && windows.every((w) => w.title === `Request from ${QUORUM}` && /ana\.silva@example\.com/.test(w.shown)),
      `${orderCount} orders: ${windows.map((w) => w.origin).join(", ")}`);

    await page.waitForFunction((n) => document.querySelectorAll(".award-code").length === n, orderCount, { timeout: 30000 });
    const codes = await page.$$eval(".award-code", (nodes) => nodes.map((node) => node.textContent.replace("Reference ", "")));
    let received = 0;
    for (const w of windows) {
      const vendor = await context.newPage();
      await vendor.goto(`${w.origin}/`);
      const text = await vendor.textContent("#orders");
      received += codes.filter((code) => text.includes(code)).length;
      await vendor.close();
    }
    check("4. Every order is placed, and each vendor's own page lists it", codes.length === orderCount && received === orderCount, codes.join(", "));

    const toVendors = VENDORS.flatMap(([id]) => logged(logs[id]));
    check("5. No vendor got the key, and every model call carried it to the router",
      toVendors.every((r) => !r.authorization) && router.records.filter((r) => r.method === "POST").every((r) => r.keyOk),
      `${toVendors.length} vendor requests, ${toVendors.filter((r) => r.authorization).length} with Authorization`);
    check("6. The model never saw the contact card", !Object.values(CARD).some((value) => JSON.stringify(router.records).includes(value)) && router.records.length > 0);

    const violations = await page.evaluate(() => window.__cspViolations);
    check("No page errors or Content-Security-Policy violations", errors.length === 0 && violations.length === 0, [...errors, ...violations].join(" | "));
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
  return results.length && results.every((result) => result.ok) ? 0 : 1;
}

process.exitCode = await main();
