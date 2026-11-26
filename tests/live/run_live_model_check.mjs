// Drives the live sites with a real model, as a visitor would, and reports what each turn
// did: the reply, the agents that ran, the tools they called, calls to other sites, and
// errors. It answers Allow on every consent card and confirms every dialog and partner
// window, so a run books and orders in the demo town (in this browser only).
//
// Not part of CI: it needs a real key and spends tokens on it.
//   LIVE_KEY=gsk_... node tests/live/run_live_model_check.mjs [beacon|concierge|quorum ...]
// Optional: LIVE_ROUTER (default Groq's OpenAI-compatible API), LIVE_MODEL (default
// openai/gpt-oss-120b), LIVE_OUT (where to write the JSON report), LIVE_PAUSE_MS (wait
// between turns, for free-tier rate limits; default 15000).
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const KEY = process.env.LIVE_KEY || "";
const ROUTER = process.env.LIVE_ROUTER || "https://api.groq.com/openai/v1";
const MODEL = process.env.LIVE_MODEL || "openai/gpt-oss-120b";
const PAUSE = Number(process.env.LIVE_PAUSE_MS || 15000);
const CARD = { firstName: "Test", lastName: "Visitor", email: "test.visitor@example.com", phone: "0100 000 000" };

export const SCENARIOS = {
  beacon: {
    url: "https://oaw-beacon.pages.dev/",
    turns: [
      "Find me an agent site that can book a boat trip.",
      "Inspect https://oaw-tidewhistle.pages.dev/tidewhistle_guesthouse and tell me what fails.",
      "What should that site fix first?",
      "Which of these sites is the most trustworthy?",
    ],
  },
  concierge: {
    url: "https://oaw-concierge.pages.dev/",
    card: true,
    turns: [
      "What rooms are free at the guesthouse for two adults from 10 to 12 December 2026?",
      "Add the cheapest of those rooms for those dates, arriving in the evening.",
      "What boat trips are there on 11 December 2026 for two adults?",
      "Add the first morning trip on the 11th for both of us. Does my plan work?",
      "Are dogs allowed at the guesthouse?",
      "Book the whole trip.",
      "Can you pay for it with my card?",
    ],
  },
  quorum: {
    url: "https://oaw-quorum.pages.dev/",
    card: true,
    turns: [
      "Find the best plan for our team dinner.",
      "Would a single Harbour Bakehouse order of one gluten-free platter and one classic platter at 17:00 work?",
      "Place the best plan.",
      "Can you pay the vendors for us?",
    ],
  },
  // Single turns that once went wrong with a real model, to re-check after a fix.
  beacon_inspect: {
    url: "https://oaw-beacon.pages.dev/",
    turns: ["Inspect https://oaw-tidewhistle.pages.dev/tidewhistle_guesthouse and tell me what fails."],
  },
  concierge_pets: {
    url: "https://oaw-concierge.pages.dev/",
    turns: ["Are dogs allowed at the guesthouse?"],
  },
  quorum_audit: {
    url: "https://oaw-quorum.pages.dev/",
    turns: ["Would a single Harbour Bakehouse order of one gluten-free platter and one classic platter at 17:00 work?"],
  },
};

/**
 * While a turn runs, answer what a visitor would: Allow on consent cards, the confirm
 * button on the site's review dialog, and Confirm in each partner's own window.
 */
async function autopilot(context, page, log) {
  const allow = page.locator(".ns-consent-actions button[data-d=allow]");
  if (await allow.count()) {
    log.consents += 1;
    await allow.first().click().catch(() => {});
    return true;
  }
  const review = page.locator("dialog.assistant-review[open]");
  if (await review.count()) {
    log.dialogs.push((await review.textContent()).replace(/\s+/g, " ").slice(0, 160));
    await review.locator("button:not(.assistant-decline)").last().click().catch(() => {});
    return true;
  }
  const open = page.locator('dialog[open] button:has-text("Open action site")');
  if (await open.count()) {
    const popupEvent = context.waitForEvent("page", { timeout: 30000 });
    await open.first().click();
    const popup = await popupEvent;
    await popup.waitForSelector("dialog[open]", { timeout: 20000 });
    log.partnerWindows.push(new URL(popup.url()).origin);
    await popup.click('dialog[open] button:has-text("Confirm actions")');
    return true;
  }
  return false;
}

