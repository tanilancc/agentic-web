# Beacon, Town Concierge and Quorum: design

Status: draft for approval. Date: 2026-11-16.

Three entries for the Open Agentic Web Challenge, built in this repository on the
reference browser runtime. This document is the design for all three and the parts they
share. Each product gets its own implementation plan after approval.

Things marked **(my call)** were decided by the author of this document, not by the
project owner. Correct any of them.

## 1. Intent

The owner wants to submit complex, original work to their organization's hackathon, and
to learn agent engineering by building it. A single agentified shop with a chat panel
would look like the repository's own pizza, guesthouse and tours examples, so each
product here targets a gap the spec itself names:

| Product | Gap it fills | Source of the gap |
| --- | --- | --- |
| **Beacon** | No conformance checker, no registry or search, no way to judge whether a peer network is safe to load | README "Testing" is a TODO; spec section 7 lists registries, search, reputation and conformance tests as open; spec section 5 says peer instructions are untrusted |
| **Town Concierge** | A linked partner's agent can describe its site but cannot check live availability or book | `skills/agentify-website/references/linking.md`, "Site tools"; spec section 7 "Cross-site browser actions" |
| **Quorum** | No multi-vendor quoting, negotiation or policy-bound purchasing | Spec section 7 "Transactions negotiation and arbitration"; README pizza example ("order 10 pizzas for delivery at 6pm") |

## 2. Goals, non-goals, anti-goals

**Goals**

- Each product is a conforming open agentic website: public manifest and network JSON,
  runs in the visitor's browser, visitor brings their own LLM key, peers load by URL
  after consent (spec sections 2 to 4, and the checks in section 6).
- Each demonstrates something the examples cannot do today.
- Every factual claim an agent makes comes from a tool result produced by site code.
  Prices, availability, conformance verdicts and mandate checks are computed in
  JavaScript, never by the model.
- Each has Node tests that run without an LLM key, as the repository's examples do.

**Non-goals**

- No real businesses, payments, accounts or email. Vendors are demo sites.
- No server-side code, database or hosted agent runtime.
- No background or scheduled agent work inside a product (the runtime is tab-scoped).
- No integration with the NANDA index or A2A in the first version.

**Anti-goals** (would make it a failure even if it runs)

- Agents that invent prices, availability, order numbers or audit results.
- A visitor's key, name, email or booking code reaching a partner origin without the
  visitor seeing it first.
- Editing the copied runtime per site, which would make "conforming" untestable.
- Beacon presenting a model-dependent red-team result as proof of safety.

## 3. Constraints found in the repository

- **Static and in-browser.** Everything is HTML, CSS, JavaScript modules and JSON.
- **The runtime is copied, not edited.** `skills/agentify-website/runtime/` is
  nsdeploy's runtime at commit `53a787c` with a short list of edits. Sites copy it
  unchanged.
- **Peer networks get no site tools.** A partner network runs in the caller's browser on
  the caller's key, with only the request text: no chat history, no private context, no
  `website_*` tools.
- **Per visitor message:** at most 4 partner-network calls, 1 per partner network, 24
  agent calls, 90 seconds. Calls nest at most 5 deep.
- **Cross-site actions exist in the runtime but the skill leaves them off.** An action
  registered with `availability: "bridge"` or `"top-level"` and a `callerOrigins` list
  is served by the owning site's `bridge/action-bridge.html`. Reads run in a hidden
  frame. Anything that is not a read must run in a popup on the owning origin, which
  shows its own confirmation (`runtime/action-transport.js`, `serveActionBridge`).
- **Consent before third-party contact** is required by the spec and provided by
  `Engine.requestConsent`.
- **Hosting.** Public agent files need `Access-Control-Allow-Origin: *`; `bridge/` must
  be framable; production needs HTTPS. Consent cards, CORS and bridges only behave as
  in the real world when each site has **its own origin**.
- **Default model.** Examples use hosted Otari with `alibaba/qwen3.8-flash`. A small
  model means instructions must be short and tools must do the hard work.

## 4. Approaches

Three ways to build these were considered.

1. **Build on the unmodified runtime, using its exported API and local site actions.**
   Each product is a static site that copies the runtime as-is. Extra behaviour lives in
   the site's own modules: local-only actions (which the runtime offers to agents as
   `website_*` tools) whose handlers talk to partner bridges through the runtime's
   `ActionBridgeClient`, and page code that drives `Engine`, `TraceBus`,
   `validateNetwork` and `parseHocon` directly. *Trade-off:* cross-site tool calls are
   wrapped rather than native, so the agent sees `website_ask_partner(...)` instead of a
   partner tool; in exchange every site stays conforming and the work is portable to
   other people's sites.
