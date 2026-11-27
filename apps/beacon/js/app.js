// The inspector page: reads the address box and the ?site= link, runs an inspection and
// shows the report.

import { browserBridgeProbe } from "./checks/bridge.js";
import { inspect } from "./checks/inspect.js";
import { BrowserReader } from "./checks/reader.js";
import { parseNetworkUrl } from "./checks/snapshot.js";
import { confirmContact } from "./confirm.js";
import { ReportView } from "./report-view.js";

/**
 * Drives the inspector page.
 */
export class BeaconApp {
  /**
   * :param doc: The document, with #inspect-form, #site-url and #report.
   * :param location: The window's location.
   * :param history: The window's history.
   * :param inspectImpl: A function (input) -> Promise of a Report.
   * :param confirmImpl: A function (origin) -> Promise of true when the visitor agrees.
   */
  constructor({ doc = document, location = window.location, history = window.history, inspectImpl, confirmImpl } = {}) {
    this.doc = doc;
    this.location = location;
    this.history = history;
    this.inspectImpl = inspectImpl || ((input) => inspect(input, {
      reader: new BrowserReader(), bridgeProbe: browserBridgeProbe,
    }));
    this.confirmImpl = confirmImpl || ((origin) => confirmContact(doc, origin));
    this.form = doc.getElementById("inspect-form");
    this.input = doc.getElementById("site-url");
    this.view = new ReportView(doc.getElementById("report"), doc);
    // Address -> the last Report for it, for the chat's tools.
    this.reports = new Map();
    this.reportHandlers = [];
    // Counts inspections, so a slow earlier one never overwrites a later one.
    this.latest = 0;
  }

  /**
   * Wire the form and act on a ?site= link.
   */
  async start() {
    this.form.addEventListener("submit", (event) => {
      event.preventDefault();
      return this.inspectUrl(this.input.value);
    });
    const shared = new URLSearchParams(this.location.search).get("site");
    if (!shared) {
      this.view.showIdle();
      return;
    }
    this.input.value = shared;
    const parsed = parseNetworkUrl(shared);
    if (parsed.error) {
      this.view.showError(parsed.error);
      return;
    }
    // A link is someone else's choice of site. Nothing is contacted until the visitor agrees.
    if (await this.confirmImpl(parsed.origin)) {
      await this.inspectUrl(shared);
    } else {
      this.view.showIdle();
    }
  }

  /**
   * Inspect an address the visitor asked for and show the report.
   *
   * :param input: The address.
   * :return: The Report, or null when the inspection could not finish.
   */
  async inspectUrl(input) {
    const address = String(input ?? "").trim();
    const turn = ++this.latest;
    this.input.value = address;
    this.view.showPending(address);
    try {
      this.history.replaceState(null, "", `${this.location.pathname}?site=${encodeURIComponent(address)}`);
    } catch {
      // The address bar is a convenience. A page that cannot change it still works.
    }
    let report;
    try {
      report = await this.inspectImpl(address);
    } catch (error) {
      if (turn === this.latest) {
        this.view.showError(`The inspection could not finish: ${error.message || error}`);
      }
      return null;
    }
    this.reports.set(report.input, report);
    if (turn !== this.latest) {
      return report;
    }
    this.view.show(report);
    for (const handler of this.reportHandlers) {
      handler(report);
    }
    return report;
  }

  /**
   * Register a function called with each report that is shown.
   *
   * :param handler: The function.
   */
  onReport(handler) {
    this.reportHandlers.push(handler);
  }

  /**
   * The last report for an address.
   *
   * :param input: The address, as it was inspected.
   * :return: The Report, or null.
   */
  reportFor(input) {
    return this.reports.get(String(input ?? "").trim()) || null;
  }
}
