// Start the inspector page.

import { BeaconApp } from "./app.js";
import { DirectoryView } from "./directory-view.js";
import { browserRedTeam, refreshSetup } from "./redteam/browser.js";

/**
 * Read a JSON file from this site.
 *
 * :param path: The file's path.
 * :param fallback: The value to use when the file cannot be read.
 * :return: The parsed JSON, or the fallback.
 */
async function readJson(path, fallback) {
  try {
    const response = await fetch(path, { cache: "no-store" });
    return response.ok ? await response.json() : fallback;
  } catch {
    return fallback;
  }
}

const app = new BeaconApp();
window.beacon = app;

// The red-team tab of each report. Its key setup is read again each time a report is shown.
const redTeam = await browserRedTeam();
app.view.onRedTeamPanel(async (panel, report) => {
  await refreshSetup(redTeam);
  redTeam.attach(panel, report);
});

const directory = new DirectoryView(document.getElementById("directory"));
// Picking a listed site is the visitor asking for that site by name.
directory.onPick((url) => app.inspectUrl(url));
const [index, status] = await Promise.all([
  readJson("index/sites.json", { sites: [] }),
  readJson("index/status.json", { sites: {} }),
]);
app.directory = { sites: Array.isArray(index.sites) ? index.sites : [], status };
directory.show(app.directory.sites, status);

await app.start();