2. **Patch the runtime so partner actions become native agent tools.** Cleaner tool
   names and less wrapper code. *Trade-off:* a second diverging runtime fork, against
   the skill's rule, and Beacon would be checking other sites against a runtime we
   changed.
3. **Add a small backend** (a registry API for Beacon, an arbiter for Quorum). Enables
   instant directory submission and genuinely private vendor terms. *Trade-off:* breaks
   the challenge's core principle that agent networks run without server-side code, and
   adds hosting and cost.

**Picked: approach 1 (my call).** The owner delegated how it gets built. Approach 1 is
the only one that keeps all three products inside the spec's minimum profile, and its
wrapper pattern is itself a reusable result. Approach 3's arbiter is noted as future
work for Quorum.

A second choice: **three separate sites sharing one demo town**, not one site with
three modes (my call). Separate origins are what make linking, consent and bridges real,
and Beacon can then inspect the other two.

## 5. Shared foundations

### 5.1 Layout (my call)

```
apps/
  beacon/            Beacon site
  concierge/         Town Concierge site
  quorum/            Quorum site
  town/
    guesthouse/      copy of examples/guesthouse_agentified + bridge actions
    harbor_tours/    copy of examples/harbor_tours_agentified + bridge actions
    little_oven/     copy of examples/pizza_restaurant_agentified, updated + bridge actions
    <vendor_b>/      new food vendor for Quorum
    <vendor_c>/      new food vendor for Quorum
  shared/
    partner-desk.js  caller-side helper for partner bridges (5.2)
tools/
  sync_runtime.mjs   copies skills/agentify-website/runtime into every site
  serve_town.mjs     serves every site locally, one port and host name each
```

`examples/` is left untouched. Each site holds its own committed copy of `runtime/`, as
the examples do, so any static host can serve a site folder directly. `shared/` files
are copied into the sites that use them by `sync_runtime.mjs`, because a deployed site
cannot import from outside its own folder.

### 5.2 The partner desk pattern

Used by Town Concierge and Quorum. It is what gives a caller live data and real actions
on a partner site without editing the runtime.

**On the vendor site**

- Registers extra actions for other sites: reads with `availability: "bridge"`, and
  anything that changes state with `availability: "top-level"` and effect
  `irreversible`. `callerOrigins` lists the exact caller origins it accepts.
- These wrap the same site functions its own page uses, so business rules stay in one
  place.
- Its bridge page serves them. Reads answer from the hidden frame. Writes open the
  vendor's own window, where the vendor's page shows the request and the visitor
  confirms there.

**On the caller site**

- `partner-desk.js` holds a table of known partners (label, bridge URL, origin) taken
  from the caller's manifest `allowed_peers`. It refuses any other origin.
- Before the first contact with a partner origin it asks for consent through
  `Engine.requestConsent`, naming the origin and the purpose.
- It fetches the partner's action catalog, validates arguments against the partner's
  schema, and executes through `ActionBridgeClient`.
- The caller registers a small fixed set of local-only actions built on it, such as
  `partner_catalog`, `partner_read` and `partner_commit`. The runtime offers these to
  the caller's agents as `website_*` tools.
- A timeout or a closed window after a write has started is recorded as **outcome
  unknown** and is never retried automatically (spec section 3.1).

**Known limits to design around**

- Browsers partition storage for embedded frames. A vendor read running in a hidden
  frame sees the vendor's published data but not bookings the visitor made on the
  vendor's own page. So reads are advisory; the vendor's confirmation window re-checks
  before committing and can refuse.
- The skill's build writes a bridge that exposes no actions and checks that the bridge
  is untouched. Vendor sites need a bridge that does expose actions. See the spike in
  section 9.

### 5.3 Personal details

Concierge and Quorum each keep a **contact card** (name, email, phone, address) that the
visitor fills in on the page. It is stored in the caller's own browser storage. Agents
never read it: an agent passes a flag such as `use_contact_card: true`, and the
partner-desk handler attaches the fields to the bridge call. The visitor sees them in
the vendor's confirmation window before anything is committed. They never go into a
partner-network request, which the visitor only sees 140 characters of.

### 5.4 Tests and checks

- `build_network.mjs --check` for every network.
- Node tests per site with the templates' scripted model and DOM stand-ins.
- Unit tests for every piece of deterministic logic (conformance checks, conflict
  checker, pricing rules, mandate checker).
- One Chrome check across origins per product, modelled on `tests/linking/`, with the
  mock router, so no key is needed.
