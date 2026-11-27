// Each vendor page ships its menu, rules and empty orders list already in the HTML, drawn
// by the same renderVendorPage the page script runs. The script then redraws identical
// content, so nothing moves while the page loads (layout shift 0).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { prerenderVendor, VENDORS } from "../../tools/prerender_vendors.mjs";

const ROOT = new URL("../../", import.meta.url);

for (const id of VENDORS) {
  test(`${id}: the page ships the menu the script would draw`, async () => {
    const html = readFileSync(new URL(`apps/market/${id}/index.html`, ROOT), "utf8");
    const expected = await prerenderVendor(id);
    for (const slot of ["menu", "rules", "orders"]) {
      const shipped = html.match(new RegExp(`<div id="${slot}">([\\s\\S]*?)</div>`))[1];
      assert.equal(shipped, expected[slot], `#${slot} is out of date: run node tools/prerender_vendors.mjs`);
      assert.ok(shipped.length > 0, `#${slot} is empty in the HTML.`);
    }
    assert.match(expected.menu, /class="menu-item"/);
    assert.match(expected.orders, /No orders yet\./);
  });
}
