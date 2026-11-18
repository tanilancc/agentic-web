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
