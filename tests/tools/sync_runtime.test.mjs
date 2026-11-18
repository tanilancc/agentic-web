// Tests for tools/sync_runtime.mjs: copying the runtime into each site.

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import test from "node:test";
import { RuntimeSync } from "../../tools/sync_runtime.mjs";

/**
 * Build a small stand-in repository with a source runtime and one site.
 *
 * :return: The repository root and the site's runtime folder.
 */
function makeRepo() {
  const root = mkdtempSync(join(tmpdir(), "sync-runtime-"));
  const source = join(root, "skills", "agentify-website", "runtime");
  mkdirSync(join(source, "b"), { recursive: true });
  writeFileSync(join(source, "a.js"), "export const a = 1;\n");
  writeFileSync(join(source, "b", "c.js"), "export const c = 2;\n");
  const siteRuntime = join(root, "apps", "beacon", "runtime");
  mkdirSync(siteRuntime, { recursive: true });
  writeFileSync(join(siteRuntime, "stale.js"), "old\n");
  mkdirSync(join(root, "apps", "shared"), { recursive: true });
  writeFileSync(join(root, "apps", "shared", "desk.js"), "export const desk = 1;\n");
  writeFileSync(join(root, "apps", "sites.json"), JSON.stringify({
    sites: [{ id: "beacon", dir: "apps/beacon", port: 8090, openAs: "localhost", shared: ["desk.js"] }],
  }));
  return { root, siteRuntime };
}

/**
 * List the files under a folder, as sorted relative paths with forward slashes.
 *
 * :param folder: The folder to walk.
 * :return: The relative file paths.
 */
function listFiles(folder) {
  const found = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) {
        walk(path);
      } else {
        found.push(relative(folder, path).split("\\").join("/"));
      }
    }
  };
  walk(folder);
  return found.sort();
}

test("syncSite replaces runtime with an exact copy", () => {
  const { root, siteRuntime } = makeRepo();
  const sync = new RuntimeSync(root);
  const out = sync.syncSite(sync.sites()[0]);
  assert.deepEqual(listFiles(siteRuntime), ["a.js", "b/c.js"]);
  assert.equal(out.copied, 2);
});

test("syncSite copies the shared files a site lists", () => {
  const { root } = makeRepo();
  const sync = new RuntimeSync(root);
  sync.syncSite(sync.sites()[0]);
  assert.deepEqual(listFiles(join(root, "apps", "beacon", "shared")), ["desk.js"]);
});

test("check names sites whose runtime differs", () => {
  const { root, siteRuntime } = makeRepo();
  const sync = new RuntimeSync(root);
  sync.syncAll();
  assert.deepEqual(sync.check(), []);
  writeFileSync(join(siteRuntime, "a.js"), "changed");
  assert.deepEqual(sync.check(), ["beacon"]);
});

test("check names a site with an extra runtime file", () => {
  const { root, siteRuntime } = makeRepo();
  const sync = new RuntimeSync(root);
  sync.syncAll();
  writeFileSync(join(siteRuntime, "extra.js"), "x");
  assert.deepEqual(sync.check(), ["beacon"]);
});

test("syncAll returns the ids it synced", () => {
  const { root } = makeRepo();
  assert.deepEqual(new RuntimeSync(root).syncAll(), ["beacon"]);
});

test("a site folder outside the repository is refused", () => {
  const { root } = makeRepo();
  const sync = new RuntimeSync(root);
  assert.throws(() => sync.syncSite({ id: "x", dir: "../elsewhere", shared: [] }), /outside the repository/);
});
