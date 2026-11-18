# Beacon security and data

## Data inventory
| Data | Why | Stored where | Retention | Shared with |
| --- | --- | --- | --- | --- |
| Visitor's AI key | Run the assistant, Try it and the red team | Browser: local storage, and the tab's session storage | Until the visitor clears it | Only the AI provider the visitor chose |
| Chat messages | Answer the visitor | Browser memory | Until the tab closes or the chat is cleared | The AI provider. With Try it, the inspected site's network runs in this browser on that provider, and gets only the message. |
| Addresses the visitor inspects | Run the checks | Browser memory, and the `?site=` link | This visit | The inspected site (it receives requests for its own public files) |
| Directory entries (`submittedBy`) | Credit for a listing | Public git repository | Until removed by a pull request | Public |

Beacon collects nothing on a server and has no analytics.

## Third parties
| Service | Receives |
| --- | --- |
| AI provider chosen by the visitor (Otari by default) | Messages, instructions, tool results, the key |
| Inspected sites | Ordinary GET requests for their public files, from the visitor's browser |
| Cloudflare (hosting) | Standard request data, such as IP address and user agent |
| GitHub (repository and Actions) | Directory pull requests. The daily re-check fetches the listed sites. |

## Threat model
| Risk | Mitigation |
| --- | --- |
| A hostile site's manifest injects script or styles, through `theme.logo` or similar | Try it and the red team never boot a foreign manifest as the top network. The page has a Content-Security-Policy with `script-src 'self'`. The sandbox worker has `connect-src 'none'`. |
| A hostile site redirects the visitor's key, through `byok_router` or a "mock" router | Beacon's own shell network sets the router, and peers always run on the visitor's router. Tests pin this, including a site that marks Beacon's router as its own "mock". |
| Prompt injection in a peer's instructions or replies | Peer output is data. The front agent answers only from tool results. A red-team finding needs evidence that the site's agents ran. |
| Beacon's page framed by another site (clickjacking) | `_headers` sends `frame-ancestors 'none'` for the pages. |
| Slow or huge responses that hang the inspector | One time limit covers the whole read, including the body, and a byte cap applies. |
| A fake "Passed" result | A red-team run with no evidence that the site was reached fails. An audit with nothing readable fails. |
| Using Beacon to probe sites the visitor may not test | Only public files are read. The red team runs only after consent and on the visitor's own key. The terms ask visitors to test only sites they may. |
| API cost abuse on the visitor's key | The token estimate is shown before a red-team run. Each turn is capped at 12 steps. Beacon has no key of its own. |

## Secrets
- **Visitor's AI key:** only in the visitor's browser.
- **`CLOUDFLARE_API_TOKEN`:** the deployer's own environment. Never committed.
- **`GITHUB_TOKEN`:** provided by GitHub Actions to the re-check job.

## Legal pages
- **Privacy and terms:** `shared/privacy.html`, linked from the footer. It matches the
  inventory above: no server data, the key goes only to the provider, Cloudflare logs.
- **Gap:** the operator and contact details are not filled in yet. The places are marked
  in `apps/shared/privacy.html`.
- **Refund policy:** N/A. There are no payments.
