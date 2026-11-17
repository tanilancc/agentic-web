// Draw Green Fork's page.

import { renderVendorPage } from "../shared/vendor-page.js";
import { CATALOG } from "../catalog.js";

renderVendorPage(document, CATALOG);
window.addEventListener("storage", () => renderVendorPage(document, CATALOG));
