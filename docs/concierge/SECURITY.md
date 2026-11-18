# Town Concierge security and data

## Data inventory
| Data | Why | Stored where | Retention | Shared with |
| --- | --- | --- | --- | --- |
| Contact card (first and last name, email, phone) | A business needs to know who booked | Concierge's browser storage | Until the visitor clears it | Each business's own window, on the visitor's screen, at booking. **Never the model.** Partner text is cleaned of card values before a model sees it. |
| Bookings, with the guest's details | The business's record of the booking | The business's browser storage, on the same device | Until cleared | Nobody else |
| Itinerary, with booking codes | The trip plan | Concierge's browser storage | Until cleared | The model sees legs, prices and codes, never the card |
| Visitor's AI key | Run the assistants | Browser storage | Until cleared | Only the chosen AI provider. The town assistants called by link run in this browser on the same provider. |
| Chat messages | Answer the visitor | Browser memory | Until the chat is cleared | The AI provider. A business's assistant gets only the request shown on the consent card. |

There is no server, no analytics and no tracking cookies. The businesses are demo sites.

## Third parties
| Service | Receives |
| --- | --- |
| AI provider chosen by the visitor | Messages, instructions, tool results, the key |
| Tidewhistle Guesthouse and Harbor Tours sites | Read requests after consent; bookings in their own window; link requests after a consent card |
| Cloudflare (hosting) | Standard request data, such as IP address and user agent |

## Threat model
| Risk | Mitigation |
| --- | --- |
| Double booking on a timeout, retry or reload | A leg is saved as "booking" before it is sent and reloads as "unknown". Unknown legs are never resent. An abort closes the window. The time limit is 300 s. |
| A stale business page overwrites a booking made elsewhere | The businesses' booking books call `refresh()` before they place, cancel or reserve. |
| Price changed between quote and booking | Each booking passes `expectedTotalCents`, and the business refuses a mismatch. |
| A partner's text carries the visitor's details to the model | `safeOutcome` and `cleanText` strip contact-card values from partner text. |
| Prompt injection from a partner's reply or assistant | Replies are data. Prices and bookings come only from site tools. Confirmation dialogs are keyed by "Leg N", never by a partner's own words. |
| A rogue site uses a business's partner desk | `partner-callers.js` lists exact caller origins. Bookings run only in the business's top-level window, with its own confirmation. |
| Key leak to a partner | Partners never receive the key: tests and browser checks count partner requests with an Authorization header, and require zero. |
| Clickjacking or script injection | A Content-Security-Policy meta tag with `script-src 'self'` on every page. `frame-ancestors 'none'` on pages, except `bridge/` and `partner-desk/`, which must be framable. |
| Cost abuse on the visitor's key | 12 steps per turn. Each partner is called at most once per visitor message. |

## Secrets
- **Visitor's AI key:** only in the visitor's browser.
- **`CLOUDFLARE_API_TOKEN`:** the deployer's environment. Never committed.

## Legal pages
- **Privacy and terms:** `shared/privacy.html` on all three sites, written from this
  inventory: the contact card stays in the browser and goes only to the business's
  window; the key goes only to the provider; Cloudflare logs.
- **Gap:** the operator and contact details are not filled in yet.
- **Refund policy:** N/A. There are no payments; the demo charges nothing.
- The town sites' "House policies" and "Good to know" pages are fictional business rules,
  not legal pages.
