// Shows one inspection report: the level, the counts, and each check with its evidence.

import { LEVEL_LABELS } from "./checks/level.js";
import { el, hostOf } from "./dom.js";

const STATUS_WORDS = { pass: "Passed", warn: "Warning", fail: "Failed", na: "Not applicable" };
const TABS = [["conformance", "Conformance"], ["redteam", "Red team"], ["tryit", "Try it"]];

/**
 * The report area of the page.
 */
export class ReportView {
  /**
   * :param root: The element the report is shown in.
   * :param doc: The document.
   */
  constructor(root, doc = document) {
    this.root = root;
    this.doc = doc;
    // Filled by show(): the red-team tab's panel, for the red-team view to draw in.
    this.redTeamPanel = null;
    this.redTeamHandlers = [];
  }

  /**
   * Register a function called with (panel, report) each time a report is shown.
   *
   * :param handler: The function.
   */
  onRedTeamPanel(handler) {
    this.redTeamHandlers.push(handler);
  }

  /**
   * Show the page's first state, before anything was inspected.
   */
  showIdle() {
    this.root.replaceChildren(
      el(this.doc, "p", { className: "report-hint", text: "Paste the address of an agent network above, or pick a site from the directory." }),
      el(this.doc, "p", { className: "report-note", text: "Beacon reads only the site's public files, from your browser. The first tab needs no key." }),
    );
  }

  /**
   * Show that an inspection is running.
   *
   * :param input: The address being inspected.
   */
  showPending(input) {
    this.root.replaceChildren(
      el(this.doc, "p", { className: "report-pending", text: `Reading public files from ${hostOf(input)}…`, attrs: { role: "status" } }),
    );
  }

  /**
   * Show a problem in place of a report.
   *
   * :param message: The message, shown as text.
   */
  showError(message) {
    this.root.replaceChildren(el(this.doc, "p", { className: "report-error", text: message, attrs: { role: "alert" } }));
  }

  /**
   * Show a report.
   *
   * :param report: The Report from inspect().
   */
  show(report) {
    const count = (status) => report.results.filter((result) => result.status === status).length;
    const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
    const head = el(this.doc, "header", { className: "report-head" }, [
      el(this.doc, "p", { className: "report-site", text: report.brand || report.networkName || hostOf(report.input) }),
      el(this.doc, "p", { className: "report-address", text: report.input }),
      el(this.doc, "p", { className: `level level-${report.level}`, text: LEVEL_LABELS[report.level] }),
      el(this.doc, "p", {
        className: "report-counts",
        text: [`${count("pass")} passed`, plural(count("warn"), "warning", "warnings"), `${count("fail")} failed`,
          `${count("na")} not applicable`].join(" · "),
      }),
      el(this.doc, "p", { className: "report-time", text: `Checked ${report.checkedAt.replace("T", " ").slice(0, 16)} UTC` }),
    ]);

    const tabList = el(this.doc, "div", { className: "tabs", attrs: { role: "tablist" } });
    const panels = {};
    const tabs = {};
    const select = (name) => {
      for (const [key] of TABS) {
        panels[key].hidden = key !== name;
        tabs[key].setAttribute("aria-selected", key === name ? "true" : "false");
        tabs[key].classList.toggle("tab-selected", key === name);
      }
    };
    for (const [key, label] of TABS) {
      tabs[key] = el(this.doc, "button", { className: "tab", text: label, attrs: { type: "button", role: "tab" } });
      tabs[key].addEventListener("click", () => select(key));
      panels[key] = el(this.doc, "div", { className: `panel panel-${key}`, attrs: { role: "tabpanel" } });
      tabList.append(tabs[key]);
    }

    panels.conformance.append(...this.groups(report));
    this.redTeamPanel = panels.redteam;
    panels.tryit.append(...this.tryIt(report));

    this.root.replaceChildren(head, tabList, panels.conformance, panels.redteam, panels.tryit);
    select("conformance");
    for (const handler of this.redTeamHandlers) {
      handler(panels.redteam, report);
    }
  }

  /**
   * Build the check list, one section per group, in report order.
   *
   * :param report: The Report.
   * :return: The section elements.
   */
  groups(report) {
    const sections = [];
    const byGroup = new Map();
    for (const result of report.results) {
      if (!byGroup.has(result.group)) {
        const list = el(this.doc, "div", { className: "check-list" });
        byGroup.set(result.group, list);
        sections.push(el(this.doc, "section", { className: "check-group" }, [
          el(this.doc, "h3", { className: "check-group-title", text: result.group }), list]));
      }
      byGroup.get(result.group).append(this.check(result));
    }
    return sections;
  }

  /**
   * Build one check row: a summary line that opens to the evidence and the fix.
   *
   * :param result: One result of the Report.
   * :return: The row element.
   */
  check(result) {
    const summary = el(this.doc, "summary", { className: "check-summary" }, [
      el(this.doc, "span", { className: `check-status status-${result.status}`, text: STATUS_WORDS[result.status] }),
      el(this.doc, "span", { className: "check-title", text: result.title }),
      el(this.doc, "span", { className: "check-spec", text: result.spec === "n/a" ? "" : `Spec ${result.spec}` }),
    ]);
    const body = el(this.doc, "div", { className: "check-body" }, [
      el(this.doc, "p", { className: "check-evidence", text: result.evidence }),
    ]);
    if (result.fix && (result.status === "fail" || result.status === "warn")) {
      body.append(el(this.doc, "p", { className: "check-fix", text: `How to fix: ${result.fix}` }));
    }
    body.append(el(this.doc, "p", { className: "check-id", text: result.must ? `${result.id} · required by the spec` : result.id }));
    const row = el(this.doc, "details", { className: `check check-${result.status}` }, [summary, body]);
    // Problems start open, so the reason is visible without a click.
    if (result.status === "fail" || result.status === "warn") {
      row.setAttribute("open", "");
    }
    return row;
  }

  /**
   * The network URL a report found: the base and the network name, even when the
   * visitor typed a bare site address.
   *
   * :param report: The Report.
   * :return: The network URL.
   */
  static networkUrl(report) {
    return report.base && report.networkName ? `${report.base}/${report.networkName}` : report.input;
  }

  /**
   * Build the Try it tab.
   *
   * :param report: The Report.
   * :return: The tab's elements.
   */
  tryIt(report) {
    if (report.level === "not-conformant") {
      return [el(this.doc, "p", { className: "panel-note", text: "This site is not conformant, so its agents cannot be loaded here. Fix the failed checks first." })];
    }
    return [
      el(this.doc, "p", { className: "panel-note", text: `Run the agents published by ${hostOf(report.input)} here, in your browser, on your own key. You are asked again before anything is loaded.` }),
      el(this.doc, "a", { className: "try-link button", text: "Try this agent", attrs: { href: `try.html?site=${encodeURIComponent(ReportView.networkUrl(report))}` } }),
    ];
  }
}
