// The runtime colours its settings warning #b45309, which falls under WCAG AA's 4.5:1 on
// some of the sites' backgrounds. Each assistant site overrides it in its own stylesheet,
// for light mode and, where the site has one, dark mode. The runtime is never edited.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const ROOT = new URL("../../", import.meta.url);
const SITES = ["apps/beacon", "apps/concierge", "apps/quorum", "apps/town/guesthouse", "apps/town/harbor_tours"];

const hex = (value) => { const h = value.replace("#", ""); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); };
const lum = (rgb) => rgb.map((c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }).reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0);
const ratio = (a, b) => { const [x, y] = [lum(hex(a)), lum(hex(b))].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

function split(css) {
  const at = css.indexOf("@media (prefers-color-scheme: dark)");
  return at < 0 ? { light: css, dark: "" } : { light: css.slice(0, at), dark: css.slice(at) };
}

const background = (part) => (part.match(/--paper:\s*(#[0-9a-f]{6})/i) || part.match(/:root\s*\{[^}]*background:\s*(#[0-9a-f]{6})/i) || [])[1];
const hint = (part) => (part.match(/#agent-app \.ns-hint\.warn\s*\{\s*color:\s*(#[0-9a-f]{6})/i) || [])[1];

for (const dir of SITES) {
  test(`${dir}: the settings warning meets 4.5:1 on the page background`, () => {
    const { light, dark } = split(readFileSync(new URL(`${dir}/styles.css`, ROOT), "utf8"));
    const lightBg = background(light);
    assert.ok(lightBg, "No light background colour found.");
    assert.ok(hint(light), "The stylesheet does not set #agent-app .ns-hint.warn.");
    assert.ok(ratio(hint(light), lightBg) >= 4.5, `Light: ${ratio(hint(light), lightBg).toFixed(2)}:1`);
    if (background(dark)) {
      assert.ok(hint(dark), "The site has a dark mode but no dark warning colour.");
      assert.ok(ratio(hint(dark), background(dark)) >= 4.5, `Dark: ${ratio(hint(dark), background(dark)).toFixed(2)}:1`);
    }
  });
}
