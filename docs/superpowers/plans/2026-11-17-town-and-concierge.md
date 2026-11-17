# Town Sites and Town Concierge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Town Concierge: a static agentic site that plans a short trip across independent partner sites, using live availability and prices from each, and books every leg on the site that owns it.

**Architecture:** The town's vendor sites (copies of the guesthouse and harbor tours examples) publish a second action bridge, `partner-desk/`, that offers other sites a few actions. Reads run in a hidden frame; bookings run in the vendor's own popup after the vendor's own confirmation. The Concierge talks to vendors through one shared module, `PartnerDesk`, which its own local actions wrap. Its agents never see personal details: the page's contact card is attached at booking time and shown in each vendor's confirmation.

**Tech Stack:** HTML, CSS, JavaScript ES modules, JSON. Node.js 22 `node:test`. No npm packages. The pre-installed Playwright for the browser check.

**Spec:** `docs/superpowers/specs/2026-11-16-agentic-web-trio-design.md`, sections 5 and 7. Spikes 1 and 2 from section 9 were run on 2026-11-17 (results below).

## Spike results (2026-11-17)

- **Spike 1, bridge actions:** a vendor can publish a second folder `partner-desk/` holding a copy of the skill's `templates/bridge/action-bridge.html` and its own `agent-manifest.json` (`{"networks":[{"name":...}],"actions":{"version":1,"module":"../partner-actions.js"}}`). The runtime's `serveActionBridge` reads the manifest next to the page and serves actions registered with `availability: "bridge"` or `"top-level"` to origins in their `callerOrigins`. `build_network.mjs` owns only `bridge/`, so its checks are unaffected.
- **Spike 2, booking in the vendor's window:** `ActionBridgeClient.connect(true)` shows the runtime's own "Open action site" dialog, whose click opens the popup, so popup blockers do not apply. The vendor's popup shows the runtime's review dialog titled "Request from <caller origin>" and runs the handler only on confirm. A booking saved to the vendor's `localStorage` from the popup is visible on the vendor's own page. Real browsers partition storage for embedded frames, so a framed read may not see bookings made elsewhere: reads are advisory and the popup re-checks.

## Global Constraints

- Everything in `docs/superpowers/plans/2026-11-16-foundations-and-beacon.md` "Global Constraints" applies, except that Beacon-specific lines apply to Beacon only.
- `examples/` is never edited. Town sites are copies under `apps/town/`.
- Personal details (name, email, phone) never enter a model prompt, a tool result or a partner-network request. They go only into a vendor's commit arguments, which the vendor's own window shows before anything is booked.
- A commit whose outcome is unknown (timeout, popup closed after the request was sent) is reported as `unknown` and never retried automatically (spec §3.1).
- Every booking passes the total the visitor saw; the vendor refuses a mismatch.
- Local origins: Concierge `http://localhost:8093`, guesthouse `http://127.0.0.1:8081`, harbor tours `http://localhost:8082`. Partner `callerOrigins` come from one module per vendor, `partner-callers.js`, which lists these plus the deployed Concierge origin once known.

## Review Focus

1. **A partner that answers slowly or never.** A read must end within 15 s as a failed read with a reason; a commit within 180 s as `unknown`. Pinned in Task 4.
2. **The visitor closes a vendor's popup.** Before the request was sent: `declined`, nothing booked. After: `unknown`, never retried. Pinned in Task 4.
3. **A price that changed between planning and booking.** The vendor refuses; the leg shows `refused` with the vendor's reason. Pinned in Tasks 3 and 6.
4. **Personal details leaking to a model.** No tool result and no model request contains the contact card's name, email or phone. Pinned in Task 6.
5. **Hostile text from a partner** (a tour name with markup) is shown as text on the itinerary board. Pinned in Task 6.

---

### Task 1: Town site copies

**Files:** Create `apps/town/guesthouse/` and `apps/town/harbor_tours/` (copies of the two agentified examples without `runtime/`). Modify `apps/sites.json`.

