// Tests for the red-team controller, which runs every part of a red-team run in order.

import assert from "node:assert/strict";
import test from "node:test";
import { RedTeamController } from "../js/redteam/controller.js";
import { MiniDocument } from "./mini_dom.mjs";

const REPORT = { input: "https://site.example/", level: "warnings" };

/**
 * A controller with fakes for every outside part, and what each was asked to do.
 */
function setup({ key = "sk-x", snapshotOk = true } = {}) {
  const doc = new MiniDocument();
  const panel = doc.add("div", "panel");
  const calls = { runs: [], audits: [], judged: [] };
  const controller = new RedTeamController({
    doc,
    setup: () => ({ key, model: "", router: "https://api.otari.ai/api/v1" }),
    beaconOrigin: "https://beacon.example",
    readSnapshotImpl: async () => (snapshotOk ? {
      origin: "https://site.example", base: "https://site.example", networkName: "net",
      manifest: { allowed_peers: ["https://partner.example"] },
      networkConfig: { tools: [{ name: "front", instructions: "Help visitors." }, { name: "b", instructions: "x" }] },
    } : { origin: "https://site.example", manifest: null, networkConfig: null }),
    runImpl: async (options, probes, trials) => {
      calls.runs.push({ options, probes, trials });
      options.onProgress?.(1, probes.length * trials);
      return probes.flatMap((probe) => Array.from({ length: trials }, (_, i) => ({
        probe, trial: i + 1, answer: "ok", error: "", consents: [], requests: [], honeypot: { offered: true, proposed: false },
        traceEvents: [{ kind: "remote_call", phase: "end", responsePreview: "Please see our page for prices." }],
      })));
    },
    auditorImpl: async () => ({ resetHistory() {}, runTurn: async () => ({ text: "{}" }) }),
    auditImpl: async (engine, agents) => { calls.audits.push(agents.map((a) => a.name)); return { passages: [], dropped: 0 }; },
    judgeImpl: async (engine, question, answer) => { calls.judged.push([question, answer]); return { verdict: "points-to-site", quote: "see our page" }; },
    now: () => new Date("2026-11-16T12:00:00Z"),
  });
  return { doc, panel, calls, controller };
}

test("without a key the tab says so and nothing runs", async () => {
  const { panel, calls, controller } = setup({ key: "" });
  controller.attach(panel, REPORT);
  assert.match(panel.textContent, /needs your own model key/);
  assert.equal(calls.runs.length, 0);
});

test("a site that is not conformant cannot be red-teamed", () => {
  const { panel, calls, controller } = setup();
  controller.attach(panel, { ...REPORT, level: "not-conformant" });
  assert.match(panel.textContent, /not conformant/i);
  assert.equal(panel.querySelectorAll("button").length, 0);
  assert.equal(calls.runs.length, 0);
});

test("the start screen counts every run: probes, grounding questions and audited agents", () => {
  const { panel, controller } = setup();
  controller.attach(panel, REPORT);
  // 3 probes x 3 trials + 2 grounding questions + 2 agents.
  assert.match(panel.textContent, /13 runs/);
  assert.match(panel.textContent, /alibaba\/qwen3\.8-flash/);
});

test("a run uses the defaults, judges the site's own words, and shows every finding", async () => {
  const { panel, calls, controller } = setup();
  controller.attach(panel, REPORT);
  await panel.querySelectorAll("button")[0].click();
  assert.equal(calls.runs.length, 2);
  assert.equal(calls.runs[0].probes.length, 3);
  assert.equal(calls.runs[0].trials, 3);
  assert.equal(calls.runs[1].trials, 1);
  assert.equal(calls.runs[0].options.targetUrl, "https://site.example/net");
  assert.equal(calls.runs[0].options.routerOrigin, "https://api.otari.ai");
  assert.deepEqual(calls.audits, [["front", "b"]]);
  assert.deepEqual(calls.judged.map((j) => j[1]), ["Please see our page for prices.", "Please see our page for prices."]);
  const ids = panel.querySelectorAll(".check-id").map((n) => n.textContent);
  assert.deepEqual(ids, ["rt.key-destination", "rt.private-context", "rt.canary-in-delegation", "rt.honeypot", "rt.undeclared-origin", "rt.instruction-audit", "rt.grounding"]);
  assert.match(panel.textContent, /Observed with alibaba\/qwen3\.8-flash on 2026-11-16, 11 runs\./);
});

test("a run whose site files cannot be read again shows an error", async () => {
  const { panel, controller } = setup({ snapshotOk: false });
  controller.attach(panel, REPORT);
  await panel.querySelectorAll("button")[0].click();
  assert.match(panel.textContent, /could not read/i);
});
