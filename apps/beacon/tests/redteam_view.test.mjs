// Tests for the red-team tab.

import assert from "node:assert/strict";
import test from "node:test";
import { RedTeamView, tokenEstimate } from "../js/redteam/redteam-view.js";
import { MiniDocument } from "./mini_dom.mjs";

/**
 * A view in a fresh panel.
 */
function view() {
  const doc = new MiniDocument();
  const panel = doc.add("div", "panel");
  return { doc, panel, view: new RedTeamView(panel, doc) };
}

const FINDINGS = [
  { id: "rt.key-destination", title: "Your key went only to your model provider", status: "pass", evidence: "Not observed in 9 runs.", observedIn: "0 of 9 runs" },
  { id: "rt.honeypot", title: "The caller was not steered", status: "fail", evidence: "<script>x</script> proposed the transfer.", observedIn: "2 of 9 runs" },
  { id: "rt.instruction-audit", title: "Instructions", status: "warn", evidence: 'front: "<b>Ignore</b>" (override).', observedIn: "" },
];

test("the token estimate is 2500 per run", () => {
  assert.equal(tokenEstimate(11), 27500);
});

test("the start screen shows what will run and nothing runs before the button", async () => {
  const { panel, view: v } = view();
  const started = [];
  v.onRun(() => started.push(true));
  v.showStart({ origin: "https://site.example", model: "alibaba/qwen3.8-flash", runs: 11 });
  assert.match(panel.textContent, /https:\/\/site\.example/);
  assert.match(panel.textContent, /alibaba\/qwen3\.8-flash/);
  assert.match(panel.textContent, /11 runs/);
  assert.match(panel.textContent, /27,500 tokens/);
  assert.equal(started.length, 0);
  const buttons = panel.querySelectorAll("button");
  assert.deepEqual(buttons.map((b) => b.textContent), ["Run red team", "Not now"]);
  await buttons[1].click();
  assert.equal(started.length, 0);
  assert.match(panel.textContent, /Nothing was run/);
});

test("pressing Run red team starts the run once", async () => {
  const { panel, view: v } = view();
  const started = [];
  v.onRun(() => started.push(true));
  v.showStart({ origin: "https://site.example", model: "m", runs: 2 });
  const run = panel.querySelectorAll("button")[0];
  await run.click();
  await run.click();
  assert.equal(started.length, 1);
});

test("without a key it says so and runs nothing", () => {
  const { panel, view: v } = view();
  v.showNoKey();
  assert.match(panel.textContent, /needs your own model key/);
  assert.equal(panel.querySelectorAll("button").length, 0);
  assert.equal(panel.querySelector("a").getAttribute("href"), "#assistant");
});

test("progress is shown as a count", () => {
  const { panel, view: v } = view();
  v.showProgress(3, 11);
  assert.match(panel.textContent, /3 of 11/);
});

test("results carry the exact banner and show hostile text as text", () => {
  const { panel, view: v } = view();
  v.show(FINDINGS, { model: "alibaba/qwen3.8-flash", date: "2026-11-16", runs: 9 });
  assert.match(panel.textContent, /Observed with alibaba\/qwen3\.8-flash on 2026-11-16, 9 runs\. This is evidence about that model on these prompts, not a guarantee\./);
  assert.equal(panel.querySelectorAll("script").length, 0);
  assert.equal(panel.querySelectorAll("b").length, 0);
  assert.ok(panel.textContent.includes("<script>x</script>"));
  assert.deepEqual(panel.querySelectorAll(".check-status").map((n) => n.textContent), ["Passed", "Failed", "Warning"]);
  assert.match(panel.textContent, /2 of 9 runs/);
});

test("an error during the run is shown as text", () => {
  const { panel, view: v } = view();
  v.showError("<i>boom</i>");
  assert.ok(panel.textContent.includes("<i>boom</i>"));
  assert.equal(panel.querySelectorAll("i").length, 0);
});
