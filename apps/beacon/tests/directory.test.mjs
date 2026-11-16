// Tests for the directory: the index rules, search, and the list on the page.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { searchDirectory, validateIndex } from "../js/directory.js";
import { DirectoryView } from "../js/directory-view.js";
import { MiniDocument } from "./mini_dom.mjs";

/**
 * One valid index entry, with changes.
 */
function site(extra = {}) {
  return {
    url: "https://tidewhistle.example/tidewhistle_guesthouse", name: "Tidewhistle Guesthouse",
    description: "Rooms, prices and bookings for a small seaside guesthouse.",
    tags: ["lodging", "booking"], submittedBy: "tanilancc", ...extra,
  };
}
const doc1 = (...sites) => ({ version: 1, sites });

const SITES = [
  site(),
  site({ url: "https://tours.example/harbor_tours", name: "Harbor Tours", description: "Seal watching boat trips and harbor cruises.", tags: ["tours", "booking"] }),
  site({ url: "https://oven.example/little_oven", name: "Little Oven Pizza", description: "Pizza menu, cart and delivery orders.", tags: ["food"] }),
];

test("a valid index has no problems", () => {
  assert.deepEqual(validateIndex(doc1(...SITES)), []);
});

test("the committed index and status files are valid", () => {
  const index = JSON.parse(readFileSync(new URL("../index/sites.json", import.meta.url), "utf8"));
  assert.deepEqual(validateIndex(index), []);
  const status = JSON.parse(readFileSync(new URL("../index/status.json", import.meta.url), "utf8"));
  assert.equal(status.version, 1);
  assert.equal(typeof status.sites, "object");
});

for (const [label, bad, pattern] of [
  ["a url that is not a network URL", site({ url: "https://x.example/" }), /url/],
  ["a url that is not http", site({ url: "javascript:alert(1)" }), /url/],
  ["an empty name", site({ name: "" }), /name/],
  ["a name over 60 characters", site({ name: "x".repeat(61) }), /name/],
  ["an empty description", site({ description: " " }), /description/],
  ["a description over 200 characters", site({ description: "x".repeat(201) }), /description/],
  ["more than 8 tags", site({ tags: ["a1", "a2", "a3", "a4", "a5", "a6", "a7", "a8", "a9"] }), /tags/],
  ["a tag with a space", site({ tags: ["two words"] }), /tag/],
  ["a tag in upper case", site({ tags: ["Food"] }), /tag/],
  ["tags that are not a list", site({ tags: "food" }), /tags/],
  ["a missing submitter", site({ submittedBy: "" }), /submittedBy/],
  ["an extra key", site({ rank: 1 }), /rank/],
]) {
  test(`validateIndex rejects ${label}`, () => {
    const problems = validateIndex(doc1(bad));
    assert.equal(problems.length, 1, JSON.stringify(problems));
    assert.match(problems[0], pattern);
    assert.match(problems[0], /sites\[0\]/);
  });
}

test("validateIndex rejects a duplicate url", () => {
  assert.match(validateIndex(doc1(site(), site({ name: "Copy" })))[0], /duplicate/);
});

test("validateIndex rejects a document of the wrong shape", () => {
  assert.equal(validateIndex(null).length, 1);
  assert.equal(validateIndex({ version: 2, sites: [] }).length, 1);
  assert.equal(validateIndex({ version: 1, sites: "x" }).length, 1);
  assert.equal(validateIndex(doc1("text")).length, 1);
});

test("search ranks by how many words match", () => {
  const found = searchDirectory(SITES, "boat trips booking");
  assert.deepEqual(found.map((s) => s.name), ["Harbor Tours", "Tidewhistle Guesthouse"]);
});

test("search ignores case, punctuation and one-letter words", () => {
  assert.deepEqual(searchDirectory(SITES, "A PIZZA!").map((s) => s.name), ["Little Oven Pizza"]);
});

test("search with no match returns nothing", () => {
  assert.deepEqual(searchDirectory(SITES, "dentist"), []);
});

test("search filters by every requested tag", () => {
  assert.deepEqual(searchDirectory(SITES, "", ["booking"]).map((s) => s.name), ["Harbor Tours", "Tidewhistle Guesthouse"]);
  assert.deepEqual(searchDirectory(SITES, "", ["booking", "tours"]).map((s) => s.name), ["Harbor Tours"]);
  assert.deepEqual(searchDirectory(SITES, "pizza", ["booking"]), []);
});

test("an empty query lists the first ten by name", () => {
  const many = Array.from({ length: 12 }, (_, i) => site({ url: `https://s${i}.example/net`, name: `Site ${String(i).padStart(2, "0")}` }));
  const found = searchDirectory(many.slice().reverse(), "");
  assert.equal(found.length, 10);
  assert.equal(found[0].name, "Site 00");
  assert.equal(searchDirectory(many, "site").length, 10);
});

test("search survives entries and queries of the wrong shape", () => {
  assert.deepEqual(searchDirectory([null, { name: 5 }, ...SITES], "pizza").map((s) => s.name), ["Little Oven Pizza"]);
  assert.equal(searchDirectory(SITES, null).length, 3);
  assert.equal(searchDirectory(SITES, "pizza", "food").length, 1);
});

test("the directory lists sites with their level and tells the page which was picked", async () => {
  const doc = new MiniDocument();
  const root = doc.add("section", "directory");
  const view = new DirectoryView(root, doc);
  const picked = [];
  view.onPick((url) => picked.push(url));
  view.show(SITES, { version: 1, sites: { [SITES[1].url]: { level: "warnings", checkedAt: "2026-11-16T00:00:00Z" } } });
  const items = root.querySelectorAll(".site");
  assert.deepEqual(items.map((item) => item.querySelector(".site-name").textContent),
    ["Harbor Tours", "Little Oven Pizza", "Tidewhistle Guesthouse"]);
  assert.match(items[0].textContent, /Conformant with warnings/);
  assert.match(items[1].textContent, /Not checked yet/);
  await items[0].querySelector("button").click();
  assert.deepEqual(picked, ["https://tours.example/harbor_tours"]);
});

test("typing in the directory's search box filters the list", async () => {
  const doc = new MiniDocument();
  const root = doc.add("section", "directory");
  const view = new DirectoryView(root, doc);
  view.show(SITES, { version: 1, sites: {} });
  const box = root.querySelector("input");
  box.value = "pizza";
  await box.dispatch("input");
  assert.deepEqual(root.querySelectorAll(".site-name").map((node) => node.textContent), ["Little Oven Pizza"]);
  box.value = "dentist";
  await box.dispatch("input");
  assert.match(root.textContent, /No listed site matches/);
});

test("an empty directory says how to get listed", () => {
  const doc = new MiniDocument();
  const root = doc.add("section", "directory");
  new DirectoryView(root, doc).show([], { version: 1, sites: {} });
  assert.match(root.textContent, /No sites are listed yet/);
});

test("a hostile name renders as text", () => {
  const doc = new MiniDocument();
  const root = doc.add("section", "directory");
  new DirectoryView(root, doc).show([site({ name: "<img src=x onerror=alert(1)>" })], { version: 1, sites: {} });
  assert.equal(root.querySelectorAll("img").length, 0);
  assert.ok(root.textContent.includes("<img src=x"));
});
