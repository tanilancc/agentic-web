// The directory's data rules and its search. Both are plain code: the chat agent calls
// search as a tool and never ranks or describes a site from its own knowledge.
//
// index/sites.json is {"version": 1, "sites": [{url, name, description, tags, submittedBy}]}.
// index/status.json is {"version": 1, "checkedAt", "sites": {"<url>": {level, checkedAt}}}
// and is written only by tools/beacon_recheck.mjs.

import { parseNetworkUrl } from "./checks/snapshot.js";

const KEYS = ["url", "name", "description", "tags", "submittedBy"];
const TAG = /^[a-z0-9-]{1,24}$/;

/**
 * The most sites a search returns.
 */
export const MAX_RESULTS = 10;

/**
 * Check that a value is text of a length within bounds, ignoring outer spaces.
 */
function textBetween(value, min, max) {
  return typeof value === "string" && value.trim().length >= min && value.length <= max;
}

/**
 * Check an index document.
 *
 * :param doc: The parsed index/sites.json.
 * :return: A list of problems, each naming the entry. Empty when the index is valid.
 */
export function validateIndex(doc) {
  if (!doc || typeof doc !== "object" || doc.version !== 1 || !Array.isArray(doc.sites)) {
    return ['The index must be {"version": 1, "sites": [...]}.'];
  }
  const problems = [];
  const seen = new Set();
  doc.sites.forEach((entry, index) => {
    const where = `sites[${index}]`;
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      problems.push(`${where}: must be an object.`);
      return;
    }
    for (const key of Object.keys(entry)) {
      if (!KEYS.includes(key)) {
        problems.push(`${where}: unknown key '${key}'. Allowed: ${KEYS.join(", ")}.`);
      }
    }
    const parsed = parseNetworkUrl(entry.url);
    if (typeof entry.url !== "string" || parsed.error || !parsed.networkName) {
      problems.push(`${where}: url must be a network URL, such as https://site.example/network_name.`);
    } else if (seen.has(entry.url)) {
      problems.push(`${where}: duplicate url ${entry.url}.`);
    } else {
      seen.add(entry.url);
    }
    if (!textBetween(entry.name, 1, 60)) {
      problems.push(`${where}: name must be 1 to 60 characters.`);
    }
    if (!textBetween(entry.description, 1, 200)) {
      problems.push(`${where}: description must be 1 to 200 characters.`);
    }
    if (!Array.isArray(entry.tags) || entry.tags.length > 8) {
      problems.push(`${where}: tags must be a list of up to 8.`);
    } else {
      for (const tag of entry.tags) {
        if (typeof tag !== "string" || !TAG.test(tag)) {
          problems.push(`${where}: tag ${JSON.stringify(tag)} must be 1 to 24 lower-case letters, digits or hyphens.`);
        }
      }
    }
    if (!textBetween(entry.submittedBy, 1, 60)) {
      problems.push(`${where}: submittedBy must be 1 to 60 characters.`);
    }
  });
  return problems;
}

/**
 * Split text into lower-case words of two or more letters or digits.
 */
function words(text) {
  return [...new Set(String(text ?? "").toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length >= 2))];
}

/**
 * Search the directory.
 *
 * A site's score is the number of distinct query words found in its name, description
 * or tags. Sites must have every requested tag and, when the query has words, a score
 * above zero.
 *
 * :param sites: The index's sites.
 * :param query: What the visitor is looking for.
 * :param tags: Tags a site must all have.
 * :return: Up to ten sites, best score first, then by name.
 */
export function searchDirectory(sites, query, tags = []) {
  const wanted = (Array.isArray(tags) ? tags : [tags]).filter((tag) => typeof tag === "string" && tag);
  const tokens = words(query);
  const scored = [];
  for (const site of Array.isArray(sites) ? sites : []) {
    if (!site || typeof site !== "object" || typeof site.name !== "string") {
      continue;
    }
    const siteTags = Array.isArray(site.tags) ? site.tags.filter((tag) => typeof tag === "string") : [];
    if (!wanted.every((tag) => siteTags.includes(tag))) {
      continue;
    }
    const haystack = `${site.name} ${site.description ?? ""} ${siteTags.join(" ")}`.toLowerCase();
    const score = tokens.filter((token) => haystack.includes(token)).length;
    if (tokens.length && score === 0) {
      continue;
    }
    scored.push({ site, score });
  }
  scored.sort((a, b) => b.score - a.score || a.site.name.localeCompare(b.site.name));
  return scored.slice(0, MAX_RESULTS).map((item) => item.site);
}