- Register `guesthouse` (127.0.0.1:8081) and `harbor_tours` (localhost:8082). Run `node tools/sync_runtime.mjs`.
- Each copy's partner link points at the other copy's local origin: change the partner tool URL, `link_labels` key and `allowed_peers` in the `.hocon` and manifest, then rebuild with `build_network.mjs`.
- [ ] Each copy's own tests pass: `node --test "apps/town/*/tests/*.test.mjs"`.
- [ ] Commit.

### Task 2: Saved bookings

**Files:** Create `apps/town/guesthouse/js/saved-bookings.js`, `apps/town/harbor_tours/js/saved-reservations.js`. Modify each site's book class (`ReservationBook`, `TripBook`). Test: `apps/town/*/tests/saved.test.mjs`.

- `SavedBookings` (`SavedReservations`): `static load(storage) -> record[]`, `static save(storage, records)`; key `town-guesthouse-bookings-v1` (`town-harbor-tours-reservations-v1`); a corrupt or missing value loads as `[]`; a storage that throws is ignored.
- The book's constructor adds saved records after the built-in ones; `place`/`cancel` (`reserve`/`cancel`) save after a change. The storage is passed in (default `globalThis.localStorage`, or none in Node).
- [ ] Tests: a placed booking survives a new book on the same storage; corrupt JSON loads as none; a throwing storage still books in memory.
- [ ] Commit.

### Task 3: Partner desks on the vendors

**Files:** Create `partner-desk/action-bridge.html`, `partner-desk/agent-manifest.json`, `partner-actions.js`, `partner-callers.js` in each town site. Test: `apps/town/*/tests/partner_actions.test.mjs`.

Guesthouse actions (all `callerOrigins: PARTNER_CALLERS`):

| name | effect | availability | input | returns |
| --- | --- | --- | --- | --- |
| `search_rooms` | read | bridge | `checkIn, checkOut, guests` | `{rooms:[{roomId, name, maxGuests, totalCents}]}` or `{ok:false, reason}` |
| `quote_stay` | read | bridge | `roomId, checkIn, checkOut, guests` | `{roomId, name, checkIn, checkOut, guests, totalCents}` or refusal |
| `place_booking` | irreversible | top-level | stay + `firstName, lastName, email, phone?, arrival, expectedTotalCents` | `{ok:true, code, totalCents}` or refusal |

Harbor tours actions: `find_departures` (`date, adults, children` → `{departures:[{tourId, name, date, time, minutes, placesLeft, totalCents}]}`, only those without a problem), `quote_trip` (`tourId, date, time, adults, children`), `reserve_trip` (one trip + `firstName, lastName, email, phone?, expectedTotalCents` → `{ok, code, totalCents}`).

- Handlers call the site's own book on saved storage; the business rules stay in the site.
- A refusal is `{ok:false, reason}`, where reason is the site's first error message.
- [ ] Tests: catalog entries have the stated effect and availability; `callerOrigins` equals `PARTNER_CALLERS`; a read changes nothing; a commit with a wrong `expectedTotalCents` refuses and saves nothing; a good commit saves and returns a code; the bridge page loads `../runtime/action-bridge.js`.
- [ ] Commit.

### Task 4: PartnerDesk

**Files:** Create `apps/shared/partner-desk.js`. Modify `apps/sites.json` (concierge `shared: ["partner-desk.js"]`, added in Task 6). Test: `tests/shared/partner_desk.test.mjs`.

- `new PartnerDesk({partners, consent, ClientClass = ActionBridgeClient, readTimeoutMs = 15000, commitTimeoutMs = 180000})`. `partners`: `[{id, label, origin, bridgeUrl}]`; a `bridgeUrl` not on its `origin` is refused at construction.
- `catalog(id) -> Promise<[{name, effect, inputSchema}]>`: asks `consent({kind:"network", peerLabel, peerOrigin: host, requestText, est})` before the first contact with each origin in this page's life; a decline returns `{ok:false, reason:"The visitor declined to contact <host>."}` and contacts nothing.
- `read(id, action, args) -> Promise<value | {ok:false, reason}>`: action must be a catalog `read`; args validated with the runtime's `validateData` against its schema before sending.
- `commit(id, action, args) -> Promise<{status, value?, reason?}>`, status one of `booked` (value.ok true), `refused` (value.ok false, reason), `declined` (visitor cancelled before sending), `unknown` (timed out or closed after sending). Never retries.
- [ ] Tests with a stand-in client: consent once per origin; decline contacts nothing; unknown partner id refused; a non-read action refused by `read`; invalid args refused before sending; read time-out gives a reason within the limit; commit cancelled before send is `declined`; closed after send is `unknown`; refused value is `refused`; nothing is ever sent twice.
- [ ] Commit.

