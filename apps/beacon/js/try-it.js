// The Try it page: run another site's published agents here, on the visitor's own key.
//
// The other site's network runs as this page's top network, so its manifest would
// normally choose where a saved key is sent (its llm_router.byok_router). Beacon always
// names the router itself: the visitor's own choice, or Beacon's default. A site's
// manifest never decides where the visitor's key goes.

import { parseNetworkUrl } from "./checks/snapshot.js";
import { ask } from "./confirm.js";
import { el } from "./dom.js";

/**
 * Beacon's default router, as in its own agent-manifest.json.
 */
export const BEACON_ROUTER = "https://api.otari.ai/api/v1";

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
   */
  constructor({ doc = document, location = window.location, bootImpl, confirmImpl, routerImpl = visitorRouter } = {}) {
    this.doc = doc;
    this.location = location;
    this.bootImpl = bootImpl || (async (root, options) => (await import("../runtime/index.js")).boot(root, options));
    this.confirmImpl = confirmImpl || ((origin) => this.ask(origin));
    this.routerImpl = routerImpl;
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
   * Read ?site=, ask, and boot the runtime on the site.
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
        originUrl: parsed.base,
        sandboxWorkerUrl: "/runtime/sandbox-worker.js",
        router: await this.routerImpl(),
      });
      this.say(`Running agents published by ${parsed.origin}. Add your key in AI model settings to chat.`, address);
      return booted;
    } catch (error) {
      this.say(`These agents could not be loaded: ${error.message || error}`, address);
      return null;
    }
  }
}
