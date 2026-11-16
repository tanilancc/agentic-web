// Read everything the checks need from one site into a single snapshot.
//
// A SiteSnapshot is:
//   {input, base, origin, networkName, urlError,
//    files: {manifest, network, links},      FileRead or null when not fetched
//    manifest, entry, networkConfig, validation, networks}
// Anything an earlier failure made impossible is null. readSnapshot never throws.

import { parseHocon } from "../../runtime/hocon.js";
import { AgentNetwork, validateNetwork } from "../../runtime/kernel.js";
import { resolveUrl } from "../../runtime/remote.js";

/**
 * Split a network URL into the site base and the network name.
 *
 * The base is the folder that holds agent-manifest.json. The name is the last path
 * segment, or "" when the URL ends in "/" or has no path.
 *
 * :param input: What the visitor typed.
 * :return: {base, networkName, origin}, or {error} when it is not an http(s) URL.
 */
export function parseNetworkUrl(input) {
  const text = String(input ?? "").trim();
  if (!text) {
    return { error: "Enter the address of an agent network." };
  }
  let url;
  try {
    url = new URL(text);
  } catch {
    return { error: "This is not a complete web address. It should start with https://." };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { error: "Only http:// and https:// addresses can be inspected." };
  }
  const segments = url.pathname.split("/").filter(Boolean);
  const networkName = url.pathname.endsWith("/") ? "" : decodeURIComponent(segments.pop() || "");
  const folder = segments.length ? `/${segments.join("/")}` : "";
  return { base: `${url.origin}${folder}`, networkName, origin: url.origin };
}

/**
 * Parse text as JSON.
 *
 * :param text: The text.
 * :return: The value, or undefined when it is not JSON.
 */
function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/**
 * Read a site's manifest, network definition and links file.
 *
 * :param input: A network URL, or a site URL whose manifest lists one network.
 * :param reader: A NodeReader or BrowserReader.
 * :return: A SiteSnapshot.
 */
export async function readSnapshot(input, reader) {
  const snapshot = {
    input: String(input ?? ""), base: "", origin: "", networkName: "", urlError: "",
    files: { manifest: null, network: null, links: null },
    manifest: null, entry: null, networkConfig: null, validation: null, networks: [],
  };
  const parsed = parseNetworkUrl(input);
  if (parsed.error) {
    snapshot.urlError = parsed.error;
    return snapshot;
  }
  Object.assign(snapshot, parsed);

  const manifestRead = await reader.read(`${snapshot.base}/agent-manifest.json`);
  snapshot.files.manifest = manifestRead;
  if (!manifestRead.ok) {
    return snapshot;
  }
  const manifest = parseJson(manifestRead.text);
  if (manifest === undefined || manifest === null || typeof manifest !== "object" || Array.isArray(manifest)) {
    manifestRead.error = "not JSON: the file is not a JSON object";
    return snapshot;
  }
  snapshot.manifest = manifest;
  const published = Array.isArray(manifest.networks)
    ? manifest.networks.filter((entry) => entry && typeof entry === "object" && typeof entry.name === "string")
    : [];
  snapshot.networks = published.map((entry) => entry.name);
  // Exact name only, as the runtime does. A bare site URL picks the network only when
  // there is exactly one, so nothing is ever chosen by guessing.
  if (snapshot.networkName) {
    snapshot.entry = published.find((entry) => entry.name === snapshot.networkName) || null;
  } else if (published.length === 1) {
    snapshot.entry = published[0];
    snapshot.networkName = published[0].name;
  }
  if (!snapshot.entry || typeof snapshot.entry.hocon !== "string") {
    return snapshot;
  }

  const [networkRead, linksRead] = await Promise.all([
    reader.read(resolveUrl(snapshot.base, snapshot.entry.hocon)),
    reader.read(`${snapshot.base}/links.json`),
  ]);
  snapshot.files.network = networkRead;
  snapshot.files.links = linksRead;
  if (!networkRead.ok) {
    return snapshot;
  }
  try {
    const config = parseHocon(networkRead.text);
    const network = new AgentNetwork(config, snapshot.entry.name);
    snapshot.validation = validateNetwork(network);
    snapshot.networkConfig = network.config;
  } catch (error) {
    snapshot.networkConfig = null;
    snapshot.validation = null;
    networkRead.error = `not a network definition: ${String(error.message || error).slice(0, 200)}`;
  }
  return snapshot;
}