### Task 5: Itinerary

**Files:** Create `apps/concierge/js/itinerary.js`. Test: `apps/concierge/tests/itinerary.test.mjs`.

- `Itinerary`: `items` of `{id, partner, kind: "stay"|"trip", title, start, end, partySize, totalCents, commit: {action, args}, status: "planned"|"booked"|"refused"|"declined"|"unknown", code?, reason?}`. `start`/`end` are ISO date-times (stay: check-in 15:00 to check-out 11:00).
- `add(item) -> id`, `remove(id)`, `list()`, `total()`, `toJSON()`/`static fromJSON()`.
- `conflicts() -> [{ids, message}]`: two trips overlapping in time; a trip on a day the planned stay does not cover; a trip whose party is larger than the stay's guests (warning text says "more people than the stay"); a leg in the past. Pure code.
- [ ] Tests for each conflict, no conflict for a clean plan, and round trip through JSON.
- [ ] Commit.

### Task 6: Concierge site

**Files:** `apps/concierge/` with `index.html`, `styles.css`, `_headers`, `README.md`, `marrow_point_concierge.hocon`, `agent-manifest.json`, `links.json`, `site.js`, `site-actions.js`, `js/app.js`, `js/partners.js`, `js/board.js`, `js/contact-card.js`. Tests: `apps/concierge/tests/*.test.mjs`.

- `js/partners.js`: the two partners (`guesthouse`, `harbor_tours`) with label, origin, bridge URL, and per partner how to turn a quote into an itinerary item and which commit action books it.
- Local actions (website tools), one front agent `concierge`:
  - `list_partners` (read): id, label, what it offers (from catalog descriptions).
  - `search_partner` (read): `{partner, action, args}` → PartnerDesk.read.
  - `plan_leg` (write): `{partner, args}` → quotes through the partner's quote action, adds the item from the quote; the price and title come from the vendor.
  - `remove_leg` (write), `get_itinerary` (read, with `conflicts`).
  - `book_trip` (irreversible): Concierge's own dialog lists every planned leg and the total; then commits each leg in order with the contact card attached; returns per-leg `{id, status, code?, reason?}`. Refuses when the contact card is incomplete (reason names what is missing, not its value).
- Contact card: form on the page saved in this origin's `localStorage`; never passed to a model; `book_trip` reads it at commit time.
- Board: lists legs with partner, time, price and status, the total, and conflicts; text only.
- [ ] Tests: network valid with grounding and peer rules; scripted run plans a stay and a trip; no model request or tool result contains the card's name, email or phone; a hostile tour name renders as text; `book_trip` with a changed price shows that leg `refused` and books the rest; an incomplete card refuses before any vendor contact.
- [ ] Build with `build_network.mjs --check`; commit.

### Task 7: Browser check, hosting and READMEs

**Files:** `tests/concierge/chrome/run_concierge_check.mjs`, `tests/concierge/README.md`, each site's `_headers` (partner-desk framable; Concierge CSP like Beacon's), READMEs, root README "Projects" line.

- The check serves Concierge and both vendors, scripts the model, fills the contact card, plans one stay and one trip, presses Book, clicks each vendor's "Open action site" and confirms in each popup, then asserts both legs `booked` with codes, the vendor's own page storage holds both, no vendor request carried `Authorization`, and no page errors or policy violations.
- [ ] Run it; fix until it passes; full suite green; commit and push.
