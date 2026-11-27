// Writes each site's favicon (when it has none), its link-preview tags, its sitemap.xml,
// and, with --cards, its 1200 x 630 social-card.png. Run it after changing a site's name,
// description, colour or pages, then commit the results.
//
// Usage, from the repository root:
//   node tools/site_meta.mjs           # favicons, head tags and sitemaps
//   node tools/site_meta.mjs --cards   # also the preview images (needs Playwright)
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { PROJECTS } from "./deploy_pages.mjs";

/**
 * What each site's preview says. A site's own meta description is kept; `description` is
 * used only where a page has none.
 */
export const SITE_META = {
  beacon: { name: "Beacon", letter: "B", color: "#1f5d73", tagline: "Inspect, red-team and find open agentic websites.", pages: ["try.html"] },
  concierge: { name: "Town Concierge", letter: "C", color: "#1b5e73", tagline: "Plan and book a Marrow Point trip across independent businesses." },
  quorum: { name: "Quorum", letter: "Q", color: "#2f5d50", tagline: "Feed the whole group, within your rules, from several vendors." },
  guesthouse: { name: "Tidewhistle Guesthouse", color: "#1b5e73", tagline: "Four quiet rooms above the harbor in Marrow Point.", pages: ["policies.html"] },
  harbor_tours: { name: "Marrow Point Harbor Tours", color: "#1f3c68", tagline: "Seal watching, harbor trips and a sea wall walk.", pages: ["policies.html"] },
  little_oven: {
    name: "Little Oven Pizza", letter: "L", color: "#a33a1f", tagline: "Group catering in Marrow Point.",
    description: "Little Oven Pizza caters group orders in Marrow Point, with vegetarian and vegan pizzas. A demo vendor: orders are simulated and nothing is charged.",
  },
  green_fork: {
    name: "Green Fork", letter: "G", color: "#2f6b3f", tagline: "Group catering in Marrow Point.",
    description: "Green Fork caters group orders in Marrow Point: bowls, salads, wraps and platters, with vegetarian, vegan and gluten-free choices. A demo vendor: nothing is charged.",
  },
  harbour_bakehouse: {
    name: "Harbour Bakehouse", letter: "H", color: "#7a5223", tagline: "Group catering in Marrow Point.",
    description: "Harbour Bakehouse makes sandwich platters for groups in Marrow Point, including vegetarian, vegan and gluten-free platters. A demo vendor: nothing is charged.",
  },
};

const escape = (text) => String(text).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

function favicon(meta) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="7" fill="${meta.color}"/>
  <text x="16" y="22.5" text-anchor="middle" font-family="Georgia, serif" font-size="19" font-weight="700" fill="#fff">${meta.letter}</text>
</svg>
`;
}

/**
 * Add or refresh the head tags between the site-meta markers.
 */
export function headTags(html, meta, origin) {
  const indent = (html.match(/\n([ \t]*)<title>/) || [, "  "])[1];
  let out = html.replace(/\n[ \t]*<!-- site-meta -->[\s\S]*?<!-- \/site-meta -->/, "");
  if (!/<meta name="description"/.test(out)) {
    if (!meta.description) throw new Error(`${meta.name} has no description.`);
    out = out.replace(/(\n[ \t]*<title>[^<]*<\/title>)/, `$1\n${indent}<meta name="description" content="${escape(meta.description)}">`);
  }
  const description = out.match(/<meta name="description" content="([^"]+)"/)[1];
  const lines = [
    "<!-- site-meta -->",
    ...(/<link rel="icon"/.test(out) ? [] : ['<link rel="icon" href="favicon.svg" type="image/svg+xml">']),
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="${escape(meta.name)}">`,
    `<meta property="og:title" content="${escape(meta.name)}">`,
    `<meta property="og:description" content="${description}">`,
    `<meta property="og:url" content="${origin}/">`,
    `<meta property="og:image" content="${origin}/social-card.png">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta property="og:image:alt" content="${escape(meta.name)}: ${escape(meta.tagline)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    "<!-- /site-meta -->",
  ].map((line) => indent + line).join("\n");
  return out.replace(/(\n[ \t]*<meta name="description" content="[^"]+">)/, `$1\n${lines}`);
}

export function sitemap(origin, pages) {
  const urls = ["", ...pages, "shared/privacy.html"].map((page) => `  <url><loc>${origin}/${page}</loc></url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
}

function cardHtml(meta, host) {
  return `<!doctype html><html><head><style>
  body { margin: 0; width: 1200px; height: 630px; display: flex; flex-direction: column; justify-content: space-between;
    padding: 72px 80px; box-sizing: border-box; background: ${meta.color}; color: #fff; font-family: Georgia, serif; }
  .kicker { font: 600 26px system-ui, sans-serif; letter-spacing: .12em; text-transform: uppercase; opacity: .8; }
  h1 { font-size: 92px; line-height: 1.02; margin: 0 0 24px; letter-spacing: -.01em; }
  p { font: 400 38px/1.3 system-ui, sans-serif; margin: 0; max-width: 960px; opacity: .95; }
  .foot { display: flex; justify-content: space-between; font: 500 26px system-ui, sans-serif; opacity: .85; border-top: 2px solid rgba(255,255,255,.35); padding-top: 22px; }
  </style></head><body>
  <div class="kicker">The Open Agentic Web</div>
  <div><h1>${escape(meta.name)}</h1><p>${escape(meta.tagline)}</p></div>
  <div class="foot"><span>${escape(host)}</span><span>Marrow Point demo</span></div>
  </body></html>`;
}

async function cards(sites) {
  const { chromium } = createRequire(import.meta.url)("playwright");
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  for (const [id, { dir, project }] of sites) {
    await page.setContent(cardHtml(SITE_META[id], `${project}.pages.dev`));
    await page.screenshot({ path: path.join(dir, "social-card.png") });
  }
  await browser.close();
}

async function main(args) {
  const sites = Object.entries(PROJECTS);
  for (const [id, { dir, project }] of sites) {
    const meta = SITE_META[id];
    const origin = `https://${project}.pages.dev`;
    if (!existsSync(path.join(dir, "favicon.svg"))) {
      writeFileSync(path.join(dir, "favicon.svg"), favicon(meta));
    }
    const file = path.join(dir, "index.html");
    writeFileSync(file, headTags(readFileSync(file, "utf8"), meta, origin));
    writeFileSync(path.join(dir, "sitemap.xml"), sitemap(origin, meta.pages || []));
  }
  if (args.includes("--cards")) {
    await cards(sites);
  }
  console.log(`Updated ${sites.length} sites${args.includes("--cards") ? ", with preview images" : ""}.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
