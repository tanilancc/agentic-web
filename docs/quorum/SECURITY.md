# Quorum security and data

## Data inventory
| Data | Why | Stored where | Retention | Shared with |
| --- | --- | --- | --- | --- |
| Contact card (first and last name, email, phone) | A vendor needs to know who ordered | Quorum's browser storage | Until the visitor clears it | Each vendor's own window, on the visitor's screen, when ordering. **Never the model.** |
| Orders, with the customer's details | The vendor's record of the order | The vendor's browser storage, on the same device | Until cleared | Nobody else |
| Mandate (headcount, diet counts, budget, time) | Find a plan | Quorum's browser storage | Until cleared | The model, and the vendors, as quote requests |
| Order history and references | Show results; prevent a second order | Quorum's browser storage (last 20) | Until cleared | The model sees the current orders |
| Visitor's AI key | Run the assistant | Browser storage | Until cleared | Only the chosen AI provider |
| Chat messages | Answer the visitor | Browser memory | Until the chat is cleared | The AI provider |

Diet counts are numbers, not names, so no person's dietary or health information is
recorded. There is no server, no analytics and no tracking cookies.

## Third parties
| Service | Receives |
| --- | --- |
| AI provider chosen by the visitor | Messages, instructions, tool results, the key |
| The three vendor sites | Catalog and quote requests after consent; orders in their own windows |
| Cloudflare (hosting) | Standard request data, such as IP address and user agent |

## Threat model
| Risk | Mitigation |
| --- | --- |
| The model calls a failing plan acceptable | Only `checkPlan` decides. `reviewAward` re-runs it before the order dialog opens. `plan_auditor` may not override it. |
| A vendor sends a fake or malformed catalog or quote | Catalogs and quotes are validated on arrival. Servings are counted from the menus, not from the vendor's own claims. |
| Diet groups double-counted, so someone gets nothing | Groups are separate people, and a max-flow assignment gives each person one suitable serving. |
| A stale "best plan" ordered after the rules change | `setMandate` drops the old search. The page says the mandate changed. |
| Ordering twice | Orders are saved as "booking" before they are sent and reload as "unknown". Unknown orders are never resent. Only the visitor's button starts a new award. |
| A vendor claims an order it did not record | Vendors refuse an order they cannot save. Quorum shows only the vendor's confirmed reference. |
| A vendor stops answering mid-search | It is marked unreachable and named. The search continues with the others. |
| Prompt injection in vendor text | Vendor text is data. Item names are shown as text, never as HTML. Dialogs are keyed by "Order N". Contact-card values are stripped from vendor text. |
| A rogue site uses a vendor desk | `partner-callers.js` lists exact caller origins. Orders run only in the vendor's top-level window, with its confirmation. |
| Key leak to a vendor | Browser checks require zero vendor requests with an Authorization header. |
| Cost abuse | 12 steps per turn and at most 60 quotes per search. |

## Secrets
- **Visitor's AI key:** only in the visitor's browser.
- **`CLOUDFLARE_API_TOKEN`:** the deployer's environment. Never committed.

## Legal pages
- **Privacy and terms:** `shared/privacy.html` on Quorum and all three vendors, written
  from this inventory.
- **Gap:** the operator and contact details are not filled in yet.
- **Refund policy:** N/A. There are no payments; the demo charges nothing.
