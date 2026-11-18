// Tests for the inspector page: the report view and the app that drives it.

import assert from "node:assert/strict";
import test from "node:test";
import { BeaconApp } from "../js/app.js";
import { ReportView } from "../js/report-view.js";
import { MiniDocument } from "./mini_dom.mjs";

/**
 * A report with one result per status.
 */
function sampleReport(extra = {}) {
  return {
    input: "https://site.example/net", base: "https://site.example", networkName: "net",
    origin: "https://site.example", brand: "Example Guide", checkedAt: "2026-11-16T12:00:00.000Z",
    level: "warnings",
    results: [
      { id: "pub.manifest", group: "Publication", spec: "§3.3", title: "Manifest is public", must: true, status: "pass", evidence: "Read.", fix: "" },
      { id: "pol.peer-mode", group: "Policy", spec: "§3.2", title: "Peer policy is closed", must: false, status: "warn", evidence: "Open policy.", fix: "Close it." },
      { id: "act.bridge-loads", group: "Actions and bridge", spec: "§3.4", title: "Bridge loads", must: false, status: "fail", evidence: "Did not load.", fix: "Remove X-Frame-Options." },
      { id: "act.bridge-catalog", group: "Actions and bridge", spec: "§7", title: "Actions offered", must: false, status: "na", evidence: "not checked: act.bridge-loads failed", fix: "" },
    ],
    ...extra,
  };
}

/**
 * A page with the elements the app looks up, and the app's fakes.
 */
function page({ search = "", confirm = true } = {}) {
  const doc = new MiniDocument();
  const form = doc.add("form", "inspect-form");
  const input = doc.add("input", "site-url");
  const root = doc.add("section", "report");
  const state = { asked: [], inspected: [], replaced: [] };
  const app = new BeaconApp({
    doc,
    location: { search, pathname: "/" },
    history: { replaceState: (data, title, url) => state.replaced.push(url) },
    inspectImpl: async (value) => { state.inspected.push(value); return sampleReport({ input: value }); },
    confirmImpl: async (origin) => { state.asked.push(origin); return confirm; },
  });
  return { doc, form, input, root, state, app };
}

test("a report shows its level, counts and every result grouped", () => {
  const doc = new MiniDocument();
  const root = doc.add("section", "report");
  new ReportView(root, doc).show(sampleReport());
  assert.match(root.textContent, /Conformant with warnings/);
  assert.match(root.textContent, /1 passed/);
  assert.match(root.textContent, /1 warning/);
  assert.match(root.textContent, /1 failed/);
  assert.deepEqual(root.querySelectorAll(".check-group-title").map((node) => node.textContent),
    ["Publication", "Policy", "Actions and bridge"]);
  assert.equal(root.querySelectorAll(".check").length, 4);
  assert.match(root.textContent, /§3\.4/);
  assert.match(root.textContent, /Remove X-Frame-Options\./);
});

test("level heading text", () => {
  for (const [level, words] of [["conformant", "Conformant"], ["warnings", "Conformant with warnings"], ["not-conformant", "Not conformant"]]) {
    const doc = new MiniDocument();
    const root = doc.add("section", "report");
    new ReportView(root, doc).show(sampleReport({ level }));
    assert.equal(root.querySelector(".level").textContent, words);
  }
});

test("each result says its status in words, not only by colour", () => {
  const doc = new MiniDocument();
  const root = doc.add("section", "report");
  new ReportView(root, doc).show(sampleReport());
  assert.deepEqual(root.querySelectorAll(".check-status").map((node) => node.textContent),
    ["Passed", "Warning", "Failed", "Not applicable"]);
});

test("hostile brand is shown as text", () => {
  const doc = new MiniDocument();
  const root = doc.add("section", "report");
  new ReportView(root, doc).show(sampleReport({ brand: "<img src=x onerror=alert(1)>" }));
  assert.equal(root.querySelectorAll("img").length, 0);
  assert.ok(root.textContent.includes("<img src=x onerror=alert(1)>"));
});

test("hostile evidence is shown as text", () => {
  const doc = new MiniDocument();
  const root = doc.add("section", "report");
  const report = sampleReport();
  report.results[0].evidence = "<script>alert(1)</script>";
  report.results[0].title = "<b>bold</b>";
  new ReportView(root, doc).show(report);
  assert.equal(root.querySelectorAll("script").length, 0);
  assert.equal(root.querySelectorAll("b").length, 0);
  assert.ok(root.textContent.includes("<script>alert(1)</script>"));
});

