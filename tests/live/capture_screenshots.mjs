// Takes the submission screenshots from the live sites with a real model, at 2x scale.
// Like run_live_model_check.mjs it needs a real key, and it books and orders in the demo
// town in its own browser only.
//   LIVE_KEY=gsk_... node tests/live/capture_screenshots.mjs [out dir]
// Default out dir: docs/submission/screenshots. LIVE_ROUTER, LIVE_MODEL and LIVE_PAUSE_MS
// work as in run_live_model_check.mjs.
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const KEY = process.env.LIVE_KEY || "";
const ROUTER = process.env.LIVE_ROUTER || "https://api.groq.com/openai/v1";
const MODEL = process.env.LIVE_MODEL || "openai/gpt-oss-120b";
const PAUSE = Number(process.env.LIVE_PAUSE_MS || 65000);
const OUT = process.argv[2] || "docs/submission/screenshots";
// LIVE_ONLY=concierge (or beacon, quorum, comma-separated) re-takes just those shots.
const ONLY = (process.env.LIVE_ONLY || "beacon,concierge,quorum").split(",");
const CARD = { firstName: "Test", lastName: "Visitor", email: "test.visitor@example.com", phone: "0100 000 000" };

const shot = async (target, name) => {
  await target.screenshot({ path: path.join(OUT, name) });
  console.log(`saved ${name}`);
};

/**
 * Send one message and act as the visitor until the turn ends. The first consent card,
 * review dialog and partner window are photographed once each, under the names given.
 */
async function visit(context, page, message, names = {}) {
  const taken = new Set();
  const botsBefore = await page.locator(".ns-msg.bot:not(.ns-turn-status)").count();
  await page.fill("#ns-input", message);
  await page.click("#ns-send");
  const started = Date.now();
  let quiet = 0;
  while (Date.now() - started < 300000) {
    const allow = page.locator(".ns-consent-actions button[data-d=allow]");
    if (await allow.count()) {
      if (names.consent && !taken.has("consent")) {
        taken.add("consent");
        const card = page.locator(".ns-consent").last();
        await card.scrollIntoViewIfNeeded();
        await page.waitForTimeout(300);
        await shot(page.locator("#assistant"), names.consent);
      }
      await allow.first().click();
      quiet = 0;
      continue;
    }
    const review = page.locator("dialog.assistant-review[open]");
    if (await review.count()) {
      if (names.review && !taken.has("review")) {
        taken.add("review");
        await page.waitForTimeout(300);
        await shot(page, names.review);
      }
      await review.locator("button:not(.assistant-decline)").last().click();
      quiet = 0;
      continue;
    }
    const open = page.locator('dialog[open] button:has-text("Open action site")');
    if (await open.count()) {
      const popupEvent = context.waitForEvent("page", { timeout: 30000 });
      await open.first().click();
      const popup = await popupEvent;
      await popup.setViewportSize({ width: 900, height: 900 });
      await popup.waitForSelector("dialog[open]", { timeout: 20000 });
      if (names.partner && !taken.has("partner")) {
        taken.add("partner");
        await popup.waitForTimeout(300);
        await shot(popup, names.partner);
      }
      await popup.click('dialog[open] button:has-text("Confirm actions")');
      quiet = 0;
      continue;
    }
    const running = await page.locator(".ns-turn-status").count();
    const bots = await page.locator(".ns-msg.bot:not(.ns-turn-status)").count();
    quiet = !running && bots > botsBefore ? quiet + 1 : 0;
    if (quiet >= 4) break;
    await page.waitForTimeout(500);
  }
  const reply = (await page.locator(".ns-msg.bot:not(.ns-turn-status)").last().textContent()) || "";
  console.log(`> ${message}\n  ${reply.replace(/\s+/g, " ").slice(0, 200)}`);
  await page.waitForTimeout(1000);
}

async function open(browser, url, card) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2, ignoreHTTPSErrors: true });
  await context.addInitScript(([key, router, model]) => {
    sessionStorage.setItem("nsweb-byok-tab-key", key);
    sessionStorage.setItem("nsweb-byok-router", router);
    sessionStorage.setItem("nsweb-byok-model", model);
  }, [KEY, ROUTER, MODEL]);
  const page = await context.newPage();
  await page.goto(url, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction(() => /connected/i.test(document.querySelector("#assistant-status")?.textContent || ""), null, { timeout: 30000 }).catch(() => {});
  if (card) {
    for (const [name, value] of Object.entries(CARD)) {
      await page.fill(`#contact-card input[name="${name}"]`, value);
    }
    await page.locator('#contact-card input[name="phone"]').press("Tab");
  }
  return { context, page };
}

async function main() {
  if (!KEY) {
    console.error("Set LIVE_KEY to a key for the router (Groq by default).");
    process.exit(2);
  }
  mkdirSync(OUT, { recursive: true });
  const { chromium } = require("playwright");
  const browser = await chromium.launch(process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {});
  try {
    // Beacon: an inspection report and the directory. No model needed.
    if (ONLY.includes("beacon")) {
    const beacon = await open(browser, "https://oaw-beacon.pages.dev/");
    await beacon.page.fill("#site-url", "https://oaw-concierge.pages.dev/marrow_point_concierge");
    await beacon.page.click('#inspect-form button[type="submit"]');
    await beacon.page.waitForFunction(() => /Conformant/.test(document.querySelector("#report")?.textContent || ""), null, { timeout: 60000 });
    await beacon.page.waitForTimeout(800);
    await shot(beacon.page.locator(".workspace"), "01-beacon-report.png");
    await beacon.context.close();
    }

    // Town Concierge: consent, planning across two businesses, a question to a business's
    // own assistant, and booking in each business's window.
    if (ONLY.includes("concierge")) {
    const c = await open(browser, "https://oaw-concierge.pages.dev/", true);
    await visit(c.context, c.page, "What rooms are free at the guesthouse for two adults from 10 to 12 December 2026?", { consent: "02-consent-card.png" });
    await c.page.waitForTimeout(PAUSE);
    await visit(c.context, c.page, "Add the cheapest of those rooms for those dates, arriving between 7 pm and 9 pm.");
    await c.page.waitForTimeout(PAUSE);
    await visit(c.context, c.page, "Add the 10:00 Seal Rocks Cruise on 11 December 2026 for both of us. Does the plan work?");
    await shot(c.page.locator("#board"), "03-trip-board.png");
    await c.page.waitForTimeout(PAUSE);
    await visit(c.context, c.page, "Are dogs allowed at the guesthouse?", { consent: "04-ask-the-guesthouse.png" });
    await shot(c.page.locator("#assistant"), "05-agent-to-agent-answer.png");
    await c.page.waitForTimeout(PAUSE);
    await visit(c.context, c.page, "Book the whole trip.", { review: "06-review-dialog.png", partner: "07-business-window.png" });
    await shot(c.page.locator("#board"), "08-trip-booked.png");
    await c.context.close();
    }
    if (ONLY.includes("quorum")) {
    if (ONLY.length > 1) await new Promise((resolve) => setTimeout(resolve, PAUSE));

    // Quorum: the best plan against the best single vendor.
    const q = await open(browser, "https://oaw-quorum.pages.dev/", true);
    await visit(q.context, q.page, "Find the best plan for our team dinner.");
    await shot(q.page.locator(".results"), "09-quorum-best-plan.png");
    await q.context.close();
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
