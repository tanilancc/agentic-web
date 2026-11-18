// Serve every site in apps/sites.json on this machine, each on its own origin.
//
// Usage:
//   node tools/serve_town.mjs [--only <id>[,<id>...]] [--log-dir <folder>]
//
// Each site gets its own port and host name, because consent cards, CORS and action
// bridges only behave as they do on the real web when the sites have different origins.
// Every server binds to 127.0.0.1; the host name only changes the URL to open.

import { spawn } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Plans and starts one local server per site.
 */
export class TownServer {
  /**
   * The server script each site is served with.
   */
  static SERVE_SCRIPT = "skills/agentify-website/scripts/serve_site.mjs";

  /**
   * Work out the URL of each site and refuse a clash.
   *
   * :param sites: The entries of apps/sites.json.
   * :return: One entry per site with its id, dir, port, openAs and url.
   * :raises Error: When two sites share an origin or a port.
   */
  static plan(sites) {
    const origins = new Map();
    const ports = new Map();
    return sites.map((site) => {
      const origin = `http://${site.openAs}:${site.port}`;
      if (origins.has(origin)) {
        throw new Error(`Sites '${origins.get(origin)}' and '${site.id}' have the same origin ${origin}.`);
      }
      if (ports.has(site.port)) {
        throw new Error(`Sites '${ports.get(site.port)}' and '${site.id}' have the same port ${site.port}.`);
      }
      origins.set(origin, site.id);
      ports.set(site.port, site.id);
      return { id: site.id, dir: site.dir, port: site.port, openAs: site.openAs, url: `${origin}/` };
    });
  }

  /**
   * Start the servers and keep running until the process is stopped.
   *
   * :param argv: The arguments after the script name.
   * :return: The process exit code, when the arguments are wrong.
   */
  static async main(argv) {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
    const only = TownServer.option(argv, "--only");
    const logDir = TownServer.option(argv, "--log-dir");
    let sites = JSON.parse(readFileSync(join(root, "apps", "sites.json"), "utf8")).sites;
    if (only) {
      const wanted = only.split(",");
      sites = sites.filter((site) => wanted.includes(site.id));
    }
    if (logDir) {
      mkdirSync(resolve(logDir), { recursive: true });
    }
    const children = [];
    for (const entry of TownServer.plan(sites)) {
      const args = [join(root, TownServer.SERVE_SCRIPT), join(root, entry.dir),
        "--port", String(entry.port), "--open-as", entry.openAs];
      if (logDir) {
        args.push("--log", join(resolve(logDir), `${entry.id}.jsonl`));
      }
      children.push(spawn(process.execPath, args, { stdio: "ignore" }));
      console.log(`${entry.id}: ${entry.url}`);
    }
    const stop = () => {
      for (const child of children) {
        child.kill();
      }
      process.exit(0);
    };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
    return undefined;
  }

  /**
   * Read the value that follows an option name.
   *
   * :param argv: The arguments.
   * :param name: The option name, such as --only.
   * :return: The value, or an empty string when the option is absent.
   */
  static option(argv, name) {
    const index = argv.indexOf(name);
    return index >= 0 && argv[index + 1] ? argv[index + 1] : "";
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await TownServer.main(process.argv.slice(2));
}
