// Which address a partner site has: its local one in development, its deployed one live.

/**
 * The local address on a loopback host, where the town runs for development, and the
 * deployed address everywhere else.
 */
export function pickOrigin(local, live, host = globalThis.location?.hostname) {
  return !host || host === "localhost" || host === "127.0.0.1" || host === "[::1]" ? local : live;
}

/**
 * Point links that carry a data-local-href at that local address, on a loopback host only.
 * Pages link to the deployed sites; in development the local copies are used instead.
 *
 * :param doc: The document.
 * :param host: The page's host name.
 * :return: How many links were switched.
 */
export function useLocalLinks(doc, host = globalThis.location?.hostname) {
  if (!host || pickOrigin("local", "live", host) !== "local") {
    return 0;
  }
  let count = 0;
  for (const link of doc.querySelectorAll("a[data-local-href]")) {
    link.href = link.getAttribute("data-local-href");
    count += 1;
  }
  return count;
}
