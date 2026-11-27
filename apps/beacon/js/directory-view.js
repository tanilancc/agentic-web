// Shows the directory of listed sites, with a search box.

import { LEVEL_LABELS } from "./checks/level.js";
import { searchDirectory } from "./directory.js";
import { el, hostOf } from "./dom.js";

/**
 * The directory panel of the page.
 */
export class DirectoryView {
  /**
   * :param root: The element the directory is shown in.
   * :param doc: The document.
   */
  constructor(root, doc = document) {
    this.root = root;
    this.doc = doc;
    this.sites = [];
    this.status = { sites: {} };
    this.pickHandlers = [];
    this.list = null;
  }

  /**
   * Register a function called with a site's network URL when the visitor picks it.
   *
   * :param handler: The function.
   */
  onPick(handler) {
    this.pickHandlers.push(handler);
  }

  /**
   * Show the directory.
   *
   * :param sites: The index's sites.
   * :param status: The parsed index/status.json.
   */
  show(sites, status) {
    this.sites = Array.isArray(sites) ? sites : [];
    this.status = status && typeof status.sites === "object" && status.sites ? status : { sites: {} };
    const title = el(this.doc, "h2", { className: "side-title", text: "Directory" });
    if (!this.sites.length) {
      this.root.replaceChildren(title,
        el(this.doc, "p", { className: "side-note", text: "No sites are listed yet. Add yours with a pull request to index/sites.json." }));
      return;
    }
    const box = el(this.doc, "input", {
      className: "side-search",
      attrs: { type: "search", placeholder: "Search listed sites", "aria-label": "Search listed sites" },
    });
    this.list = el(this.doc, "div", { className: "site-list" });
    box.addEventListener("input", () => this.fill(box.value));
    this.root.replaceChildren(title, box, this.list);
    this.fill("");
  }

  /**
   * Fill the list with the sites that match a query.
   *
   * :param query: The search text.
   */
  fill(query) {
    const found = searchDirectory(this.sites, query);
    if (!found.length) {
      this.list.replaceChildren(el(this.doc, "p", { className: "side-note", text: "No listed site matches. Try other words." }));
      return;
    }
    this.list.replaceChildren(...found.map((site) => this.item(site)));
  }

  /**
   * Build one site's entry.
   *
   * :param site: An index entry.
   * :return: The entry element.
   */
  item(site) {
    const level = this.status.sites[site.url]?.level;
    const button = el(this.doc, "button", { className: "site-pick", attrs: { type: "button" } }, [
      el(this.doc, "span", { className: "site-name", text: site.name }),
      el(this.doc, "span", { className: "site-host", text: hostOf(site.url) }),
    ]);
    button.addEventListener("click", () => {
      for (const handler of this.pickHandlers) {
        handler(site.url);
      }
    });
    return el(this.doc, "article", { className: "site" }, [
      button,
      el(this.doc, "p", { className: "site-description", text: site.description }),
      el(this.doc, "p", {
        className: `site-level ${level ? `level-${level}` : "level-unknown"}`,
        text: LEVEL_LABELS[level] || "Not checked yet",
      }),
    ]);
  }
}