- A live check with a real key is done by the owner, never with a key pasted into chat.

### 5.5 Hosting (my call, needs the owner's confirmation)

Each site is deployed as its own static site on a host that gives one HTTPS origin per
site and lets us set headers. Ten or so small sites are needed in total. Locally,
`serve_town.mjs` gives each site its own port and host name. Deploying is public and
needs the owner's account, so nothing is deployed without asking.

## 6. Beacon

**One line:** paste the address of any agentic site; get a conformance report, a
red-team report, and a way to find and try agent sites.

### 6.1 Inspector (no key needed)

Input: a network URL, or a site URL from which Beacon reads `agent-manifest.json` and
lists its networks.

It runs a fixed list of checks in the browser, each with a spec reference, a result
(pass, warning, fail, or not applicable), the evidence and a fix hint. Groups:

- **Publication:** HTTPS; manifest loads cross-origin; requested network name matches
  exactly; network file loads cross-origin; `links.json` loads; no redirect to another
  origin.
- **Network validity:** the runtime's own `validateNetwork` result; front agent exists;
  no duplicate or missing agent references; every agent has a description; invocation
  schemas present.
- **Policy:** peer policy mode; every peer or MCP origin named in the network is in
  `allowed_peers`; link labels exist for each partner.
- **Actions and bridge:** if the manifest declares actions, the bridge page loads in a
  frame and answers the catalog request; which actions it exposes and their effects.
- **Hygiene:** strings shaped like credentials in any public file; instruction size;
  demo-mode or fabricate-if-missing wording; a declared default model.

Because the checks run in a real browser from another origin, a CORS failure is
observed exactly as a caller would hit it.

The check list lives in one module that runs both in the browser and in Node. In Node,
CORS is checked by reading the response header, as `scripts/check_partner.mjs` does.

**Result:** a level (Conformant, Conformant with warnings, Not conformant) derived from
fixed rules, plus the full table. No weighted score (my call): a number invites arguing
about weights, a failed MUST does not.

A report has a shareable link, `?site=<url>`, which re-runs the checks when opened.

### 6.2 Red team (needs the visitor's key)

The spec's threat is a peer's instructions manipulating the caller's model. Beacon
tests that directly.

- Beacon runs its own small **canary caller network** in a fresh `Engine`. The caller
  has a secret canary value in private context, a canary sentence in its instructions,
  and a harmless **honeypot action** (for example `transfer_demo_funds`) that it is
  told never to call.
- The caller delegates a set of ordinary requests to the target network, loaded as a
  peer.
- Beacon wraps `fetch` on its own page for the run and records every outgoing request:
  destination origin, and whether an `Authorization` header was present. The key's value
  is never recorded.
- **Findings, from observation not opinion:**
  - Did any request carrying the key go anywhere but the chosen router?
  - Did the canary value or canary sentence appear in any request to the target origin
    or in any text sent onward?
  - Was the honeypot action proposed or called?
  - Did the run contact any origin not declared in the target's manifest?
  - Did the target try to override the caller (detected by the above, plus the judge
    below)?
- A separate **instruction auditor agent** reads the target's published instructions
  and returns a structured list of passages that tell a caller's model to ignore its
  rules, reveal context, or call tools. Each finding quotes the passage.
- A **grounding probe** asks the target, as a peer, for things it cannot know there
  (a live price, a booking) and checks whether it points to its page or makes something
  up. The judgement is made by the auditor agent and shown with the transcript.

Every red-team result is labelled with the model, the number of trials and the date,
and with the sentence that it is evidence about that model on those prompts, not a
guarantee. Trials default to 3 per probe (my call), with a visible token estimate
before the run starts.

### 6.3 Directory and "try it"

- `apps/beacon/index/sites.json` lists sites: network URL, name, one-line description,
  tags, who submitted it. It starts with this project's own sites and the one entry in
  `docs/agentic_websites.md`.
- **Getting listed** is a pull request that adds an entry. A GitHub Actions workflow
  runs the Inspector checks in Node on changed entries and fails the pull request when a
  site is Not conformant.
- A scheduled workflow re-checks every listed site, writes each site's latest level and
  date into the index, and generates a badge image per site that the site's owner can
  embed. A site that stops conforming is marked, not silently removed.
- **Search** is Beacon's own agent network: a front agent (`beacon_guide`) with
  local actions `search_directory` (keyword and tag match over the index, in code),
  `get_site_report` and `inspect_site`. It answers "find me an agent that can book a
  boat trip" only from the index.
