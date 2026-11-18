// The shape every check returns, and small helpers the checks share.
//
// A CheckDef is {id, group, spec, title, must, run(snapshot, env)}:
//   must   the check enforces a MUST of the spec; a failure makes a site not conformant
//   run    returns an Outcome {status, evidence, fix}, or a Promise of one
// env is {reader, bridgeProbe}; most checks need neither.

/**
 * The four results a check can have.
 */
export const Status = { PASS: "pass", WARN: "warn", FAIL: "fail", NA: "na" };

/**
 * Build a check outcome.
 *
 * :param status: One of Status.
 * :param evidence: What was observed, in a sentence.
 * :param fix: How to fix it, or "".
 * :return: The outcome.
 */
export function outcome(status, evidence, fix = "") {
  return { status, evidence, fix };
}

/**
 * The outcome of a check that could not run because an earlier one failed.
 *
 * :param earlierId: The id of the check that failed.
 * :return: A not-applicable outcome.
 */
export function skipped(earlierId) {
  return outcome(Status.NA, `not checked: ${earlierId} failed`);
}

/**
 * Say whether an origin is on this machine, where plain http is allowed.
 *
 * :param origin: An origin such as "http://localhost:8080".
 * :return: True for localhost, 127.0.0.1 and [::1].
 */
export function isLoopback(origin) {
  try {
    return ["localhost", "127.0.0.1", "[::1]"].includes(new URL(origin).hostname);
  } catch {
    return false;
  }
}

/**
 * The origin of a URL, or "" when it is not one.
 *
 * :param value: Anything.
 * :param base: A base URL for relative values.
 * :return: The origin.
 */
export function originOf(value, base) {
  if (typeof value !== "string") {
    return "";
  }
  try {
    const url = base ? new URL(value, base) : new URL(value);
    return url.origin === "null" ? "" : url.origin;
  } catch {
    return "";
  }
}

/**
 * The agents of a network that have a usable shape.
 *
 * A published network is untrusted input, so an entry that is not an object with a text
 * name is left out rather than trusted.
 *
 * :param config: The network definition.
 * :return: The agent objects.
 */
export function agentsOf(config) {
  const tools = Array.isArray(config?.tools) ? config.tools : [];
  return tools.filter((agent) => agent && typeof agent === "object" && typeof agent.name === "string");
}

/**
 * The first earlier publication check that stops network checks from running.
 *
 * :param snapshot: The snapshot.
 * :return: The id of the failed check, or "" when the network was read.
 */
export function networkBlocker(snapshot) {
  if (snapshot.urlError) {
    return "pub.url";
  }
  if (!snapshot.manifest) {
    return "pub.manifest";
  }
  if (!snapshot.entry) {
    return "pub.network-name";
  }
  if (!snapshot.networkConfig) {
    return "pub.network-file";
  }
  return "";
}
