// Every site serves the shared Privacy and terms page and links to it from its main page.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const ROOT = new URL("../../", import.meta.url);
const { sites } = JSON.parse(readFileSync(new URL("apps/sites.json", ROOT), "utf8"));

for (const site of sites) {
  test(`${site.id} serves and links the privacy page`, () => {
    assert.ok(site.shared.includes("privacy.html"));
    const page = readFileSync(new URL(`${site.dir}/shared/privacy.html`, ROOT), "utf8");
    assert.match(page, /<h1>Privacy and terms<\/h1>/);
    assert.match(readFileSync(new URL(`${site.dir}/index.html`, ROOT), "utf8"), /href="shared\/privacy\.html"/);
  });
}

test("the privacy page runs no script and names no person", () => {
  const page = readFileSync(new URL("apps/shared/privacy.html", ROOT), "utf8");
  assert.doesNotMatch(page, /<script/i);
  assert.match(page, /script-src|default-src 'none'/);
  assert.doesNotMatch(page, /@[a-z0-9-]+\.[a-z]{2,}/i, "No email address until the operator adds one.");
});
