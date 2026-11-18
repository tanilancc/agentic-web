// Policy checks: does the site say which other origins its network may contact?

import { Status, networkBlocker, originOf, outcome, skipped } from "./result.js";

/**
 * The origins a manifest allows, ignoring entries that are not URLs.
 *
 * :param manifest: The site manifest.
 * :return: A set of origins.
 */
function allowedOrigins(manifest) {
  const list = Array.isArray(manifest?.allowed_peers) ? manifest.allowed_peers : [];
  return new Set(list.map((entry) => originOf(entry)).filter(Boolean));
}

/**
 * Whether the manifest's peer policy is open.
 *
 * :param manifest: The site manifest.
 * :return: True when mode is "open".
 */
function isOpen(manifest) {
  return manifest?.peer_policy?.mode === "open";
}

export const policyChecks = [
  {
    id: "pol.peer-mode",
    group: "Policy",
    spec: "§3.2",
    title: "The peer policy is closed",
    must: false,
    run(snapshot) {
      if (snapshot.urlError) {
        return skipped("pub.url");
      }
      if (!snapshot.manifest) {
        return skipped("pub.manifest");
      }
      const mode = snapshot.manifest.peer_policy?.mode;
      if (mode === "closed") {
        return outcome(Status.PASS, "peer_policy.mode is closed: only origins in allowed_peers are contacted.");
      }
      if (mode === "open") {
        return outcome(Status.WARN, "peer_policy.mode is open: the network may contact any origin an agent names, after the visitor agrees.",
          "Set peer_policy.mode to closed and list partner origins in allowed_peers.");
      }
      return outcome(Status.WARN, "The manifest states no peer_policy.mode.",
        "Set peer_policy.mode to closed and list partner origins in allowed_peers.");
    },
  },
  {
    id: "pol.allowed-peers",
    group: "Policy",
    spec: "§3.2",
    title: "Every peer and MCP origin the network names is allowed",
    must: true,
    run(snapshot) {
      const blocker = networkBlocker(snapshot);
      if (blocker || !snapshot.validation) {
        return skipped(blocker || "pub.network-file");
      }
      const refs = [...(snapshot.validation.externals || []), ...(snapshot.validation.mcps || [])];
      const origins = new Set(refs.map((ref) => originOf(ref, `${snapshot.base}/`)).filter(Boolean));
      origins.delete(snapshot.origin);
      if (!origins.size) {
        return outcome(Status.PASS, "The network names no other origin.");
      }
      if (isOpen(snapshot.manifest)) {
        return outcome(Status.PASS, `Open policy; the network names ${[...origins].join(", ")}.`);
      }
      const allowed = allowedOrigins(snapshot.manifest);
      const missing = [...origins].filter((origin) => !allowed.has(origin));
      if (missing.length) {
        return outcome(Status.FAIL, `Named by the network but missing from allowed_peers: ${missing.join(", ")}.`,
          "The runtime refuses these calls. Add each origin, with its port, to allowed_peers.");
      }
      return outcome(Status.PASS, `Allowed: ${[...origins].join(", ")}.`);
    },
  },
  {
    id: "pol.link-labels",
    group: "Policy",
    spec: "§5",
    title: "Each partner network has a name for the consent card",
    must: false,
    run(snapshot) {
      const blocker = networkBlocker(snapshot);
      if (blocker || !snapshot.validation) {
        return skipped(blocker || "pub.network-file");
      }
      const labels = snapshot.networkConfig.link_labels && typeof snapshot.networkConfig.link_labels === "object"
        ? snapshot.networkConfig.link_labels : {};
      const unlabeled = (snapshot.validation.externals || [])
        .filter((ref) => typeof ref === "string" && /^https?:\/\//i.test(ref))
        .filter((ref) => typeof labels[ref] !== "string" || !labels[ref].trim());
      if (unlabeled.length) {
        return outcome(Status.WARN, `No link_labels entry for: ${unlabeled.join(", ")}.`,
          "The consent card names a partner by its label. Add a link_labels entry keyed by the exact URL.");
      }
      return outcome(Status.PASS, "Every partner network has a label.");
    },
  },
];
