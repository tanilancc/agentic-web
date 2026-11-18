// Copy the browser runtime, and any shared files, into every site in apps/sites.json.
//
// Usage:
//   node tools/sync_runtime.mjs            copy into every site
//   node tools/sync_runtime.mjs --check    change nothing; exit 1 when a copy differs
//
// Each site keeps its own committed copy of the runtime, so a static host can serve the
// site folder as it is. The copies are never edited by hand: this script is the only
// thing that writes them.

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Keeps each site's runtime folder identical to the skill's runtime.
 */
export class RuntimeSync {
  /**
   * The runtime every site copies, relative to the repository root.
   */
  static SOURCE = "skills/agentify-website/runtime";

  /**
   * The folder that holds files shared between sites, relative to the repository root.
   */
  static SHARED = "apps/shared";

  /**
   * :param repoRoot: The repository root folder.
   */
  constructor(repoRoot) {
    this.root = resolve(repoRoot);
  }

  /**
   * Read the site list.
   *
   * :return: The entries of apps/sites.json.
   */
  sites() {
    const doc = JSON.parse(readFileSync(join(this.root, "apps", "sites.json"), "utf8"));
    return doc.sites;
  }

  /**
   * Resolve a site's folder and refuse one outside the repository.
   *
   * :param site: A site entry.
   * :return: The absolute site folder.
   * :raises Error: When the folder is outside the repository.
   */
  siteDir(site) {
    const dir = resolve(this.root, site.dir);
    if (dir !== this.root && !dir.startsWith(this.root + sep)) {
      throw new Error(`Site '${site.id}' is outside the repository: ${site.dir}`);
    }
    return dir;
  }

  /**
   * Replace one site's runtime folder with a fresh copy, and copy its shared files.
   *
   * :param site: A site entry.
   * :return: The number of runtime files copied.
   */
  syncSite(site) {
    const dir = this.siteDir(site);
    const source = join(this.root, RuntimeSync.SOURCE);
    const target = join(dir, "runtime");
    // Remove first: copying into an existing folder would keep files the source dropped.
    rmSync(target, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    cpSync(source, target, { recursive: true });
    const shared = site.shared || [];
    rmSync(join(dir, "shared"), { recursive: true, force: true });
    if (shared.length) {
      mkdirSync(join(dir, "shared"), { recursive: true });
      for (const name of shared) {
        cpSync(join(this.root, RuntimeSync.SHARED, name), join(dir, "shared", name));
      }
    }
    return { copied: RuntimeSync.listFiles(target).length };
  }

  /**
   * Sync every site.
   *
   * :return: The ids of the sites that were synced.
   */
  syncAll() {
    return this.sites().map((site) => {
      this.syncSite(site);
      return site.id;
    });
  }

  /**
   * Find the sites whose copies differ from the source, without writing.
   *
   * :return: The ids of the sites that need a sync.
   */
  check() {
    const source = join(this.root, RuntimeSync.SOURCE);
    return this.sites().filter((site) => {
      const dir = this.siteDir(site);
      if (!RuntimeSync.sameTree(source, join(dir, "runtime"))) {
        return true;
      }
      return (site.shared || []).some((name) => !RuntimeSync.sameFile(
        join(this.root, RuntimeSync.SHARED, name), join(dir, "shared", name)));
    }).map((site) => site.id);
  }

  /**
   * List the files under a folder as relative paths.
   *
   * :param folder: The folder to walk.
   * :return: The sorted relative paths, or an empty list when the folder is missing.
   */
  static listFiles(folder) {
    if (!existsSync(folder)) {
      return [];
    }
    const found = [];
    const walk = (dir) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) {
          walk(path);
        } else {
          found.push(relative(folder, path));
        }
      }
    };
    walk(folder);
    return found.sort();
  }

  /**
   * Say whether two files exist and hold the same bytes.
   *
   * :param a: The first file.
   * :param b: The second file.
   * :return: True when both exist and are equal.
   */
  static sameFile(a, b) {
    return existsSync(a) && existsSync(b) && readFileSync(a).equals(readFileSync(b));
  }

  /**
   * Say whether two folders hold the same files with the same bytes.
   *
   * :param a: The first folder.
   * :param b: The second folder.
   * :return: True when the trees are equal.
   */
  static sameTree(a, b) {
    const left = RuntimeSync.listFiles(a);
    const right = RuntimeSync.listFiles(b);
    if (left.length !== right.length || left.some((name, index) => name !== right[index])) {
      return false;
    }
    return left.every((name) => RuntimeSync.sameFile(join(a, name), join(b, name)));
  }

  /**
   * Run the command line.
   *
   * :param argv: The arguments after the script name.
   * :return: The process exit code.
   */
  static main(argv) {
    const sync = new RuntimeSync(resolve(dirname(fileURLToPath(import.meta.url)), ".."));
    if (argv.includes("--check")) {
      const stale = sync.check();
      if (stale.length) {
        console.error(`Out of date: ${stale.join(", ")}. Run: node tools/sync_runtime.mjs`);
        return 1;
      }
      console.log("Every site's runtime copy matches the source.");
      return 0;
    }
    for (const id of sync.syncAll()) {
      console.log(`Synced ${id}`);
    }
    return 0;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = RuntimeSync.main(process.argv.slice(2));
}
