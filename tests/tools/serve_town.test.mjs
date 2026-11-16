// Tests for tools/serve_town.mjs: one local origin per site.

import assert from "node:assert/strict";
import test from "node:test";
import { TownServer } from "../../tools/serve_town.mjs";

test("plan gives each site its own origin", () => {
  const plan = TownServer.plan([
    { id: "a", dir: "x", port: 1, openAs: "localhost" },
    { id: "b", dir: "y", port: 2, openAs: "127.0.0.1" },
  ]);
  assert.deepEqual(plan.map((p) => p.url), ["http://localhost:1/", "http://127.0.0.1:2/"]);
});

test("plan rejects two sites on one origin", () => {
  assert.throws(() => TownServer.plan([
    { id: "a", dir: "x", port: 1, openAs: "localhost" },
    { id: "b", dir: "y", port: 1, openAs: "localhost" },
  ]), /same origin/);
});

test("plan rejects two sites on one port", () => {
  // Both servers bind to 127.0.0.1, so a port can be used once whatever the host name.
  assert.throws(() => TownServer.plan([
    { id: "a", dir: "x", port: 1, openAs: "localhost" },
    { id: "b", dir: "y", port: 1, openAs: "127.0.0.1" },
  ]), /same port/);
});

test("importing the module starts no server", () => {
  assert.equal(typeof TownServer.main, "function");
});
