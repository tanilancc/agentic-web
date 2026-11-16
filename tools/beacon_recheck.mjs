// Re-check the sites in Beacon's directory, and draw a badge for each.
//
// Usage:
//   node tools/beacon_recheck.mjs [--only-changed <base ref>] [--write]
//
// It validates apps/beacon/index/sites.json first and exits 1 on any problem.
//   --only-changed <ref>  inspect only entries whose url is not in the index at <ref>,
//                         and exit 1 when one of them is not conformant (for pull requests)
//   --write               write apps/beacon/index/status.json and apps/beacon/badges/*.svg
// Without --only-changed it checks every entry and exits 0 even when a site fails: a
// site that stops conforming is marked in the status file, not removed.

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { nodeBridgeProbe } from "../apps/beacon/js/checks/bridge.js";
import { inspect } from "../apps/beacon/js/checks/inspect.js";
import { LEVEL_LABELS } from "../apps/beacon/js/checks/level.js";
import { NodeReader } from "../apps/beacon/js/checks/reader.js";
import { validateIndex } from "../apps/beacon/js/directory.js";

const INDEX = "apps/beacon/index/sites.json";
const STATUS = "apps/beacon/index/status.json";
const BADGES = "apps/beacon/badges";

const BADGE_TEXT = { conformant: "conformant", warnings: "warnings", "not-conformant": "not conformant" };
const BADGE_COLOUR = { conformant: "#1d6b47", warnings: "#8a5a00", "not-conformant": "#a3271f" };

/**
 * The badge file name for a network URL: its host and path, with every character other
 * than a lower-case letter or digit replaced by a hyphen.
 *
 * :param url: The network URL.
 * :return: The file name, ending in .svg.
 */
export function badgeName(url) {
  const parsed = new URL(url);
  return `${`${parsed.host}${parsed.pathname}`.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/^-+|-+$/g, "")}.svg`;
}

/**
 * Draw a badge. It holds only fixed words and the date, never text from the site.
 *
 * :param level: The level.
 * :param checkedAt: The ISO time of the check.
 * :return: The SVG text.
 */
export function badgeSvg(level, checkedAt) {
  const right = BADGE_TEXT[level] || "unknown";
  const date = String(checkedAt).slice(0, 10).replace(/[^0-9-]/g, "");
  const leftWidth = 84;
  const rightWidth = 14 + right.length * 7;
  const width = leftWidth + rightWidth;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="20" role="img" aria-label="agentic web: ${right}">`
    + `<title>agentic web: ${right}, checked ${date}</title>`
    + `<rect width="${leftWidth}" height="20" fill="#14212b"/>`
    + `<rect x="${leftWidth}" width="${rightWidth}" height="20" fill="${BADGE_COLOUR[level] || "#66717a"}"/>`
    + `<g fill="#fff" font-family="Verdana,DejaVu Sans,sans-serif" font-size="11">`
    + `<text x="8" y="14">agentic web</text><text x="${leftWidth + 7}" y="14">${right}</text></g></svg>\n`;
}

/**
 * Re-checks directory entries with Beacon's conformance checks.
 */
export class IndexRecheck {
  /**
   * :param fetchImpl: The fetch function.
   * :param now: Returns the current Date.
   * :param timeoutMs: The time limit for one file.
   */
  constructor({ fetchImpl = fetch, now = () => new Date(), timeoutMs = 10000 } = {}) {
    this.reader = new NodeReader({ fetchImpl, timeoutMs });
    this.now = now;
  }

  /**
   * Check entries one after another.
   *
   * :param indexDoc: The parsed index.
   * :param only: When given, the URLs to check; others are left out.
   * :return: {status, badges, failures, reports}.
   */
  async run(indexDoc, { only = null } = {}) {
    const checkedAt = this.now().toISOString();
    const status = { version: 1, checkedAt, sites: {} };
    const badges = {};
    const failures = [];
    const reports = [];
    for (const site of indexDoc.sites) {
      if (only && !only.includes(site.url)) {
        continue;
      }
      // inspect() never throws: a site that does not answer ends as a failed check.
      const report = await inspect(site.url, { reader: this.reader, bridgeProbe: nodeBridgeProbe(this.reader), now: this.now });
      const firstFailure = report.results.find((result) => result.status === "fail" && result.must);
      status.sites[site.url] = { level: report.level, checkedAt: report.checkedAt, ...(firstFailure ? { reason: firstFailure.evidence.slice(0, 200) } : {}) };
      badges[badgeName(site.url)] = badgeSvg(report.level, report.checkedAt);
      if (report.level === "not-conformant") {
        failures.push(site.url);
      }
      reports.push(report);
    }
    return { status, badges, failures, reports };
  }
}

/**
 * Read a file at a git ref.
 *
 * :param ref: The ref.
 * :param file: The path from the repository root.
 * :param root: The repository root.
 * :return: The file's text.
 */
function gitShowFile(ref, file, root) {
  return execFileSync("git", ["show", `${ref}:${file}`], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
}

/**
 * Run the command line.
 *
 * :param argv: The arguments after the script name.
 * :param options: {root, fetchImpl, print, now, timeoutMs, gitShow}, for tests.
 * :return: The process exit code.
 */
export async function main(argv, {
  root = resolve(dirname(fileURLToPath(import.meta.url)), ".."), fetchImpl = fetch, print = console.log,
  now = () => new Date(), timeoutMs = 10000, gitShow = (ref, file) => gitShowFile(ref, file, root),
} = {}) {
  let baseRef = "";
  let write = false;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--write") {
      write = true;
    } else if (argv[index] === "--only-changed" && argv[index + 1] && !argv[index + 1].startsWith("--")) {
      baseRef = argv[index + 1];
      index += 1;
    } else {
      print("Usage: node tools/beacon_recheck.mjs [--only-changed <base ref>] [--write]");
      return 2;
    }
  }
  const indexDoc = JSON.parse(readFileSync(join(root, INDEX), "utf8"));
  const problems = validateIndex(indexDoc);
  if (problems.length) {
    for (const problem of problems) {
      print(`Index problem: ${problem}`);
    }
    return 1;
  }
  let only = null;
  if (baseRef) {
    let before = [];
    try {
      before = JSON.parse(gitShow(baseRef, INDEX)).sites.map((site) => site.url);
    } catch {
      // No index at the base: every entry is new.
    }
    only = indexDoc.sites.map((site) => site.url).filter((url) => !before.includes(url));
    print(`Checking ${only.length} new or changed entr${only.length === 1 ? "y" : "ies"}.`);
  }
  const out = await new IndexRecheck({ fetchImpl, now, timeoutMs }).run(indexDoc, { only });
  for (const [url, entry] of Object.entries(out.status.sites)) {
    print(`${url}  ${LEVEL_LABELS[entry.level]}${entry.reason ? `  (${entry.reason})` : ""}`);
  }
  if (write) {
    writeFileSync(join(root, STATUS), `${JSON.stringify(out.status, null, 2)}\n`);
    mkdirSync(join(root, BADGES), { recursive: true });
    for (const [name, svg] of Object.entries(out.badges)) {
      writeFileSync(join(root, BADGES, name), svg);
    }
  }
  return baseRef && out.failures.length ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
