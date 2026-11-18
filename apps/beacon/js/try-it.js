// The Try it page: run another site's published agents here, on the visitor's own key.
//
// The page's own network is Beacon's Try it shell (try/beacon_try). The site being tried
// is bound to the shell's "target" link slot and runs as a peer. So the page's brand,
// theme, router and actions come from Beacon's manifest, never from the site's: a site
// cannot put markup in the page or choose where the visitor's key goes. Beacon still
// names the router itself, the visitor's choice or Beacon's default.

import { parseNetworkUrl } from "./checks/snapshot.js";
import { ask } from "./confirm.js";
import { el } from "./dom.js";

/**
 * Beacon's default router, as in its own agent-manifest.json.
 */
export const BEACON_ROUTER = "https://api.otari.ai/api/v1";

/**
 * The folder of Beacon's Try it shell network.
 */
export const SHELL = "try";

/**
 * The router the visitor chose in AI model settings, or Beacon's default.
 *
 * :return: The router base URL.
 */
async function visitorRouter() {
  const { loadTabByokSetup } = await import("../runtime/byok.js");
  return loadTabByokSetup().router || BEACON_ROUTER;
}

/**
 * Drives try.html.
 */
export class TryIt {
  /**
   * :param doc: The document, with #try-status and #agent-app.
   * :param location: The window's location.
   * :param bootImpl: The runtime's boot(root, options).
   * :param confirmImpl: A function (origin) -> Promise of true when the visitor agrees.
   * :param routerImpl: A function returning the router a key may be sent to.
   * :param beaconOrigin: Beacon's own origin, where the shell network is published.
   */
  constructor({ doc = document, location = window.location, bootImpl, confirmImpl, routerImpl = visitorRouter, beaconOrigin } = {}) {
    this.doc = doc;
    this.location = location;
    this.bootImpl = bootImpl || (async (root, options) => (await import("../runtime/index.js")).boot(root, options));
    this.confirmImpl = confirmImpl || ((origin) => this.ask(origin));
    this.routerImpl = routerImpl;
    this.beaconOrigin = beaconOrigin || location.origin;
    this.status = doc.getElementById("try-status");
  }

  /**
   * Ask the visitor before anything is loaded from the site.
   *
   * :param origin: The site's origin.
   * :return: A Promise of true when the visitor agrees.
   */
  ask(origin) {
    return ask(this.doc, {
      title: "Run this site's agents here?",
      message: `This loads agents published by ${origin} and runs them here on your key. They get none of Beacon's tools.`,
      accept: "Run it here",
      decline: "Not now",
    });
  }

  /**
   * Show a message in the status line, with an optional link back to the report.
   *
   * :param text: The message, shown as text.
   * :param back: The address to link back to, or "".
   */
  say(text, back = "") {
    this.status.replaceChildren(text);
    if (back) {
      this.status.append(" ", el(this.doc, "a", {
        text: "Back to the report", attrs: { href: `./?site=${encodeURIComponent(back)}` },
      }));
    }
  }

  /**
   * Bind the shell's link slot to the site being tried, and allow only its origin.
   *
   * :param engine: The booted engine.
   * :param targetUrl: The site's network URL.
   */
  static bind(engine, targetUrl) {
    engine.top.network.setLink("target", targetUrl);
    engine.runtimeAllowedPeers.add(new URL(targetUrl).origin);
    // The slot is already bound, so the chat never asks the visitor for a URL.
    engine.onLinkRequired = async () => targetUrl;
  }

  /**
   * Read ?site=, ask, boot Beacon's shell and bind the site to it.
   *
   * :return: The booted runtime, or null.
   */
  async start() {
    const address = new URLSearchParams(this.location.search).get("site") || "";
    const parsed = parseNetworkUrl(address);
    if (parsed.error || !parsed.networkName) {
      this.say(parsed.error || "The address names no network. Open Try it from a report.");
      return null;
    }
    if (!await this.confirmImpl(parsed.origin)) {
      this.say("Nothing was loaded.", address);
      return null;
    }
    this.say(`Loading agents from ${parsed.origin}…`);
    try {
      const booted = await this.bootImpl("#agent-app", {
        originUrl: `${this.beaconOrigin}/${SHELL}`,
        sandboxWorkerUrl: "/runtime/sandbox-worker.js",
        router: await this.routerImpl(),
      });
      TryIt.bind(booted.engine, `${parsed.base}/${parsed.networkName}`);
      this.say(`Running agents published by ${parsed.origin}. Add your key in AI model settings to chat.`, address);
      return booted;
    } catch (error) {
      this.say(`These agents could not be loaded: ${error.message || error}`, address);
      return null;
    }
  }
}