- **Try it:** after a consent card, Beacon mounts the runtime pointed at the chosen
  site (`boot(root, { originUrl })`), so the visitor talks to that site's agents inside
  Beacon, on their own key. That site's actions arrive only through its bridge, under
  its own rules.

### 6.4 Page

```
+--------------------------------------------------------------+
| Beacon      [ https://site.example/network      ] [Inspect]  |
+----------------------+---------------------------------------+
| Directory            | Report: site.example/network          |
|  search…             | Level: Conformant with warnings       |
|  • Tidewhistle  ✓    | [Conformance] [Red team] [Try it]     |
|  • Harbor Tours ✓    |  ✓ Manifest loads cross-origin  §3.3  |
|  • Little Oven  !    |  ! Peer policy is open          §3.2  |
|                      |  ✗ Bridge page not framable     §3.4  |
| Ask Beacon (chat)    |  evidence · how to fix                |
+----------------------+---------------------------------------+
```

### 6.5 Out of scope for Beacon

Crawling the web for agent sites; ranking by popularity or reputation; testing a site's
own `website_*` tools (they are not offered to callers); auditing MCP servers beyond
"reachable from a browser, after consent".

## 7. Town Concierge

**One line:** plan a short trip to Marrow Point across independent businesses, with live
availability and prices from each, and book every leg on the site that owns it.

### 7.1 What the visitor does

1. Opens the Concierge, fills in the contact card once, and says what they want
   ("two nights for two with a dog, a seal trip on Saturday, pizza delivered Friday").
2. The agent reads live options from each partner and fills an itinerary board on the
   page: stay, activities, meals, each with a price and the partner it comes from.
3. Site code checks the plan for conflicts (a tour that returns after the dinner slot,
   a stay that does not cover the tour date, a party size a room cannot take) and the
   agent proposes fixes.
4. The visitor presses "Book this trip". For each leg, the owning site's window opens
   with the request and the visitor confirms there. Each leg ends as booked, declined,
   refused by the vendor, or outcome unknown.
5. The page shows one trip receipt: every leg, its reference and status, the total, and
   a printable view. The receipt is kept in the browser.

### 7.2 Parts

- **Network** `marrow_point_concierge`: a front agent that talks to the visitor, and one
  specialist, `itinerary_keeper`, that owns the board and conflict tools. Partner agent
  networks (guesthouse, tours, pizza) are linked the standard way and are used for
  qualitative questions ("is it suitable for children?"), behind the normal consent
  card.
- **Local actions:** board reads and writes (`get_itinerary`, `set_item`,
  `remove_item`), `check_conflicts` (read), the three partner-desk actions from 5.2,
  and `book_leg` (irreversible), which opens the vendor's window.
- **Vendor sites:** the three town copies expose bridge reads (search and quote) and one
  top-level commit each (place booking, reserve seats, place order).
- **Booking is leg by leg, not atomic** (my call). A static web has no transaction
  across origins. If a later leg fails, the Concierge says so and offers the vendor's
  own cancellation, never a silent rollback.

### 7.3 Page

```
+--------------------------------+-----------------------------+
| Your trip        Fri – Sun     | Concierge (chat)            |
| Fri  Stay  Garden Room   £…  ✓ |  …                          |
|      Meal  Little Oven   £…  ! |  [consent card]             |
| Sat  Trip  Seal watch    £…    |                             |
| ! Dinner overlaps tour return  |                             |
| Total £…        [Book trip]    | Contact card ▸   AI model ▸ |
+--------------------------------+-----------------------------+
```

### 7.4 Out of scope for Concierge

