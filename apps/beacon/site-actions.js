// Registers Beacon's own operations with the agent runtime.
// agent-manifest.json loads this module through "actions.module". The names in
// "actions.agentTools" become model tools, called website_<name>.
//
// Every fact the assistant states comes from one of these three functions: the directory
// search, the last report, or a fresh inspection. None of them asks a model anything.

import { LEVEL_LABELS } from "./js/checks/level.js";
import { parseNetworkUrl } from "./js/checks/snapshot.js";
import { searchDirectory } from "./js/directory.js";

const URL_FIELD = {
  type: "string",
  minLength: 1,
  maxLength: 500,
  description: "The agent network's address, exactly as the visitor gave it or as website_search_directory returned it.",
};

/**
 * Beacon's page operations as actions the assistant can call.
 */
export class BeaconActions {
  /**
   * What the actions work on: {directory, reportFor, inspect, consent}. Tests set it.
   * In the browser it is read from the page: js/main.js sets window.beacon, and the
   * runtime sets window.__nsweb.
   */
  static context = null;

  /**
   * The most characters of a check's evidence handed to the model.
   */
  static MAX_EVIDENCE = 300;

  /**
   * Find the page the actions work on.
   *
   * :return: The context object.
   * :raises Error: When the page has not started yet.
   */
  static page() {
    if (BeaconActions.context) {
      return BeaconActions.context;
    }
    const app = globalThis.beacon;
    const engine = globalThis.__nsweb?.engine;
    if (!app || !engine) {
      throw new Error("The page is still starting.");
    }
    return {
      directory: () => app.directory || { sites: [], status: { sites: {} } },
      reportFor: (url) => app.reportFor(url),
      inspect: (url) => app.inspectUrl(url),
      consent: (info) => engine.requestConsent(info),
    };
  }

  /**
   * Register every action with the runtime.
   *
   * :param actions: The runtime registry facade with a register(definition) method.
   */
  static registerActions(actions) {
    actions.register({
      name: "search_directory",
      description: "Search Beacon's directory of listed agent sites by words and tags. Returns up to ten sites with name, address, description, tags and the level from Beacon's last scheduled check. Returns an empty list when nothing matches. Does not contact any site.",
      effect: "read",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["query"],
        properties: {
          query: { type: "string", maxLength: 200, description: "What the visitor is looking for, in a few words." },
          tags: { type: "array", maxItems: 8, items: { type: "string", maxLength: 24 }, description: "Optional tags a site must all have." },
        },
      },
      execute: BeaconActions.searchDirectory,
    });
    actions.register({
      name: "get_site_report",
      description: "Read the report of the last inspection of an address in this visit: the level, each failed check with its evidence, and the warnings. Returns ok false when that address was not inspected yet. Does not contact any site.",
      effect: "read",
      inputSchema: { type: "object", additionalProperties: false, required: ["url"], properties: { url: URL_FIELD } },
      execute: BeaconActions.getSiteReport,
    });
    actions.register({
      name: "inspect_site",
      description: "Inspect an agent network now: the visitor is asked first, then Beacon reads the site's public files, runs its conformance checks, and shows the report on the page. Returns the level, each failed check with its evidence, and the warnings, or ok false with a reason. Does not run the site's agents.",
      // It replaces the report panel, which the visitor can undo by inspecting again.
      effect: "write",
      inputSchema: { type: "object", additionalProperties: false, required: ["url"], properties: { url: URL_FIELD } },
      execute: BeaconActions.inspectSite,
    });
  }

  /**
   * Search the directory.
   *
   * :param args: {query, tags}.
   * :return: {sites}, each with its level in words.
   */
  static searchDirectory(args) {
    const { sites, status } = BeaconActions.page().directory();
    return {
      sites: searchDirectory(sites, args.query, args.tags || []).map((site) => ({
        url: site.url,
        name: site.name,
        description: site.description,
        tags: site.tags,
        level: LEVEL_LABELS[status?.sites?.[site.url]?.level] || "Not checked yet",
      })),
    };
  }

  /**
   * Reduce a report to what the assistant needs: the level and the problems.
   *
   * :param report: A Report from inspect().
   * :return: {url, level, checkedAt, failed, warned}.
   */
  static reduce(report) {
    return {
      url: report.input,
      level: LEVEL_LABELS[report.level],
      checkedAt: report.checkedAt,
      failed: report.results.filter((result) => result.status === "fail").map((result) => ({
        id: result.id,
        title: result.title,
        requiredBySpec: result.must,
        evidence: result.evidence.slice(0, BeaconActions.MAX_EVIDENCE),
        fix: result.fix,
      })),
      warned: report.results.filter((result) => result.status === "warn").map((result) => ({
        id: result.id, title: result.title, fix: result.fix,
      })),
    };
  }

  /**
   * Return the last report for an address.
   *
   * :param args: {url}.
   * :return: The reduced report, or {ok: false, reason}.
   */
  static getSiteReport(args) {
    const report = BeaconActions.page().reportFor(args.url);
    return report ? BeaconActions.reduce(report) : { ok: false, reason: "No report yet. Use inspect_site." };
  }

  /**
   * Inspect an address after the visitor agrees.
   *
   * :param args: {url}.
   * :return: The reduced report, or {ok: false, reason}.
   */
  static async inspectSite(args) {
    const page = BeaconActions.page();
    const parsed = parseNetworkUrl(args.url);
    if (parsed.error) {
      return { ok: false, reason: parsed.error };
    }
    const host = new URL(parsed.origin).host;
    // The model chose this address, so the visitor decides before anything is fetched.
    const decision = await page.consent({
      kind: "network",
      peerLabel: "Inspect this site",
      peerOrigin: host,
      requestText: "Read this site's public agent files and check them. No model call, and nothing of yours is sent.",
      est: { totalTokens: 0, costText: "no model call" },
    });
    if (decision === "decline") {
      return { ok: false, reason: `The visitor declined to contact ${host}.` };
    }
    const report = await page.inspect(args.url);
    return report ? BeaconActions.reduce(report) : { ok: false, reason: "The inspection could not finish." };
  }
}

// The runtime calls the module's registerActions export.
export const registerActions = BeaconActions.registerActions;
