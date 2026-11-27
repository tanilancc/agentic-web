// The Concierge's and Quorum's own confirmation dialogs ("Book this trip?", "Place these
// orders?") are styled like the businesses' windows: buttons side by side at the bottom,
// a filled confirm button, and colours that meet WCAG AA.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const ROOT = new URL("../../", import.meta.url);
const hex = (v) => { const h = v.replace("#", ""); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); };
const lum = (rgb) => rgb.map((c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }).reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0);
const ratio = (a, b) => { const [x, y] = [lum(hex(a)), lum(hex(b))].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

for (const site of ["concierge", "quorum"]) {
  test(`${site}: the confirmation dialog is styled and readable`, () => {
    const css = readFileSync(new URL(`apps/${site}/styles.css`, ROOT), "utf8");
    assert.match(css, /\.assistant-review\[open\]\s*\{[^}]*display:\s*grid/, "Buttons are not laid out side by side.");
    const confirm = css.match(/\.assistant-review > button:not\(\.assistant-decline\)\s*\{[^}]*background:\s*(#[0-9a-f]{6})[^}]*color:\s*(#[0-9a-f]{6})/i);
    assert.ok(confirm, "The confirm button has no filled style.");
    assert.ok(ratio(confirm[1], confirm[2]) >= 4.5, `Confirm button contrast ${ratio(confirm[1], confirm[2]).toFixed(2)}:1`);
    assert.match(css, /\.assistant-review > button:focus-visible/, "No visible keyboard focus on the buttons.");
  });
}
