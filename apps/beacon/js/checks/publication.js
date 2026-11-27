// Publication checks: can another site's browser find and read this site's public files?

import { Status, isLoopback, originOf, outcome, skipped } from "./result.js";

const CORS_FIX = "Serve this file with the header Access-Control-Allow-Origin: *.";

/**
 * Describe why a file could not be used, or return "" when it could.
 *
 * :param read: The FileRead.
 * :return: The reason.
 */
function readProblem(read) {
  if (!read.ok && !read.corsReadable && read.error === "blocked by CORS") {
    return `${read.url} is reachable, but a browser on another site may not read it (blocked by CORS).`;
  }
  if (!read.ok) {
    return `${read.url} could not be read: ${read.error || "unknown error"}.`;
  }
  if (!read.corsReadable) {
    return `${read.url} has no Access-Control-Allow-Origin header that lets another site read it.`;
  }
  return "";
}

export const publicationChecks = [
  {
    id: "pub.url",
    group: "Publication",
    spec: "§3.2",
    title: "The address is a network URL",
    must: true,
    run(snapshot) {
      if (snapshot.urlError) {
        return outcome(Status.FAIL, snapshot.urlError,
          "Use the folder that holds agent-manifest.json, then the network name, such as https://site.example/network_name.");
      }
      return outcome(Status.PASS, `Site base ${snapshot.base}.`);
    },
  },
  {
    id: "pub.https",
    group: "Publication",
    spec: "§3.3",
    title: "The site is served over HTTPS",
    must: true,
    run(snapshot) {
      if (snapshot.urlError) {
        return skipped("pub.url");
      }
      if (snapshot.origin.startsWith("https://")) {
        return outcome(Status.PASS, `${snapshot.origin} uses HTTPS.`);
      }
      if (isLoopback(snapshot.origin)) {
        return outcome(Status.WARN, `${snapshot.origin} uses plain http: local development only.`,
          "Host the site over HTTPS before other sites call it.");
      }
      return outcome(Status.FAIL, `${snapshot.origin} uses plain http.`, "Serve the site over HTTPS.");
    },
  },
  {
    id: "pub.manifest",
    group: "Publication",
    spec: "§3.3",
    title: "agent-manifest.json is public and lists networks",
    must: true,
    run(snapshot) {
      if (snapshot.urlError) {
        return skipped("pub.url");
      }
      const read = snapshot.files.manifest;
      const problem = readProblem(read);
      if (problem) {
        return outcome(Status.FAIL, problem, read.ok || read.error === "blocked by CORS" ? CORS_FIX
          : "Publish agent-manifest.json in the folder the network URL names.");
      }
      if (!snapshot.manifest) {
        return outcome(Status.FAIL, `${read.url} is ${read.error || "not a JSON object"}.`,
          "Publish a JSON object with a networks list.");
      }
      if (!Array.isArray(snapshot.manifest.networks) || !snapshot.networks.length) {
        return outcome(Status.FAIL, `${read.url} has no usable networks list.`,
          "Add a networks list whose entries have name, front_man and hocon.");
      }
      return outcome(Status.PASS, `${read.url} lists ${snapshot.networks.length} network(s).`);
    },
  },
  {
    id: "pub.network-name",
    group: "Publication",
    spec: "§3.2",
    title: "The requested network is published under that exact name",
    must: true,
    run(snapshot) {
      if (snapshot.urlError) {
        return skipped("pub.url");
      }
      if (!snapshot.manifest || !snapshot.networks.length) {
        return skipped("pub.manifest");
      }
      const published = snapshot.networks.join(", ");
      if (snapshot.entry) {
        return outcome(Status.PASS, `Found '${snapshot.entry.name}'.`);
      }
      if (!snapshot.networkName) {
        return outcome(Status.FAIL, `The address names no network, and the site publishes several: ${published}.`,
          "Add one of the published names to the end of the address.");
      }
      return outcome(Status.FAIL, `No network named '${snapshot.networkName}'. Published: ${published}.`,
        "A caller refuses any other name, so use a published name exactly.");
    },
  },
  {
    id: "pub.network-file",
    group: "Publication",
    spec: "§3.3",
    title: "The network definition is public and readable",
    must: true,
    run(snapshot) {
      if (snapshot.urlError) {
        return skipped("pub.url");
      }
      if (!snapshot.manifest) {
        return skipped("pub.manifest");
      }
      if (!snapshot.entry) {
        return skipped("pub.network-name");
      }
      const read = snapshot.files.network;
      if (!read) {
        return outcome(Status.FAIL, `The manifest entry '${snapshot.entry.name}' has no hocon location.`,
          "Set hocon to the location of the resolved network definition.");
      }
      const problem = readProblem(read);
      if (problem) {
        return outcome(Status.FAIL, problem, read.ok || read.error === "blocked by CORS" ? CORS_FIX
          : "Publish the file at the location the manifest's hocon field names.");
      }
      if (!snapshot.networkConfig) {
        return outcome(Status.FAIL, `${read.url} is ${read.error || "not a network definition"}.`,
          "Publish the resolved network as JSON, with includes and substitutions expanded.");
      }
      return outcome(Status.PASS, `${read.url} was read and parsed.`);
    },
  },
  {
    id: "pub.links",
    group: "Publication",
    spec: "§3.3",
    title: "links.json is public",
    must: false,
    run(snapshot) {
      if (snapshot.urlError) {
        return skipped("pub.url");
      }
      if (!snapshot.manifest) {
        return skipped("pub.manifest");
      }
      if (!snapshot.entry || !snapshot.files.links) {
        return skipped("pub.network-name");
      }
      const problem = readProblem(snapshot.files.links);
      if (problem) {
        return outcome(Status.WARN, problem,
          "Publish links.json beside the manifest, readable from other sites. It may hold no links.");
      }
      return outcome(Status.PASS, `${snapshot.files.links.url} was read.`);
    },
  },
  {
    id: "pub.redirect",
    group: "Publication",
    spec: "§5",
    title: "Public files stay on the site's origin",
    must: false,
    run(snapshot) {
      if (snapshot.urlError) {
        return skipped("pub.url");
      }
      const moved = Object.values(snapshot.files)
        .filter((read) => read && read.redirectedTo && originOf(read.redirectedTo) !== originOf(read.url))
        .map((read) => `${read.url} redirects from ${originOf(read.url)} to ${originOf(read.redirectedTo)}`);
      if (moved.length) {
        return outcome(Status.WARN, `${moved.join("; ")}.`,
          "A redirect to another origin is a new destination that a caller's visitor did not agree to. Serve the file from the site's own origin.");
      }
      return outcome(Status.PASS, "No file redirects to another origin.");
    },
  },
];
