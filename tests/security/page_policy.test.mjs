// Every page a visitor opens directly carries a Content-Security-Policy that allows only
// the site's own scripts, and cannot be framed by another site. bridge/ and partner-desk/
// are left out: other sites load them in a frame on purpose.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import { parseHeaders } from "../../tools/deploy_pages.mjs";

const ROOT = new URL("../../", import.meta.url);
const { sites } = JSON.parse(readFileSync(new URL("apps/sites.json", ROOT), "utf8"));

for (const site of sites) {
  const pages = readdirSync(new URL(`${site.dir}/`, ROOT)).filter((name) => name.endsWith(".html"));
  const rules = parseHeaders(readFileSync(new URL(`${site.dir}/_headers`, ROOT), "utf8"));
  const framing = (path) => rules.some((rule) => rule.pattern === path && /frame-ancestors 'none'/.test(rule.headers["Content-Security-Policy"] || ""));

  for (const page of pages) {
    test(`${site.id}/${page} allows only its own scripts and cannot be framed`, () => {
      const html = readFileSync(new URL(`${site.dir}/${page}`, ROOT), "utf8");
      const meta = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/);
      assert.ok(meta, "No Content-Security-Policy meta tag.");
      for (const directive of ["script-src 'self'", "object-src 'none'", "base-uri 'none'"]) {
        assert.ok(meta[1].includes(directive), `The policy lacks ${directive}.`);
      }
      assert.doesNotMatch(html, /<script(?![^>]*\ssrc=)[^>]*>/, "Inline scripts would be blocked.");
      assert.ok(framing(`/${page}`), `_headers has no frame-ancestors 'none' for /${page}.`);
      if (page === "index.html") {
        assert.ok(framing("/"), "_headers has no frame-ancestors 'none' for /.");
      }
    });
  }
}
