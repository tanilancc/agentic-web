// Every conformance check, in the order a report shows them.

import { bridgeChecks } from "./bridge.js";
import { hygieneChecks } from "./hygiene.js";
import { policyChecks } from "./policy.js";
import { publicationChecks } from "./publication.js";
import { validityChecks } from "./validity.js";

export const allChecks = [
  ...publicationChecks,
  ...validityChecks,
  ...policyChecks,
  ...bridgeChecks,
  ...hygieneChecks,
];
