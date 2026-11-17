// The vendors Quorum asks for quotes, with the local addresses used in development.
// Change the origins to the deployed https addresses when the market is hosted, and add
// Quorum's https origin to each vendor's partner-callers.js.

export const VENDORS = [
  { id: "little_oven", label: "Little Oven Pizza", origin: "http://127.0.0.1:8095", bridgeUrl: "http://127.0.0.1:8095/partner-desk/action-bridge.html" },
  { id: "green_fork", label: "Green Fork", origin: "http://127.0.0.1:8096", bridgeUrl: "http://127.0.0.1:8096/partner-desk/action-bridge.html" },
  { id: "harbour_bakehouse", label: "Harbour Bakehouse", origin: "http://127.0.0.1:8097", bridgeUrl: "http://127.0.0.1:8097/partner-desk/action-bridge.html" },
];
