// Inspect one agent network from the command line, with Beacon's conformance checks.
//
// Usage:
//   node tools/beacon_check.mjs <network URL> [--origin <caller origin>] [--json]
//
// It reads only the site's public files. Node's fetch does not enforce CORS, so each
// request sends an Origin header and the check reads Access-Control-Allow-Origin itself.
// Exit code: 0 conformant or conformant with warnings, 1 not conformant, 2 bad arguments.

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { nodeBridgeProbe } from "../apps/beacon/js/checks/bridge.js";
import { inspect } from "../apps/beacon/js/checks/inspect.js";
import { LEVEL_LABELS } from "../apps/beacon/js/checks/level.js";
import { NodeReader } from "../apps/beacon/js/checks/reader.js";

/**
 * The command line for one inspection.
 */
export class BeaconCheck {
  static USAGE = "Usage: node tools/beacon_check.mjs <network URL> [--origin <caller origin>] [--json]";

  /**
   * Marks shown before each check line.
   */
  static MARKS = { pass: "ok  ", warn: "warn", fail: "FAIL", na: "-   " };

  /**
   * Read the arguments.
   *
   * :param argv: The arguments after the script name.
   * :return: {url, origin, json}, or null when they are wrong.
   */
  static parseArgs(argv) {
    const options = { url: "", origin: "https://caller.example", json: false };
    for (let index = 0; index < argv.length; index += 1) {
      const arg = argv[index];
      if (arg === "--json") {
        options.json = true;
      } else if (arg === "--origin" && argv[index + 1]) {
        options.origin = argv[index + 1];
        index += 1;
      } else if (!arg.startsWith("--") && !options.url) {
        options.url = arg;
      } else {
        return null;
      }
    }
    return options.url ? options : null;
  }

  /**
   * Run the command line.
   *
   * :param argv: The arguments after the script name.
   * :param fetchImpl: The fetch function to use.
   * :param print: Called with each output line.
   * :return: The process exit code.
   */
  static async main(argv, { fetchImpl = fetch, print = console.log } = {}) {
    const options = BeaconCheck.parseArgs(argv);
    if (!options) {
      print(BeaconCheck.USAGE);
      return 2;
    }
    const reader = new NodeReader({ callerOrigin: options.origin, fetchImpl });
    const report = await inspect(options.url, { reader, bridgeProbe: nodeBridgeProbe(reader) });
    if (options.json) {
      print(JSON.stringify(report, null, 2));
    } else {
      for (const result of report.results) {
        print(`${BeaconCheck.MARKS[result.status]} ${result.id.padEnd(22)} ${result.evidence}`);
        if (result.fix && (result.status === "fail" || result.status === "warn")) {
          print(`     ${"".padEnd(22)} Fix: ${result.fix}`);
        }
      }
      print(`Level: ${LEVEL_LABELS[report.level]}`);
    }
    return report.level === "not-conformant" ? 1 : 0;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await BeaconCheck.main(process.argv.slice(2));
}
