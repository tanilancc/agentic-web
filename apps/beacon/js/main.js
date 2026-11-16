// Start the inspector page.

import { BeaconApp } from "./app.js";

const app = new BeaconApp();
window.beacon = app;
await app.start();
