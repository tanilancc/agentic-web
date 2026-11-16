// A report's level, from fixed rules. There is no weighted score: a failed MUST of the
// spec is not something a high score elsewhere can make up for.

/**
 * The words shown for each level.
 */
export const LEVEL_LABELS = {
  conformant: "Conformant",
  warnings: "Conformant with warnings",
  "not-conformant": "Not conformant",
};

/**
 * Work out the level of a list of check results.
 *
 * :param results: Results with status and must.
 * :return: "not-conformant" when a must check failed; "warnings" when any check warned
 *     or a check that is not a must failed; otherwise "conformant".
 */
export function levelOf(results) {
  if (results.some((result) => result.status === "fail" && result.must)) {
    return "not-conformant";
  }
  if (results.some((result) => result.status === "warn" || result.status === "fail")) {
    return "warnings";
  }
  return "conformant";
}