test("pending and error states replace the report", () => {
  const doc = new MiniDocument();
  const root = doc.add("section", "report");
  const view = new ReportView(root, doc);
  view.show(sampleReport());
  view.showPending("https://site.example/net");
  assert.match(root.textContent, /Reading public files from site\.example/);
  assert.equal(root.querySelectorAll(".check").length, 0);
  view.showError("<i>bad</i>");
  assert.ok(root.textContent.includes("<i>bad</i>"));
  assert.equal(root.querySelectorAll("i").length, 0);
});

test("the tabs switch panels, and Try it is off for a site that is not conformant", () => {
  const doc = new MiniDocument();
  const root = doc.add("section", "report");
  const view = new ReportView(root, doc);
  view.show(sampleReport());
  const tabs = root.querySelectorAll(".tab");
  assert.deepEqual(tabs.map((tab) => tab.textContent), ["Conformance", "Red team", "Try it"]);
  assert.equal(root.querySelector(".panel-conformance").hidden, false);
  assert.equal(root.querySelector(".panel-redteam").hidden, true);
  tabs[1].click();
  assert.equal(root.querySelector(".panel-conformance").hidden, true);
  assert.equal(root.querySelector(".panel-redteam").hidden, false);
  assert.equal(tabs[1].getAttribute("aria-selected"), "true");
  const link = root.querySelector(".try-link");
  assert.equal(link.getAttribute("href"), "try.html?site=https%3A%2F%2Fsite.example%2Fnet");
  // A report for a bare site address links to the network it found.
  view.show(sampleReport({ input: "https://site.example/", base: "https://site.example", networkName: "net" }));
  assert.equal(root.querySelector(".try-link").getAttribute("href"), "try.html?site=https%3A%2F%2Fsite.example%2Fnet");
  view.show(sampleReport({ level: "not-conformant" }));
  assert.equal(root.querySelector(".try-link"), null);
  assert.match(root.querySelector(".panel-tryit").textContent, /not conformant/i);
});

test("a shared link asks before contacting the site", async () => {
  const { app, state } = page({ search: "?site=https://site.example/net", confirm: false });
  await app.start();
  assert.deepEqual(state.asked, ["https://site.example"]);
  assert.equal(state.inspected.length, 0);
});

test("a shared link inspects after the visitor agrees, and fills the box", async () => {
  const { app, state, input, root } = page({ search: "?site=https%3A%2F%2Fsite.example%2Fnet", confirm: true });
  await app.start();
  assert.deepEqual(state.inspected, ["https://site.example/net"]);
  assert.equal(input.value, "https://site.example/net");
  assert.match(root.textContent, /Conformant with warnings/);
});

test("a shared link that is not a site address asks nothing and contacts nothing", async () => {
  const { app, state, root } = page({ search: "?site=javascript:alert(1)" });
  await app.start();
  assert.equal(state.asked.length, 0);
  assert.equal(state.inspected.length, 0);
  assert.match(root.textContent, /Only http/);
});

test("typing a URL and pressing Inspect needs no second prompt", async () => {
  const { app, state, form, input } = page();
  await app.start();
  input.value = "  https://site.example/net  ";
  const event = await form.dispatch("submit");
  assert.equal(event.defaultPrevented, true);
  assert.equal(state.asked.length, 0);
  assert.deepEqual(state.inspected, ["https://site.example/net"]);
  assert.deepEqual(state.replaced, ["/?site=https%3A%2F%2Fsite.example%2Fnet"]);
});

test("with no link, the page waits and contacts nothing", async () => {
  const { app, state, root } = page();
  await app.start();
  assert.equal(state.inspected.length, 0);
  assert.match(root.textContent, /Paste the address/);
});

test("a slower earlier inspection never overwrites a later one", async () => {
  const { app, root } = page();
  const waits = [];
  app.inspectImpl = (value) => new Promise((resolve) => waits.push(() => resolve(sampleReport({ input: value, brand: value }))));
  const first = app.inspectUrl("https://one.example/n");
  const second = app.inspectUrl("https://two.example/n");
  waits[1]();
  await second;
  waits[0]();
  await first;
  assert.ok(root.textContent.includes("https://two.example/n"));
  assert.ok(!root.textContent.includes("https://one.example/n"));
});

test("an inspection that throws shows an error, not a stuck page", async () => {
  const { app, root } = page();
  app.inspectImpl = async () => { throw new Error("boom"); };
  await app.inspectUrl("https://site.example/net");
  assert.match(root.textContent, /could not finish/i);
});

test("the app keeps the last report for each address and tells listeners", async () => {
  const { app } = page();
  const seen = [];
  app.onReport((report) => seen.push(report.input));
  await app.inspectUrl("https://site.example/net");
  assert.deepEqual(seen, ["https://site.example/net"]);
  assert.equal(app.reportFor("https://site.example/net").level, "warnings");
  assert.equal(app.reportFor("https://other.example/x"), null);
});
