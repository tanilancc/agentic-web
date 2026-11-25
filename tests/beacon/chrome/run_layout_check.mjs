// Checks that Beacon's page does not jump while it loads (cumulative layout shift under
// 0.1, the "good" limit), on a throttled phone like Lighthouse's mobile run.
// Run from the repository root: node tests/beacon/chrome/run_layout_check.mjs
//
// Beacon's report and directory fill in after the page's script and index load. Before
// this check, the assistant section below them was pushed off the screen as they did.
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const SERVE = path.join(ROOT, "skills/agentify-website/scripts/serve_site.mjs");
const BEACON = "http://localhost:8090/";
const LIMIT = 0.1;
// Phone sizes and a desktop, each loaded on a slow network with a slow CPU.
const VIEWPORTS = [
  { name: "phone", width: 412, height: 823, isMobile: true },
  { name: "small phone", width: 360, height: 640, isMobile: true },
  { name: "desktop", width: 1350, height: 940, isMobile: false },
];

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
 * Load the page once and return its layout shifts, with the elements that moved.
 */
async function measure(browser, viewport) {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, isMobile: viewport.isMobile });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await page.addInitScript(() => {
    window.__shifts = [];
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput) {
          const moved = (entry.sources || []).map((s) => s.node && (s.node.id ? `#${s.node.id}` : s.node.nodeName)).filter(Boolean);
          window.__shifts.push({ value: entry.value, moved });
        }
      }
    }).observe({ type: "layout-shift", buffered: true });
  });
  await page.goto(BEACON, { waitUntil: "networkidle" });
  await page.waitForTimeout(4000);
  const shifts = await page.evaluate(() => window.__shifts);
  await context.close();
  return shifts;
}

async function main() {
  const { chromium } = require("playwright");
  const work = mkdtempSync(path.join(tmpdir(), "beacon-layout-"));
  const server = spawn(process.execPath, [SERVE, path.join(ROOT, "apps/beacon"), "--port", "8090", "--open-as", "localhost", "--log", path.join(work, "beacon.jsonl")], { stdio: "ignore" });
  let failed = false;
  try {
    await waitFor(BEACON);
    const browser = await chromium.launch();
    for (const viewport of VIEWPORTS) {
      const shifts = await measure(browser, viewport);
      const total = shifts.reduce((sum, s) => sum + s.value, 0);
      const ok = total < LIMIT;
      failed ||= !ok;
      const moved = [...new Set(shifts.flatMap((s) => s.moved))].join(", ");
      console.log(`${ok ? "PASS" : "FAIL"}  ${viewport.name} ${viewport.width}x${viewport.height}: layout shift ${total.toFixed(3)}${moved ? ` (moved: ${moved})` : ""}`);
    }
    await browser.close();
  } finally {
    server.kill();
  }
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
