// Every site's home page has a favicon, a description, link-preview tags with an image that
// exists, and a sitemap that lists only pages the site has.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { PROJECTS } from "../../tools/deploy_pages.mjs";

const ROOT = new URL("../../", import.meta.url);
const attr = (html, re) => (html.match(re) || [])[1];

for (const [id, { dir, project }] of Object.entries(PROJECTS)) {
  const origin = `https://${project}.pages.dev`;
  test(`${id}: favicon, description, link preview and sitemap`, () => {
    const html = readFileSync(new URL(`${dir}/index.html`, ROOT), "utf8");
    const icon = attr(html, /<link rel="icon" href="([^"]+)"/);
    assert.ok(icon && existsSync(new URL(`${dir}/${icon}`, ROOT)), "Missing favicon link or file.");
    const description = attr(html, /<meta name="description" content="([^"]+)"/);
    assert.ok(description && description.length >= 50 && description.length <= 200, "Description should be 50 to 200 characters.");
    assert.equal(attr(html, /<meta property="og:url" content="([^"]+)"/), `${origin}/`);
    assert.ok(attr(html, /<meta property="og:title" content="([^"]+)"/));
    assert.equal(attr(html, /<meta property="og:description" content="([^"]+)"/), description);
    const image = attr(html, /<meta property="og:image" content="([^"]+)"/);
    assert.equal(image, `${origin}/social-card.png`);
    const png = readFileSync(new URL(`${dir}/social-card.png`, ROOT));
    assert.equal(png.toString("hex", 1, 4), "504e47", "social-card.png is not a PNG.");
    assert.equal(png.readUInt32BE(16), 1200);
    assert.equal(png.readUInt32BE(20), 630);
    assert.ok(png.length < 150_000, "Keep the card small: the deploy embeds it in the worker.");
    assert.equal(attr(html, /<meta name="twitter:card" content="([^"]+)"/), "summary_large_image");

    const sitemap = readFileSync(new URL(`${dir}/sitemap.xml`, ROOT), "utf8");
    const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    assert.ok(urls.includes(`${origin}/`));
    for (const url of urls) {
      assert.ok(url.startsWith(`${origin}/`), `${url} is not on this site.`);
      const path = url.slice(origin.length + 1) || "index.html";
      assert.ok(existsSync(new URL(`${dir}/${path}`, ROOT)), `${url} has no file.`);
    }
  });
}
