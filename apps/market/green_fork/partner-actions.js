// The actions Green Fork offers other agent sites, through partner-desk/. The rules are in
// shared/vendor-pricing.js and shared/vendor-desk.js; this site only gives its catalog.

import { vendorActions } from "./shared/vendor-desk.js";
import { CATALOG } from "./catalog.js";
import { PARTNER_CALLERS } from "./partner-callers.js";

/**
 * Register the vendor's partner actions.
 *
 * :param actions: The runtime registry facade.
 */
export function registerActions(actions) {
  for (const definition of vendorActions({ catalog: CATALOG, callers: PARTNER_CALLERS })) {
    actions.register(definition);
  }
}
