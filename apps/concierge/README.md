# Town Concierge

Live at https://oaw-concierge.pages.dev. Its network has two agents, `concierge` and `itinerary_checker`, and links to the guesthouse's and harbor tours' own assistants for questions their data does not answer, after a consent card.

Plan a short trip to Marrow Point across its independent businesses, with live
availability and prices from each, and book every part on the site that runs it.

It is an open agentic website: static, with its own agent network, run in the visitor's
browser on the visitor's own model key. The businesses are the town sites in
`apps/town/`.

## What happens

1. The visitor fills in the **contact card** once. It stays in this browser; the
   assistant never sees it.
2. They ask for what they want. The assistant reads live options from each business
   through its partner desk, after the visitor allows each business on a card.
3. The assistant adds legs to the **trip board**. Each leg's name and price come from the
   business's own quote. Plain code flags conflicts: trips that overlap, a trip outside
   the stay, more people than the stay holds, a leg in the past.
4. **Book this trip?** The Concierge's dialog lists every leg, the total and who it is for.
5. Each business then opens **its own window**, shows the request with the visitor's
   details, and books only when the visitor confirms there. Each leg ends as booked
   (with the business's reference), refused (with its reason, such as a changed price),
   declined, or unknown. An unknown leg is never booked again automatically.

## Tools the assistant has

| Tool | Effect | Does |
| --- | --- | --- |
| `list_partners` | read | What each business offers, its reads, and what a booking needs |
| `search_partner` | read | One of a business's reads, answered by the business |
| `plan_leg` | write | Quote a stay or trip with its business and add it to the board |
| `remove_leg` | write | Remove a leg |
| `get_itinerary` | read | The legs, the total and the conflicts |
| `book_trip` | irreversible | Book each planned leg on its own site |

Partner contact goes through `shared/partner-desk.js` (from `apps/shared/`), which asks
the visitor before the first contact with each business, checks every request against
the business's own schema, and reports outcomes honestly.

## Run

```shell
node tools/serve_town.mjs
```

Open http://localhost:8093/ and add a key in AI model settings. The guesthouse and the
tour site must be running too (the same command serves them).

## Tests

```shell
node --test "apps/concierge/tests/*.test.mjs" "tests/shared/*.test.mjs"
node tests/concierge/chrome/run_concierge_check.mjs
```

The second runs the Concierge and both businesses on three origins in Chromium with a
scripted model and a fake key, plans and books a stay and a trip end to end, and checks
that no business received the key and the model never saw the contact card.

## Deploy to Cloudflare Pages

Root directory `apps/concierge`, no build command. Then put the businesses' https
origins in `js/partners.js`, and this site's https origin in each business's
`partner-callers.js`.

## Limits

- Bookings are leg by leg: there is no transaction across sites. If one leg fails, the
  others still stand; the visitor changes or cancels a booking on the business's page.
- No payments. The businesses are demo sites; nothing is really booked.
- On one machine, the Concierge and the tour site share the host name `localhost`, so the
  runtime's loopback key cookie can reach the tour site. Deployed on separate domains,
  this does not happen.
- Reads in a frame may not see bookings made elsewhere (storage partitioning); the
  business's booking window checks again.
