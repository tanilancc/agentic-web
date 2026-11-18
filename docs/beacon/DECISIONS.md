# Beacon decisions

## 2026-11-16: Build a conformance inspector, red team and directory
Context: the owner wanted a complex, original entry. The spec lists conformance tests, a
registry and search as open.
Options: another agentified shop; a directory only; an inspector, red team and directory.
Decision: an inspector, red team and directory, with the checks as plain code and the
model used only to explain them.
Consequences: more work, but the result is reproducible and useful to every other entry.

## 2026-11-16: Never boot a foreign manifest as the top network
Context: review found that loading a site's manifest as the page's own lets it inject
markup through `theme.logo`, and choose the router that receives the key.
Options: sanitize foreign manifests; run them as the top network in an iframe; run
Beacon's own shell network and bind the site as a peer.
Decision: Beacon-owned shell and canary networks (`try/`, `canary/`, `auditor/`). The
site joins through `network.setLink`.
Consequences: a site's own page tools are never tested by Beacon. That is stated as a
limit.

## 2026-11-16: The directory is a JSON file in git
Context: Beacon needs a list of sites without a server.
Options: a hosted database; a third-party registry; a JSON file changed by pull request.
Decision: `index/sites.json`, checked on each pull request and re-checked daily by GitHub
Actions.
Consequences: listing needs a GitHub account and a reviewer. The history is public and
auditable.

## 2026-11-17: Host on Cloudflare Pages as one `_worker.js` per site
Context: the network proxy in the build environment replaced Pages' upload token, so
ordinary asset uploads failed.
Options: deploy from a laptop with wrangler; deploy from GitHub Actions with a repository
secret; send each site as a worker that holds its files.
Decision: `tools/deploy_pages.mjs` sends one `_worker.js` per site, which applies its
`_headers`. The `pages.dev` addresses stay the same.
Consequences: requests count against the free Workers quota of 100,000 per day. Each
worker must stay under the size limit (about 0.8 MB compressed today). A normal
`wrangler pages deploy` still works from a laptop.

## 2026-11-17: Add a `report_explainer` agent
Context: the challenge values agent networks, and explaining a report is a separate job
from finding and inspecting sites.
Options: one agent; a specialist for explanations.
Decision: `report_explainer` reads only `website_get_site_report`, and may not change or
add to any result.
Consequences: one more model call when a visitor asks what a report means.