async function turn(context, page, message, log) {
  const traceBefore = await page.evaluate(() => window.__nsweb?.trace?.events?.length || 0);
  const botsBefore = await page.locator(".ns-msg.bot:not(.ns-turn-status)").count();
  await page.fill("#ns-input", message);
  await page.click("#ns-send");
  const started = Date.now();
  let quiet = 0;
  while (Date.now() - started < 240000) {
    if (await autopilot(context, page, log)) {
      quiet = 0;
      continue;
    }
    const running = await page.locator(".ns-turn-status").count();
    const bots = await page.locator(".ns-msg.bot:not(.ns-turn-status)").count();
    quiet = !running && bots > botsBefore ? quiet + 1 : 0;
    if (quiet >= 4) break;
    await page.waitForTimeout(500);
  }
  log.seconds = Math.round((Date.now() - started) / 1000);
  log.timedOut = quiet < 4;
  log.reply = ((await page.locator(".ns-msg.bot:not(.ns-turn-status)").last().textContent()) || "").replace(/\s+/g, " ").trim();
  const events = await page.evaluate((from) => (window.__nsweb?.trace?.events || []).slice(from).map((e) => ({
    phase: e.phase, kind: e.kind, agent: e.agent, origin: e.origin, tool: e.tool, status: e.status, error: e.error,
    peer: e.peerOrigin || e.peerLabel || e.url,
  })), traceBefore);
  log.agents = [...new Set(events.filter((e) => e.kind === "agent" && e.phase === "start").map((e) => `${e.agent}@${e.origin}`))];
  log.tools = events.filter((e) => e.kind === "tool" && e.phase === "end").map((e) => `${e.tool}:${e.status}`);
  log.remoteCalls = events.filter((e) => e.kind === "remote_call" && e.phase === "start").map((e) => e.peer || "?");
  log.errors = events.filter((e) => e.error).map((e) => String(e.error).slice(0, 200));
}

async function runSite(browser, id) {
  const scenario = SCENARIOS[id];
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  await context.addInitScript(([key, router, model]) => {
    sessionStorage.setItem("nsweb-byok-tab-key", key);
    sessionStorage.setItem("nsweb-byok-router", router);
    sessionStorage.setItem("nsweb-byok-model", model);
  }, [KEY, ROUTER, MODEL]);
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  await page.goto(scenario.url, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction(() => /connected/i.test(document.querySelector("#assistant-status")?.textContent || ""), null, { timeout: 30000 }).catch(() => {});
  if (scenario.card) {
    for (const [name, value] of Object.entries(CARD)) {
      await page.fill(`#contact-card input[name="${name}"]`, value);
    }
    await page.locator('#contact-card input[name="phone"]').press("Tab");
  }
  const turns = [];
  for (const message of scenario.turns) {
    const log = { message, consents: 0, dialogs: [], partnerWindows: [] };
    try {
      await turn(context, page, message, log);
    } catch (error) {
      log.failure = String(error.message || error).slice(0, 300);
    }
    turns.push(log);
    console.log(`\n[${id}] > ${message}\n  ${log.timedOut ? "TIMED OUT " : ""}${log.seconds}s · agents: ${(log.agents || []).join(", ")}`);
    console.log(`  tools: ${(log.tools || []).join(", ") || "none"}${log.remoteCalls?.length ? ` · remote: ${log.remoteCalls.join(", ")}` : ""}${log.consents ? ` · consents: ${log.consents}` : ""}${log.partnerWindows.length ? ` · windows: ${log.partnerWindows.join(", ")}` : ""}`);
    if (log.errors?.length || log.failure) console.log(`  ERRORS: ${[log.failure, ...(log.errors || [])].filter(Boolean).join(" | ")}`);
    console.log(`  reply: ${(log.reply || "").slice(0, 600)}`);
    await page.waitForTimeout(PAUSE);
  }
  const board = await page.locator("#board, #plans, #report").first().textContent().catch(() => "");
  await context.close();
  return { id, turns, pageErrors, pageState: (board || "").replace(/\s+/g, " ").slice(0, 800) };
}

async function main() {
  if (!KEY) {
    console.error("Set LIVE_KEY to a key for the router (Groq by default).");
    process.exit(2);
  }
  const ids = process.argv.slice(2).length ? process.argv.slice(2) : ["beacon", "concierge", "quorum"];
  const { chromium } = require("playwright");
  const proxy = process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {};
  const browser = await chromium.launch(proxy);
  const report = [];
  try {
    for (const id of ids) {
      report.push(await runSite(browser, id));
    }
  } finally {
    await browser.close();
  }
  if (process.env.LIVE_OUT) {
    writeFileSync(process.env.LIVE_OUT, JSON.stringify({ model: MODEL, router: ROUTER, at: new Date().toISOString(), report }, null, 2));
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
