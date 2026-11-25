// The town sites link to each other at their live addresses, with the local address for
// development, and no site page links to a made-up example.com web address.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

const ROOT = new URL("../../", import.meta.url);
const { sites } = JSON.parse(readFileSync(new URL("apps/sites.json", ROOT), "utf8"));

test("no site page links to an example.com web address", () => {
  for (const site of sites) {
    for (const page of readdirSync(new URL(`${site.dir}/`, ROOT)).filter((n) => n.endsWith(".html"))) {
      const html = readFileSync(new URL(`${site.dir}/${page}`, ROOT), "utf8");
      assert.doesNotMatch(html, /href="https?:\/\/[^"]*example\.com/i, `${site.id}/${page}`);
    }
  }
});

for (const [dir, live, local] of [
  ["apps/town/guesthouse", "https://oaw-harbor-tours.pages.dev/", "http://localhost:8081/"],
  ["apps/town/harbor_tours", "https://oaw-tidewhistle.pages.dev/", "http://127.0.0.1:8080/"],
]) {
  test(`${dir} links its neighbor live, with the local address for development`, () => {
    const html = readFileSync(new URL(`${dir}/index.html`, ROOT), "utf8");
    assert.ok(html.includes(`<a href="${live}" data-local-href="${local}">`));
    assert.match(readFileSync(new URL(`${dir}/js/app.js`, ROOT), "utf8"), /useLocalLinks\(/);
    assert.ok(JSON.parse(readFileSync(new URL("apps/sites.json", ROOT), "utf8")).sites.find((s) => dir.endsWith(s.dir.split("/").pop()) || s.dir === dir).shared.includes("site-origin.js"));
  });
}
