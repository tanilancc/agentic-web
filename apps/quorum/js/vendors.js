// The vendors Quorum asks for quotes: their local addresses in development, and their
// deployed addresses everywhere else. Each vendor lists Quorum's origins in its
// partner-callers.js.

import { pickOrigin } from "../shared/site-origin.js";

const vendor = (id, label, local, live) => {
  const origin = pickOrigin(local, live);
  return { id, label, origin, bridgeUrl: `${origin}/partner-desk/action-bridge.html` };
};

export const VENDORS = [
  vendor("little_oven", "Little Oven Pizza", "http://127.0.0.1:8095", "https://oaw-little-oven.pages.dev"),
  vendor("green_fork", "Green Fork", "http://127.0.0.1:8096", "https://oaw-green-fork.pages.dev"),
  vendor("harbour_bakehouse", "Harbour Bakehouse", "http://127.0.0.1:8097", "https://oaw-harbour-bakehouse.pages.dev"),
];
