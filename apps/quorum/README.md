# Quorum

Give it a headcount, dietary needs, a budget and a time. Quorum gets binding quotes from
several food vendors, finds the best plan within those rules, and places the orders the
visitor approves, each confirmed in the vendor's own window.

It is an open agentic website: static, with its own agent network, run in the visitor's
browser on the visitor's own model key. The vendors are the market sites in
`apps/market/`.

## How it negotiates

On a static web a vendor has no private server, so its pricing rules are public code.
Quorum therefore does not stage a bluffing game between chat agents. It negotiates the
way a careful buyer does: by asking every vendor for binding quotes under different
terms, and keeping the best that meets the rules.

1. **Mandate.** Day, headcount, vegetarians (not vegan), vegans, gluten-free (not
   vegetarian or vegan), budget, delivery window and flexibility, pickup allowed or not.
   The diet groups are separate people; someone with two needs is counted once, in the
   stricter group. Nonsense (0 people, more diets than people, a window that ends before
   it starts) is refused with the field and reason.
2. **Baskets.** For each vendor, the cheapest food per serving that covers the diets,
   most restrictive first, then the rest of the headcount.
3. **Search** (`js/search.js`). One-vendor plans and two-vendor splits (one vendor covers
   the diets, the other the rest), at every order time each vendor can do inside the
   window and its flexibility, with delivery and, if allowed, pickup. Each candidate is
   quoted by the vendors themselves, cheapest-looking first, at most 60 quotes.
4. **Checker** (`js/mandate.js`). The only thing that may call a plan acceptable. It
   counts servings itself from the vendors' menus (a quote is trusted only for its
   price), and checks with a small assignment that every person gets one serving that
   suits them: one dish never feeds two diet groups. Then budget, time and pickup, each
   problem with numbers.
5. **Result.** The best plan beside the best single-vendor plan, and the saving. If
   nothing fits, the closest plan and each vendor's own reason (no order time in the
   window, not enough notice, under its minimum). Vendor menus are checked when they
   arrive; a vendor with a menu Quorum cannot read, or that stops answering mid-search,
   is named and skipped. Changing the mandate drops the old plans.
6. **Award.** The visitor confirms the orders here, then each vendor opens its own
   window and confirms its order there. Each order ends ordered (with the vendor's
   reference), refused (with its reason, such as a changed price), declined, or unknown;
   an unknown order is never sent again, and orders not yet sent when ordering stops are
   marked as not sent. Once an order is finished, only the visitor can start a new one,
   with the page's "Start a new order" button.

Example, with the three demo vendors: 30 people, 6 vegetarian, 3 vegan, 4 gluten-free,
$800, 17:00 to 18:00 give or take 30 minutes. The best plan is Green Fork at 16:30 (its
off-peak discount) for the vegan and gluten-free food, plus Little Oven for the rest:
$176.78, $28.02 less than the best single vendor.

## Tools the assistant has

| Tool | Effect | Does |
| --- | --- | --- |
| `get_mandate` | read | The rules, with anything wrong with them |
| `set_mandate` | write | Change some rules; nonsense is refused |
| `list_vendors` | read | Each vendor's menu and ordering rules |
| `request_quote` | read | One vendor's binding quote for a "what if" |
| `find_best_plan` | write | Run the search, show it on the page, return numbered plans |
| `check_plan` | read | Re-quote and check a plan the assistant composed |
| `place_award` | irreversible | Order every part of a passing plan, each in its vendor's window |

The assistant never sees the contact card, and any vendor text that comes back is
cleaned of the card's details before the model sees it.

## Run

```shell
node tools/serve_town.mjs
```

Open http://localhost:8094/ and add a key in AI model settings. The three vendors must be
running too (the same command serves them).

## Tests

```shell
node --test "apps/quorum/tests/*.test.mjs" "tests/shared/*.test.mjs" "tests/market/*.test.mjs"
node tests/quorum/chrome/run_quorum_check.mjs
```

The second runs Quorum and the three vendors on four origins in Chromium with a scripted
model and a fake key, finds and places the best plan end to end, and checks consent
before contact, both review steps, each vendor's own record of its order, that no vendor
received the key, and that the model never saw the contact card.

## Deploy to Cloudflare Pages

Root directory `apps/quorum`, no build command. Then put the vendors' https origins in
`js/vendors.js`, and Quorum's https origin in each vendor's `partner-callers.js`.

## Limits

- Prices are public code, so this is open negotiation over binding quotes, not sealed
  bids. Private floors and sealed bids would need a trusted arbiter service.
- Every part of a split arrives at the same time; at most two vendors per plan.
- Someone with two diet needs (a gluten-free vegan) is counted once, in one group.
- Baskets favour the cheapest food per serving, not variety.
- Orders are placed one vendor at a time; if one is refused, the others still stand.
- No payments. The vendors are demo sites.
