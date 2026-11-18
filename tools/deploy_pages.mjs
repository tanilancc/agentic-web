// Deploys the sites to Cloudflare Pages. Each site is sent as one Pages _worker.js that
// holds the site's files and applies its _headers rules, so a deploy needs only the
// account API token: no build step and no asset upload.
//
// Usage, from the repository root:
//   CLOUDFLARE_API_TOKEN=... node tools/deploy_pages.mjs [site id ...]
// CLOUDFLARE_ACCOUNT_ID is optional; without it the token's first account is used.
// With no site ids, every site in PROJECTS is deployed. The Pages projects must exist,
// named as in PROJECTS, with production branch "main".
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

export const PROJECTS = {
  beacon: { dir: "apps/beacon", project: "oaw-beacon" },
  concierge: { dir: "apps/concierge", project: "oaw-concierge" },
  quorum: { dir: "apps/quorum", project: "oaw-quorum" },
  guesthouse: { dir: "apps/town/guesthouse", project: "oaw-tidewhistle" },
  harbor_tours: { dir: "apps/town/harbor_tours", project: "oaw-harbor-tours" },
  little_oven: { dir: "apps/market/little_oven", project: "oaw-little-oven" },
  green_fork: { dir: "apps/market/green_fork", project: "oaw-green-fork" },
  harbour_bakehouse: { dir: "apps/market/harbour_bakehouse", project: "oaw-harbour-bakehouse" },
};

const API = "https://api.cloudflare.com/client/v4";
const SKIP = new Set(["_headers", "_redirects", "_routes.json", "_worker.js", ".DS_Store", "node_modules", ".git", "tests"]);
const TYPES = {
  html: "text/html; charset=utf-8", js: "text/javascript; charset=utf-8", mjs: "text/javascript; charset=utf-8",
  json: "application/json; charset=utf-8", css: "text/css; charset=utf-8", svg: "image/svg+xml", md: "text/markdown; charset=utf-8",
  txt: "text/plain; charset=utf-8", hocon: "text/plain; charset=utf-8", png: "image/png", ico: "image/x-icon",
};

async function walk(dir, out = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, out);
    else out.push(full);
  }
  return out;
}

/**
 * Read a _headers file into rules of {pattern, headers}. Patterns are exact paths or end
 * in "*".
 */
export function parseHeaders(text) {
  const rules = [];
  let current = null;
  for (const raw of text.split("\n")) {
    if (!raw.trim() || raw.trim().startsWith("#")) continue;
    if (!/^\s/.test(raw)) {
      current = { pattern: raw.trim(), headers: {} };
      rules.push(current);
    } else if (current) {
      const at = raw.indexOf(":");
      current.headers[raw.slice(0, at).trim()] = raw.slice(at + 1).trim();
    }
  }
  return rules;
}

/**
 * The _worker.js source that serves one site folder.
 *
 * :param folder: The site folder.
 * :return: {source, count}.
 */
export async function buildWorker(folder) {
  const files = {};
  for (const file of await walk(folder)) {
    const ext = path.extname(file).slice(1).toLowerCase();
    files["/" + path.relative(folder, file).split(path.sep).join("/")] = [TYPES[ext] || "application/octet-stream", (await readFile(file)).toString("base64")];
  }
  let rules = [];
  try {
    rules = parseHeaders(await readFile(path.join(folder, "_headers"), "utf8"));
  } catch {
    // No _headers file.
  }
  const source = `// Generated: serves this site's files with its _headers rules.
  const FILES = ${JSON.stringify(files)};
  const RULES = ${JSON.stringify(rules)};
  const cache = new Map();
  
  function body(entry) {
    let bytes = cache.get(entry);
    if (!bytes) {
      const raw = atob(entry[1]);
      bytes = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
      cache.set(entry, bytes);
    }
    return bytes;
  }
  
  function matches(pattern, pathname) {
    return pattern.endsWith("*") ? pathname.startsWith(pattern.slice(0, -1)) : pattern === pathname;
  }
  
  function find(pathname) {
    if (FILES[pathname]) return pathname;
    for (const candidate of [pathname.replace(/\\/$/, "") + "/index.html", pathname + ".html"]) {
      if (FILES[candidate]) return candidate;
    }
    return null;
  }
  
  const BASE_HEADERS = { "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "frame-ancestors 'none'" };
  // Says nothing about the failure, so it cannot leak a path or a stack trace.
  const FAILED_PAGE = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Something went wrong</title></head><body style="font-family:system-ui,sans-serif;max-width:34rem;margin:15vh auto;padding:0 16px"><h1>Something went wrong</h1><p>This page could not be served. Please try again in a moment.</p><p><a href="/">Go to the home page</a></p></body></html>';

  function notFound(method) {
    const page = FILES["/shared/404.html"];
    const headers = new Headers({ ...BASE_HEADERS, "Content-Type": page ? page[0] : "text/plain; charset=utf-8", "Cache-Control": "no-store" });
    return new Response(method === "HEAD" ? null : page ? body(page) : "Not found", { status: 404, headers });
  }

  export default {
    async fetch(request) {
      try {
        return serve(request);
      } catch {
        return new Response(FAILED_PAGE, { status: 500, headers: { ...BASE_HEADERS, "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
      }
    },
  };

  function serve(request) {
      const url = new URL(request.url);
      if (request.method !== "GET" && request.method !== "HEAD") {
        return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
      }
      let pathname;
      try {
        pathname = decodeURIComponent(url.pathname);
      } catch {
        return new Response("Bad request", { status: 400 });
      }
      const found = find(pathname);
      if (!found) {
        return notFound(request.method);
      }
      if (found.endsWith("/index.html") && !pathname.endsWith("/") && !pathname.endsWith("index.html")) {
        return Response.redirect(url.origin + pathname + "/" + url.search, 308);
      }
      const headers = new Headers({ "Content-Type": FILES[found][0], "Cache-Control": "public, max-age=0, must-revalidate", "X-Content-Type-Options": "nosniff" });
      for (const rule of RULES) {
        if (matches(rule.pattern, pathname) || matches(rule.pattern, found)) {
          for (const [name, value] of Object.entries(rule.headers)) headers.set(name, value);
        }
      }
      return new Response(request.method === "HEAD" ? null : body(FILES[found]), { status: 200, headers });
  }
  `;
  return { source, count: Object.keys(files).length };
}

async function api(token, url, init = {}) {
  const headers = { ...(init.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${API}${url}`, { ...init, headers });
  const json = await response.json();
  if (!json.success) throw new Error(`${url}: ${JSON.stringify(json.errors)}`);
  return json.result;
}

async function main(ids) {
  const token = process.env.CLOUDFLARE_API_TOKEN || "";
  const account = process.env.CLOUDFLARE_ACCOUNT_ID || (await api(token, "/accounts"))[0].id;
  for (const id of ids.length ? ids : Object.keys(PROJECTS)) {
    const site = PROJECTS[id];
    if (!site) throw new Error(`Unknown site ${id}. Sites: ${Object.keys(PROJECTS).join(", ")}`);
    const { source, count } = await buildWorker(site.dir);
    const form = new FormData();
    form.append("manifest", "{}");
    form.append("branch", "main");
    form.append("_worker.js", new Blob([source], { type: "application/javascript+module" }), "_worker.js");
    const result = await api(token, `/accounts/${account}/pages/projects/${site.project}/deployments`, { method: "POST", body: form });
    console.log(`${id}: ${count} files -> https://${site.project}.pages.dev (${result.url})`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
