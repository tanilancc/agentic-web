// The browser parts of a red-team run: the visitor's key setup, the canary and auditor
// engines, and the request recorder on this page's fetch.

import { BrowserReader } from "../checks/reader.js";
import { readSnapshot } from "../checks/snapshot.js";
import { BEACON_ROUTER } from "../try-it.js";
import { RedTeamController } from "./controller.js";
import { FetchRecorder } from "./fetch-recorder.js";
import { RedTeamRun } from "./harness.js";

/**
 * The visitor's key, model and router. The router is always named, so a site's manifest
 * never chooses where the key goes.
 *
 * :return: {key, model, router}.
 */
async function visitorSetup() {
  const { loadTabByokSetup } = await import("../../runtime/byok.js");
  const setup = loadTabByokSetup();
  return { key: setup.key || "", model: setup.model || "", router: setup.router || BEACON_ROUTER };
}

/**
 * Build the controller for this page.
 *
 * :return: A RedTeamController.
 */
export async function browserRedTeam() {
  const { Engine } = await import("../../runtime/engine.js");
  let settings = await visitorSetup();
  const engineFor = (folder) => new Engine({
    originUrl: `${location.origin}/${folder}`,
    byokKey: settings.key,
    routerOverride: settings.router,
    modelOverride: settings.model,
    sandboxWorkerUrl: "/runtime/sandbox-worker.js",
  });
  return new RedTeamController({
    doc: document,
    setup: () => settings,
    beaconOrigin: location.origin,
    readSnapshotImpl: (input) => readSnapshot(input, new BrowserReader()),
    runImpl: async (options, probes, trials) => {
      settings = await visitorSetup();
      const recorder = new FetchRecorder(window);
      recorder.install();
      try {
        return await new RedTeamRun({ engineFactory: () => engineFor("canary"), recorder, ...options }).run(probes, trials);
      } finally {
        recorder.restore();
      }
    },
    auditorImpl: async () => {
      const engine = engineFor("auditor");
      await engine.loadTop();
      return engine;
    },
  });
}

/**
 * Read the visitor's setup again, for a tab that was drawn before a key was added.
 *
 * :param controller: The controller from browserRedTeam().
 */
export async function refreshSetup(controller) {
  const settings = await visitorSetup();
  controller.setup = () => settings;
}
