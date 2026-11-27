// Writes each vendor page's menu, ordering rules and empty orders list into its
// index.html, drawn by the same renderVendorPage the page runs. The page then shows its
// content before the script loads, and the script redraws it identically, so nothing on
// the page moves while it loads. Run it after changing a vendor's catalog:
//   node tools/prerender_vendors.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderVendorPage } from "../apps/shared/vendor-page.js";

export const VENDORS = ["little_oven", "green_fork", "harbour_bakehouse"];
const ROOT = new URL("../", import.meta.url);

const escape = (text) => String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Just enough of a document for renderVendorPage, which serializes to HTML.
 */
class StaticNode {
  constructor(tag) {
    this.tag = tag;
    this.className = "";
    this.children = [];
  }

  set textContent(value) {
    this.children = [String(value)];
  }

  append(...nodes) {
    this.children.push(...nodes);
  }

  replaceChildren(...nodes) {
    this.children = nodes;
  }

  html() {
    return this.children.map((child) => (typeof child === "string" ? escape(child) : child.outerHTML())).join("");
  }

  outerHTML() {
    const cls = this.className ? ` class="${escape(this.className)}"` : "";
    return `<${this.tag}${cls}>${this.html()}</${this.tag}>`;
  }
}

/**
 * The HTML of a vendor's three slots, with no orders: what a first-time visitor sees.
 *
 * :param id: The vendor's folder name.
 * :return: {menu, rules, orders}.
 */
export async function prerenderVendor(id) {
  const { CATALOG } = await import(new URL(`apps/market/${id}/catalog.js`, ROOT));
  const slots = { menu: new StaticNode("div"), rules: new StaticNode("div"), orders: new StaticNode("div") };
  const doc = { createElement: (tag) => new StaticNode(tag), getElementById: (name) => slots[name] };
  renderVendorPage(doc, CATALOG, null);
  return { menu: slots.menu.html(), rules: slots.rules.html(), orders: slots.orders.html() };
}

async function main() {
  for (const id of VENDORS) {
    const file = new URL(`apps/market/${id}/index.html`, ROOT);
    let html = readFileSync(file, "utf8");
    const out = await prerenderVendor(id);
    for (const slot of ["menu", "rules", "orders"]) {
      html = html.replace(new RegExp(`<div id="${slot}">[\\s\\S]*?</div>`), `<div id="${slot}">${out[slot]}</div>`);
    }
    writeFileSync(file, html);
    console.log(`${id}: menu, rules and orders written`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