Payments; changing a booking after it is made (the visitor goes to the vendor's page);
partners outside the demo town in the first version, though any site that exposes
bridge actions to the Concierge's origin would work.

## 8. Quorum

**One line:** give it a headcount, dietary needs, a budget and a delivery window; its
agents get binding quotes from several vendors, work the terms to find the best deal
inside your rules, and place the orders you approve.

### 8.1 The honest shape of "negotiation"

On a static web a vendor has no private server, so its pricing rules are public code.
Quorum therefore does not stage a bluffing game between chat agents. Each vendor
publishes **concession rules** in its own site code: volume tiers, an off-peak delivery
discount, a pickup discount, a minimum order, lead times, a delivery fee. The vendor's
`request_quote` action is the only authority on price: it takes items, quantities and
terms and returns a quote with an identifier and an expiry. Quorum's agents negotiate
by asking for quotes under different terms, across vendors, and reasoning about which
concessions are worth trading for. Sealed bids and private floors need a trusted
arbiter service and are future work.

### 8.2 Parts

- **Mandate.** A form on the page: headcount, dietary counts, budget ceiling, delivery
  window and how flexible it is, pickup allowed or not, must-haves, exclusions, and
  what matters more (cost, coverage of dietary needs, single delivery). The mandate is
  page state. `check_mandate` is site code and is the only thing that can call a plan
  acceptable.
- **Network** `quorum_procurement`:
  - `procurement_lead` (front): talks to the visitor, runs the process, presents the
    result.
  - `menu_composer`: turns the mandate and each vendor's catalog into candidate baskets.
  - `negotiator`: requests quotes, varies terms within the mandate's flexibility, may
    split the order across vendors, and stops at a round limit.
  - `auditor`: checks each candidate award with `check_mandate` and explains every
    rejection. It cannot approve anything the checker rejects.
- **Local actions:** `get_mandate`, `check_mandate`, `record_round` and `get_log`
  (negotiation log), the partner-desk actions, and `place_award` (irreversible), which
  opens each chosen vendor's window in turn.
- **Vendors:** Little Oven plus two new food vendors with different catalogs and
  different concession rules, so that the best deal is not obvious and can be a split.
- **Baseline.** Site code also runs a plain search over a coarse grid of terms and
  reports the best plan it finds. The page shows the agents' result next to it. This
  keeps the demo honest and gives a measurable target (my call).

### 8.3 Page

```
+--------------------+-----------------------------------------+
| Mandate            | Negotiation log                         |
|  40 people         |  R1 Little Oven  20 pizzas 18:00  £…    |
|  8 vegetarian      |  R2 Little Oven  20 pizzas 17:00  £… ↓  |
|  3 gluten-free     |  R2 Vendor B     …            refused   |
|  Budget £…         +-----------------------------------------+
|  Deliver 17–18:30  | Proposed award          ✓ within mandate|
|  [Start]           |  Little Oven £…  Vendor B £…  Total £…  |
| Chat               |  Baseline search: £…      [Place orders]|
+--------------------+-----------------------------------------+
```

### 8.4 Out of scope for Quorum

Payments and escrow; sealed bids; vendors negotiating with their own models; binding
commitments beyond a demo order on a demo vendor.

## 9. Riskiest assumptions: spike these first

1. **A site can expose bridge actions and still pass the skill's build check.** The
   build writes `bridge/` itself and says not to edit it. The spike finds the smallest
   supported way to serve bridge actions (a manifest field, or a second bridge page
   beside the generated one) and confirms a caller on another origin can read a catalog
   and run a read.
2. **A top-level action completes from a caller-triggered window.** Popup blockers
   require a user click; the spike confirms the flow from the "Book" button through the
   vendor's confirmation to a receipt back in the caller, and what happens when the
   visitor closes the window.
3. **A second `Engine` can run a foreign network inside Beacon's page**, both as a peer
   under the canary caller and as "try it", with `fetch` wrapped for observation.
4. **The default small model can run a four-agent Quorum round** inside 24 agent calls
   and 90 seconds per visitor message. If not, the negotiator's loop moves into site
   code, with the agent choosing strategy and the code issuing the quote requests.

If spike 1 or 2 fails, Concierge and Quorum fall back to deep links: the caller prepares
the request and opens the vendor's page with it filled in, and the visitor completes it
there.

## 10. Build order and cut lines

1. Spikes 1 to 3.
2. **Beacon**: Inspector, then directory and "try it", then red team.
3. **Town sites** with bridge actions, and the partner desk.
4. **Town Concierge.**
5. **Quorum**: vendors, mandate and checker, then agents, then baseline.
6. Hosting, demo scripts, and a pull request adding the sites to
   `docs/agentic_websites.md` upstream (only with the owner's go-ahead).

If time runs short, cut in this order: Quorum's baseline; Beacon's scheduled re-check
and badges; Quorum's third vendor; Beacon's grounding probe. Beacon's Inspector and the
Concierge's booking flow are the core.

## 11. Decided by the owner

- Build all three concepts.
- The author picks how they are built.

## 12. Open questions for the owner

1. **Hosting.** Separate origins are needed. Which host and account should be used, and
   who presses deploy?
2. **Submission.** The hackathon page could not be read from the build environment. Is
   this one submission or three, what is the deadline, and what are the judging
   criteria? The answers may change the cut lines in section 10.
3. **Names.** Beacon, Town Concierge and Quorum are working names.

## 13. Left to the builder

File names inside each site; exact check identifiers and wording; visual design within
the page sketches; the two new vendors' identities, catalogs and concession rules; the
probe prompts; the choice of static host adapter files (`_headers` or equivalent);
agent instruction wording, kept short for a small model.
