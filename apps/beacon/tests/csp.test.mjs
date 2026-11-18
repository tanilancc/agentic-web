// Beacon renders other sites' data on the origin that stores the visitor's key, so its
// pages allow only their own scripts, and refuse to be framed.

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const HERE = new URL("../", import.meta.url);

for (const page of ["index.html", "try.html"]) {
  test(`${page} allows only Beacon's own scripts`, async () => {
    const html = await readFile(new URL(page, HERE), "utf8");
    const meta = /<meta http-equiv="Content-Security-Policy" content="([^"]+)">/.exec(html);
    assert.ok(meta, "the page has a Content-Security-Policy");
    const policy = meta[1];
    assert.match(policy, /script-src 'self'(;|$)/);
    assert.match(policy, /object-src 'none'/);
    assert.match(policy, /base-uri 'none'/);
    assert.doesNotMatch(policy, /unsafe-eval/);
    assert.doesNotMatch(policy.split(";").find((part) => part.trim().startsWith("script-src")), /unsafe-inline/);
    // Every script is a file: an inline script would be blocked by the policy.
    for (const tag of html.match(/<script\b[^>]*>/g) || []) {
      assert.match(tag, /\ssrc="/, tag);
    }
  });
}

test("the pages refuse to be framed, and the bridge stays framable", async () => {
  const headers = await readFile(new URL("_headers", HERE), "utf8");
  for (const path of ["/", "/index.html", "/try.html"]) {
    const block = headers.split(/\n(?=\/)/).find((part) => part.startsWith(`${path}\n`));
    assert.ok(block, path);
    assert.match(block, /frame-ancestors 'none'/, path);
  }
  assert.doesNotMatch(headers, /\/bridge[^\n]*\n[^/]*frame-ancestors/);
});
