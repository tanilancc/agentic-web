// Action bridge checks: if the site says it has actions, can a calling site load its
// bridge page, and what does that page offer to callers?
//
// A probe is a function (bridgeUrl) -> {loaded, catalog, error}:
//   loaded   the bridge page can be shown in a frame on another site
//   catalog  the actions it offers a caller, as [{name, effect, availability}], or null
//            when the catalog cannot be read from here
//   error    the reason when loaded is false, else ""

import { ActionBridgeClient, sameOriginAsset } from "../../runtime/action-transport.js";
import { Status, outcome, skipped } from "./result.js";

/**
 * Probe a bridge from a web page, in a hidden frame, as a calling site's runtime does.
 *
 * It never opens a popup: the runtime's popup fallback needs a click and is no proof that
 * the frame works.
 *
 * :param bridgeUrl: The bridge page's URL.
 * :param ClientClass: The bridge client class. Tests pass a stand-in.
 * :return: The probe result.
 */
export async function browserBridgeProbe(bridgeUrl, { ClientClass = ActionBridgeClient } = {}) {
  const client = new ClientClass(bridgeUrl);
  try {
    await client.connect(false);
    const catalog = await client.request("catalog");
    if (!Array.isArray(catalog)) {
      return { loaded: true, catalog: null, error: "" };
    }
    return {
      loaded: true,
      catalog: catalog
        .filter((entry) => entry && typeof entry === "object")
        .map((entry) => ({ name: String(entry.name), effect: String(entry.effect), availability: String(entry.availability) })),
      error: "",
    };
  } catch (error) {
    return { loaded: false, catalog: null, error: String(error.message || error) };
  } finally {
    client.dispose();
  }
}

/**
 * Build a probe for Node, which cannot run a frame.
 *
 * It reads the page and the two headers that forbid framing. It cannot read the catalog.
 *
 * :param reader: A NodeReader.
 * :return: A probe function.
 */
export function nodeBridgeProbe(reader) {
  return async (bridgeUrl) => {
    const read = await reader.read(bridgeUrl);
    if (!read.ok) {
      return { loaded: false, catalog: null, error: `${bridgeUrl} could not be read: ${read.error}` };
    }
    if (read.framing.xFrameOptions) {
      return { loaded: false, catalog: null, error: `X-Frame-Options: ${read.framing.xFrameOptions} forbids framing` };
    }
    if (/frame-ancestors/i.test(read.framing.contentSecurityPolicy)) {
      return { loaded: false, catalog: null, error: "Content-Security-Policy frame-ancestors restricts framing" };
    }
    return { loaded: true, catalog: null, error: "" };
  };
}

// One probe per snapshot, shared by both checks, so a site's bridge is loaded once.
const probes = new WeakMap();

/**
 * Work out what to probe, and probe it once per snapshot.
 *
 * :param snapshot: The snapshot.
 * :param env: The check environment, with bridgeProbe.
 * :return: {skip} with an outcome to return as is, or {url, result}.
 */
async function probeOnce(snapshot, env) {
  if (snapshot.urlError) {
    return { skip: skipped("pub.url") };
  }
  if (!snapshot.manifest) {
    return { skip: skipped("pub.manifest") };
  }
  const actions = snapshot.manifest.actions;
  if (!actions || typeof actions !== "object") {
    return { skip: outcome(Status.NA, "The site declares no actions.") };
  }
  if (typeof actions.bridge !== "string" || !actions.bridge) {
    return { problem: "The manifest declares actions but no actions.bridge page." };
  }
  let url;
  try {
    url = sameOriginAsset(snapshot.base, actions.bridge);
  } catch {
    return { problem: "actions.bridge points outside the site's own origin." };
  }
  if (typeof env?.bridgeProbe !== "function") {
    return { skip: outcome(Status.NA, "The bridge cannot be probed here.") };
  }
  if (!probes.has(snapshot)) {
    probes.set(snapshot, Promise.resolve(env.bridgeProbe(url)).catch((error) => (
      { loaded: false, catalog: null, error: String(error.message || error) })));
  }
  return { url, result: await probes.get(snapshot) };
}

export const bridgeChecks = [
  {
    id: "act.bridge-loads",
    group: "Actions and bridge",
    spec: "§3.4",
    title: "The action bridge page loads in a frame",
    must: false,
    async run(snapshot, env) {
      const probe = await probeOnce(snapshot, env);
      if (probe.skip) {
        return probe.skip;
      }
      if (probe.problem) {
        return outcome(Status.FAIL, probe.problem,
          "Set actions.bridge to \"./bridge/action-bridge.html\". Callers load that page before they run the network.");
      }
      if (!probe.result.loaded) {
        return outcome(Status.FAIL, `${probe.url} did not load in a frame: ${probe.result.error}.`,
          "Serve the bridge folder without X-Frame-Options or a frame-ancestors policy. Without it, callers wait and the network never runs.");
      }
      return outcome(Status.PASS, `${probe.url} loads in a frame.`);
    },
  },
  {
    id: "act.bridge-catalog",
    group: "Actions and bridge",
    spec: "§7",
    title: "Actions offered to other sites",
    must: false,
    async run(snapshot, env) {
      const probe = await probeOnce(snapshot, env);
      if (probe.skip) {
        return probe.skip;
      }
      if (probe.problem || !probe.result.loaded) {
        return skipped("act.bridge-loads");
      }
      if (!Array.isArray(probe.result.catalog)) {
        return outcome(Status.NA, "The catalog can only be read in a browser.");
      }
      const catalog = probe.result.catalog.filter((entry) => entry && typeof entry === "object");
      if (!catalog.length) {
        return outcome(Status.PASS, "The bridge offers no actions to this caller.");
      }
      const listed = catalog.map((entry) => `${entry.name} (${entry.effect})`).join(", ");
      const loose = catalog.filter((entry) => entry.effect !== "read" && entry.availability !== "top-level");
      if (loose.length) {
        return outcome(Status.WARN, `Offered: ${listed}. Changes state without its own window: ${loose.map((entry) => entry.name).join(", ")}.`,
          "Give every action that is not a read the availability \"top-level\", so the visitor confirms it on this site.");
      }
      return outcome(Status.PASS, `Offered: ${listed}.`);
    },
  },
];
