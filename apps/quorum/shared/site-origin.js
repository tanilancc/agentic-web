// Which address a partner site has: its local one in development, its deployed one live.

/**
 * The local address on a loopback host, where the town runs for development, and the
 * deployed address everywhere else.
 */
export function pickOrigin(local, live, host = globalThis.location?.hostname) {
  return !host || host === "localhost" || host === "127.0.0.1" || host === "[::1]" ? local : live;
}
