// Partner sites are reached at their local addresses in development and at their
// deployed addresses everywhere else.

import assert from "node:assert/strict";
import test from "node:test";
import { pickOrigin } from "../../apps/shared/site-origin.js";

test("a loopback page uses the local address, any other host the deployed one", () => {
  for (const host of ["localhost", "127.0.0.1", "[::1]", undefined]) {
    assert.equal(pickOrigin("http://127.0.0.1:8080", "https://live.example", host), "http://127.0.0.1:8080");
  }
  assert.equal(pickOrigin("http://127.0.0.1:8080", "https://live.example", "oaw-concierge.pages.dev"), "https://live.example");
});

test("links with a local address switch to it on a loopback host only", async () => {
  const { useLocalLinks } = await import("../../apps/shared/site-origin.js");
  const make = () => {
    const link = { href: "https://oaw-harbor-tours.pages.dev/", getAttribute: (n) => (n === "data-local-href" ? "http://localhost:8081/" : null) };
    return { link, doc: { querySelectorAll: (sel) => (sel === "a[data-local-href]" ? [link] : []) } };
  };
  let page = make();
  assert.equal(useLocalLinks(page.doc, "127.0.0.1"), 1);
  assert.equal(page.link.href, "http://localhost:8081/");
  page = make();
  assert.equal(useLocalLinks(page.doc, "oaw-tidewhistle.pages.dev"), 0);
  assert.equal(page.link.href, "https://oaw-harbor-tours.pages.dev/");
});
