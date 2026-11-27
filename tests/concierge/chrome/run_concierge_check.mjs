// A real-browser check of Town Concierge with the town's two partner sites, a scripted
// model router and a fake key, so no model is called and no real key is needed.
//
// Usage (from the repository root):
//   node tests/concierge/chrome/run_concierge_check.mjs
//
// Origins: Concierge http://localhost:8093, guesthouse http://127.0.0.1:8080, harbor
// tours http://localhost:8081, scripted router http://127.0.0.1:8791. Each site's server
// logs every request, so the check sees what reached each partner and when.

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
const CONCIERGE = "http://localhost:8093";
const GUESTHOUSE = "http://127.0.0.1:8080";
const TOURS = "http://localhost:8081";
const ROUTER = "http://127.0.0.1:8791/v1";
const KEY = "sk-test-not-a-real-key";
const CARD = { firstName: "Ana", lastName: "Silva", email: "ana.silva@example.com", phone: "0123 456 789" };

/**
 * A date some days from today, as YYYY-MM-DD.
 */
function daysAhead(n) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + n);
  return date.toISOString().slice(0, 10);
}

const STAY = { roomId: "harbor-view", checkIn: daysAhead(40), checkOut: daysAhead(42), guests: 2, arrival: "3 pm to 5 pm" };
const TRIP = { tourId: "seal-rocks", date: daysAhead(41), time: "10:00", adults: 2, children: 0 };

/**
 * The scripted Concierge: plan the stay, plan the trip, book, then answer.
 */
