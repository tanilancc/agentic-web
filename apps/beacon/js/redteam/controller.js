// Runs every part of a red-team run when the visitor asks, and fills the red-team tab.
//
// Order: read the site's files again, run the canary probes, run the grounding
// questions, audit the published instructions, then show the findings.

import { agentsOf } from "../checks/result.js";
import { auditFinding, auditInstructions, GROUNDING_PROBES, groundingFinding, judgeGrounding, peerAnswer } from "./auditor.js";
import { findingsFrom } from "./findings.js";
import { DEFAULT_PROBES, DEFAULT_TRIALS, newCanary } from "./harness.js";
import { RedTeamView } from "./redteam-view.js";
import { el } from "../dom.js";

/**
 * The model the canary and auditor name when the visitor picked none.
 */
export const DEFAULT_MODEL = "alibaba/qwen3.8-flash";

/**
 * Drives the red-team tab for one report.
 */
export class RedTeamController {
  /**
   * :param doc: The document.
   * :param setup: Returns the visitor's {key, model, router}. The router is never "".
   * :param beaconOrigin: Beacon's own origin.
   * :param readSnapshotImpl: (input) -> Promise of a SiteSnapshot.
   * :param runImpl: (options, probes, trials) -> Promise of Observations. options is
   *     {targetUrl, routerOrigin, canary, onProgress}.
   * :param auditorImpl: () -> Promise of an Engine loaded with Beacon's auditor.
   * :param auditImpl: auditInstructions, or a stand-in.
   * :param judgeImpl: judgeGrounding, or a stand-in.
   * :param now: Returns the current Date.
   */
  constructor({ doc = document, setup, beaconOrigin, readSnapshotImpl, runImpl, auditorImpl,
    auditImpl = auditInstructions, judgeImpl = judgeGrounding, now = () => new Date() }) {
    Object.assign(this, { doc, setup, beaconOrigin, readSnapshotImpl, runImpl, auditorImpl, auditImpl, judgeImpl, now });
  }

  /**
   * Fill a report's red-team tab.
   *
   * :param panel: The tab's panel.
   * :param report: The Report the tab belongs to.
   */
  attach(panel, report) {
    const view = new RedTeamView(panel, this.doc);
    if (report.level === "not-conformant") {
      panel.replaceChildren(el(this.doc, "p", { className: "panel-note", text: "This site is not conformant, so its agents cannot be loaded for a red-team run. Fix the failed checks first." }));
      return;
    }
    const settings = this.setup();
    if (!settings.key || settings.key === "demo") {
      view.showNoKey();
      const again = el(this.doc, "button", { className: "button button-quiet", text: "I added a key", attrs: { type: "button" } });
      again.addEventListener("click", () => this.attach(panel, report));
      panel.append(" ", again);
      return;
    }
    const model = settings.model || DEFAULT_MODEL;
    // The number of agents is not known before the files are read again; the report's
    // network is small, so the estimate counts two.
    const runs = DEFAULT_PROBES.length * DEFAULT_TRIALS + GROUNDING_PROBES.length + 2;
    view.onRun(() => this.run(view, report, settings, model));
    view.showStart({ origin: new URL(report.input).origin, model, runs });
  }

  /**
   * Run everything and show the findings.
   *
   * :param view: The RedTeamView.
   * :param report: The Report.
   * :param settings: The visitor's {key, model, router}.
   * :param model: The model in use.
   */
  async run(view, report, settings, model) {
    try {
      const snapshot = await this.readSnapshotImpl(report.input);
      if (!snapshot.manifest || !snapshot.networkConfig || !snapshot.networkName) {
        view.showError("Beacon could not read the site's files again, so nothing was run.");
        return;
      }
      const routerOrigin = new URL(settings.router).origin;
      const canary = newCanary();
      const total = DEFAULT_PROBES.length * DEFAULT_TRIALS + GROUNDING_PROBES.length;
      let done = 0;
      const progress = () => view.showProgress(++done, total);
      view.showProgress(0, total);
      // The network the inspection found, even when the visitor typed a bare site address.
      const options = { targetUrl: `${snapshot.base}/${snapshot.networkName}`, routerOrigin, canary, onProgress: progress };
      const observations = await this.runImpl(options, DEFAULT_PROBES, DEFAULT_TRIALS);
      const grounding = await this.runImpl({ ...options, canary: newCanary() }, GROUNDING_PROBES, 1);
      const auditor = await this.auditorImpl();
      const judgements = [];
      for (const observation of grounding) {
        const verdict = await this.judgeImpl(auditor, observation.probe, peerAnswer(observation));
        judgements.push({ question: observation.probe, ...verdict });
      }
      const agents = agentsOf(snapshot.networkConfig).map((agent) => ({ name: agent.name, instructions: agent.instructions }));
      const audit = await this.auditImpl(auditor, agents);
      const declaredPeers = Array.isArray(snapshot.manifest.allowed_peers) ? snapshot.manifest.allowed_peers.filter((peer) => typeof peer === "string") : [];
      const findings = [
        ...findingsFrom(observations, { targetOrigin: snapshot.origin, routerOrigin, beaconOrigin: this.beaconOrigin, declaredPeers, canary }),
        auditFinding(audit),
        groundingFinding(judgements),
      ];
      view.show(findings, { model, date: this.now().toISOString().slice(0, 10), runs: observations.length + grounding.length });
    } catch (error) {
      view.showError(`The red-team run could not finish: ${error.message || error}`);
    }
  }
}
