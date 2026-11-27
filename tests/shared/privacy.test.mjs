// Every site serves the shared Privacy and terms page and links to it from its main page.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
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

test("the privacy page names every AI provider the settings offer, with Otari as the default", async () => {
  const { API_KEY_PROVIDERS } = await import("../../skills/agentify-website/runtime/ui.js");
  const page = readFileSync(new URL("apps/shared/privacy.html", ROOT), "utf8");
  const listed = [...page.matchAll(/<li data-provider="([^"]+)">/g)].map((m) => m[1]);
  assert.deepEqual(listed, API_KEY_PROVIDERS.map((p) => p.name), "The list must match the providers in the settings, in order.");
  assert.match(page, /<li data-provider="Otari">[^<]*<strong>[^<]*default/i);
  // Sites with an assistant; the vendors have none.
  for (const site of sites.filter((s) => existsSync(new URL(`${s.dir}/agent-manifest.json`, ROOT)))) {
    const manifest = JSON.parse(readFileSync(new URL(`${site.dir}/agent-manifest.json`, ROOT), "utf8"));
    if (manifest.llm_router) {
      assert.equal(manifest.llm_router.base_url, API_KEY_PROVIDERS[0].router, `${site.id}'s default router is not Otari.`);
    }
  }
  assert.match(page, /another provider's address/i, "Visitors can also enter their own provider address.");
});
