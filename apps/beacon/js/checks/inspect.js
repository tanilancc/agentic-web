// Inspect one agent network: read its public files once, run every check, and build the
// report. The same function runs in the browser and in Node; the environment decides how
// files are read and how the bridge is probed.

import { allChecks } from "./catalog.js";
import { levelOf } from "./level.js";
import { Status } from "./result.js";
import { readSnapshot } from "./snapshot.js";

const STATUSES = Object.values(Status);

/**
 * Run one check and never let it throw.
 *
 * :param check: The CheckDef.
 * :param snapshot: The site snapshot.
 * :param env: The check environment.
 * :return: The check's outcome, or a failure that says the check crashed.
 */
async function runSafely(check, snapshot, env) {
  try {
    const result = await check.run(snapshot, env);
    if (!result || !STATUSES.includes(result.status)) {
      throw new Error("the check returned no result");
    }
    return { status: result.status, evidence: String(result.evidence ?? ""), fix: String(result.fix ?? "") };
  } catch (error) {
    return { status: Status.FAIL, evidence: `check crashed: ${error.message || error}`, fix: "" };
  }
}

/**
 * Inspect a network.
 *
 * :param input: A network URL, or a site URL whose manifest lists one network.
 * :param env: {reader, bridgeProbe, now, checks}. reader is required. now returns the
 *     current Date. checks replaces the check list, for tests.
 * :return: A Report: {input, base, networkName, origin, brand, checkedAt, level, results}.
 *     Never throws.
 */
export async function inspect(input, env) {
  const snapshot = await readSnapshot(input, env.reader);
  const results = [];
  for (const check of env.checks || allChecks) {
    const result = await runSafely(check, snapshot, env);
    results.push({
      id: check.id, group: check.group, spec: check.spec, title: check.title, must: !!check.must,
      ...result,
    });
  }
  const brand = typeof snapshot.manifest?.brand === "string" ? snapshot.manifest.brand.slice(0, 120) : "";
  return {
    input: snapshot.input,
    base: snapshot.base,
    networkName: snapshot.networkName,
    origin: snapshot.origin,
    brand,
    checkedAt: (env.now?.() ?? new Date()).toISOString(),
    level: levelOf(results),
    results,
  };
}
