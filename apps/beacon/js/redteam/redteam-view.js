// The red-team tab: what will run, its progress, and the findings.

import { el } from "../dom.js";

const STATUS_WORDS = { pass: "Passed", warn: "Warning", fail: "Failed", na: "Not applicable" };

/**
 * The tokens a run is expected to use, from one partner call measured at about 2,500.
 *
 * :param runs: The number of runs.
 * :return: The estimate.
 */
export function tokenEstimate(runs) {
  return runs * 2500;
}

/**
 * Draws the red-team tab in a panel.
 */
export class RedTeamView {
  /**
   * :param panel: The tab's panel.
   * :param doc: The document.
   */
  constructor(panel, doc = document) {
    this.panel = panel;
    this.doc = doc;
    this.runHandlers = [];
  }

  /**
   * Register the function that starts a run.
   *
   * :param handler: Called once when the visitor presses Run red team.
   */
  onRun(handler) {
    this.runHandlers.push(handler);
  }

  /**
   * Show what a run will do, with the two buttons.
   *
   * :param info: {origin, model, runs}.
   */
  showStart({ origin, model, runs }) {
    const run = el(this.doc, "button", { className: "button", text: "Run red team", attrs: { type: "button" } });
    const no = el(this.doc, "button", { className: "button button-quiet", text: "Not now", attrs: { type: "button" } });
    let started = false;
    run.addEventListener("click", () => {
      if (started) {
        return undefined;
      }
      started = true;
      run.disabled = true;
      return Promise.all(this.runHandlers.map((handler) => handler()));
    });
    no.addEventListener("click", () => this.panel.replaceChildren(
      el(this.doc, "p", { className: "panel-note", text: "Nothing was run. You can start a red-team run from this tab at any time." })));
    this.panel.replaceChildren(
      el(this.doc, "p", { className: "panel-note", text: `Beacon runs ${origin}'s published agents here as a peer of its own test caller, then checks where your key went, what reached the site, and whether the caller was steered.` }),
      el(this.doc, "dl", { className: "facts" }, [
        el(this.doc, "dt", { text: "Site" }), el(this.doc, "dd", { text: origin }),
        el(this.doc, "dt", { text: "Model" }), el(this.doc, "dd", { text: model }),
        el(this.doc, "dt", { text: "Size" }), el(this.doc, "dd", { text: `${runs} runs, about ${tokenEstimate(runs).toLocaleString("en-US")} tokens on your key` }),
      ]),
      el(this.doc, "div", { className: "ask-buttons start" }, [run, no]),
    );
  }

  /**
   * Explain that a run needs the visitor's key.
   */
  showNoKey() {
    this.panel.replaceChildren(
      el(this.doc, "p", { className: "panel-note", text: "A red-team run needs your own model key, because it runs the site's agents on it. Add a key in AI model settings, then come back to this tab." }),
      el(this.doc, "a", { text: "Go to AI model settings", attrs: { href: "#assistant" } }),
    );
  }

  /**
   * Show how far a run has got.
   *
   * :param done: Runs finished.
   * :param total: Runs in all.
   */
  showProgress(done, total) {
    this.panel.replaceChildren(el(this.doc, "p", { className: "report-pending", text: `Running… ${done} of ${total} done.`, attrs: { role: "status" } }));
  }

  /**
   * Show a problem in place of the findings.
   *
   * :param message: The message, shown as text.
   */
  showError(message) {
    this.panel.replaceChildren(el(this.doc, "p", { className: "report-error", text: message, attrs: { role: "alert" } }));
  }

  /**
   * Show the findings.
   *
   * :param findings: The Findings.
   * :param meta: {model, date, runs}.
   */
  show(findings, { model, date, runs }) {
    const rows = findings.map((finding) => el(this.doc, "details", { className: `check check-${finding.status}`, attrs: finding.status === "pass" || finding.status === "na" ? {} : { open: "" } }, [
      el(this.doc, "summary", { className: "check-summary" }, [
        el(this.doc, "span", { className: `check-status status-${finding.status}`, text: STATUS_WORDS[finding.status] }),
        el(this.doc, "span", { className: "check-title", text: finding.title }),
        el(this.doc, "span", { className: "check-spec", text: finding.observedIn || "" }),
      ]),
      el(this.doc, "div", { className: "check-body" }, [
        el(this.doc, "p", { className: "check-evidence", text: finding.evidence }),
        el(this.doc, "p", { className: "check-id", text: finding.id }),
      ]),
    ]));
    this.panel.replaceChildren(
      el(this.doc, "p", { className: "redteam-banner", text: `Observed with ${model} on ${date}, ${runs} runs. This is evidence about that model on these prompts, not a guarantee.` }),
      el(this.doc, "div", { className: "check-list" }, rows),
    );
  }
}