function reply(request) {
  const done = request.messages.filter((message) => message.role === "tool").length;
  const steps = [
    { tool: "website_plan_leg", arguments: { partner: "guesthouse", argsJson: JSON.stringify(STAY) } },
    { tool: "website_plan_leg", arguments: { partner: "harbor_tours", argsJson: JSON.stringify(TRIP) } },
    { tool: "website_book_trip", arguments: {} },
  ];
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
  const work = mkdtempSync(path.join(tmpdir(), "concierge-check-"));
  const logs = { guesthouse: path.join(work, "guesthouse.jsonl"), tours: path.join(work, "tours.jsonl") };
  const router = new ScriptRouter(KEY, reply);
  const routerServer = await startRouter(router);
  const servers = [
    serve(path.join(ROOT, "apps/concierge"), 8093, "localhost", path.join(work, "concierge.jsonl")),
    serve(path.join(ROOT, "apps/town/guesthouse"), 8080, "127.0.0.1", logs.guesthouse),
    serve(path.join(ROOT, "apps/town/harbor_tours"), 8081, "localhost", logs.tours),
  ];
  const results = [];
  const check = (name, ok, detail = "") => results.push({ name, ok: !!ok, detail });
  const browser = await chromium.launch();
  try {
    await Promise.all([waitFor(`${CONCIERGE}/agent-manifest.json`), waitFor(`${GUESTHOUSE}/partner-desk/agent-manifest.json`), waitFor(`${TOURS}/partner-desk/agent-manifest.json`)]);
    const context = await browser.newContext();
    await context.addInitScript(([key, routerUrl]) => {
      window.__cspViolations = [];
      document.addEventListener("securitypolicyviolation", (event) => window.__cspViolations.push(`${event.violatedDirective} ${event.blockedURI}`));
      if (location.origin === "http://localhost:8093") {
        sessionStorage.setItem("nsweb-byok-tab-key", key);
        sessionStorage.setItem("nsweb-byok-router", routerUrl);
        sessionStorage.setItem("nsweb-byok-model", "script-1");
      }
    }, [KEY, ROUTER]);
    const errors = [];
    context.on("page", (p) => p.on("pageerror", (error) => errors.push(`${p.url()}: ${error}`)));
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(String(error)));
    await page.goto(`${CONCIERGE}/`);
    await page.waitForFunction(() => /connected/.test(document.querySelector("#assistant-status").textContent), null, { timeout: 20000 });
    for (const [name, value] of Object.entries(CARD)) {
      await page.fill(`#contact-card input[name="${name}"]`, value);
    }

    // Planning: one consent card per partner, before any contact with it.
    await page.fill("#ns-input", "Plan the harbor view room and the morning seal trip, then book it all.");
    await page.click("#ns-send");
    const before = { guesthouse: logged(logs.guesthouse).length, tours: logged(logs.tours).length };
    await page.waitForSelector(".ns-consent-actions button[data-d=allow]", { timeout: 20000 });
    await page.waitForTimeout(500);
    const whileAsking = logged(logs.guesthouse).length - before.guesthouse;
    await page.click(".ns-consent-actions button[data-d=allow]");
    await page.waitForFunction(() => document.querySelectorAll(".ns-consent-actions button[data-d=allow]").length > 0
      && document.querySelectorAll(".leg").length === 1, null, { timeout: 30000 });
    const toursWhileAsking = logged(logs.tours).length - before.tours;
    await page.click(".ns-consent-actions button[data-d=allow]");
    await page.waitForFunction(() => document.querySelectorAll(".leg").length === 2, null, { timeout: 30000 });
    check("1. Each partner is contacted only after the visitor allows it", whileAsking === 0 && toursWhileAsking === 0,
      `${whileAsking} guesthouse and ${toursWhileAsking} tour requests while asking`);
    const board = await page.textContent("#board");
    check("2. The board shows both legs with the partners' own names and prices", /Harbor View/i.test(board) && /Seal Rocks Cruise/.test(board) && /Total \$/.test(board), board.slice(0, 200));

    // Booking: the Concierge's dialog, then each partner's own window.
    await page.waitForSelector("dialog.assistant-review[open]", { timeout: 30000 });
    const review = await page.textContent("dialog.assistant-review[open]");
    await page.click("dialog.assistant-review[open] button:has-text(\"Book the trip\")");
    const windows = [];
    windows.push(await confirmInPartnerWindow(context, page));
    windows.push(await confirmInPartnerWindow(context, page));
    check("3. The trip is reviewed here, then each booking in its partner's own window",
      /Ana Silva/.test(review) && windows.map((w) => w.origin).join(" ") === `${GUESTHOUSE} ${TOURS}`
        && windows.every((w) => w.title === `Request from ${CONCIERGE}` && /ana\.silva@example\.com/.test(w.shown)),
      windows.map((w) => `${w.origin}: ${w.title}`).join("; "));

    await page.waitForFunction(() => document.querySelectorAll(".leg-code").length === 2, null, { timeout: 30000 });
    const codes = await page.$$eval(".leg-code", (nodes) => nodes.map((node) => node.textContent));
    const saved = {};
    for (const [origin, key] of [[GUESTHOUSE, "town-guesthouse-bookings-v1"], [TOURS, "town-harbor-tours-reservations-v1"]]) {
      const vendor = await context.newPage();
      await vendor.goto(`${origin}/`);
      saved[origin] = await vendor.evaluate((k) => localStorage.getItem(k) || "", key);
      await vendor.close();
    }
    const bothSaved = codes.every((text) => {
      const code = text.replace("Reference ", "");
      return Object.values(saved).some((value) => value.includes(code));
    });
    check("4. Both legs are booked, and each partner's own site has the booking", codes.length === 2 && bothSaved, codes.join(", "));

    const toPartners = [...logged(logs.guesthouse), ...logged(logs.tours)];
    const modelText = JSON.stringify(router.records);
    check("5. No partner got the key, and every model call carried it to the router",
      toPartners.every((request) => !request.authorization) && router.records.filter((r) => r.method === "POST").every((r) => r.keyOk),
      `${toPartners.length} partner requests, ${toPartners.filter((r) => r.authorization).length} with Authorization`);
    check("6. The model never saw the contact card", !Object.values(CARD).some((value) => modelText.includes(value)) && router.records.length > 0);

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
