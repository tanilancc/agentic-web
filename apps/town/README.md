# The town: partner sites for Town Concierge

Copies of the repository's two agentified examples, the Tidewhistle Guesthouse and
Marrow Point Harbor Tours, changed in two ways so another site can book with them:

- **Saved bookings.** Bookings are kept in the browser's `localStorage` on each site's
  own origin (`js/saved-bookings.js`, `js/saved-reservations.js`), so a booking made in
  the site's own window is still there on its own page.
- **A partner desk.** `partner-desk/` is a second action bridge, next to the `bridge/`
  folder the build writes. It serves the actions in `partner-actions.js` to the origins
  listed in `partner-callers.js`:

| Site | Read in a hidden frame | Booked in the site's own window |
| --- | --- | --- |
| Guesthouse | `search_rooms`, `quote_stay` | `place_booking` |
| Harbor tours | `find_departures`, `quote_trip` | `reserve_trip` |

A booking runs only in a window of the site itself. The runtime shows the visitor the
request there, with their details, and books only on their confirmation. Every booking
passes the total the visitor saw, and the site refuses it if the price has changed. The
business rules stay in each site's own code; `partner-actions.js` only wraps them.

Browsers partition storage for embedded frames, so a read in a frame may not see
bookings made elsewhere. Reads are advisory; the booking window checks again.

## Run

```shell
node tools/serve_town.mjs
```

Guesthouse at http://127.0.0.1:8080/, harbor tours at http://localhost:8081/. Each site's
own assistant, its links to the other site, and its tests are unchanged from the
examples:

```shell
node --test "apps/town/*/tests/*.test.mjs"
```

## Deploy

Each site is its own Cloudflare Pages project (root `apps/town/guesthouse` or
`apps/town/harbor_tours`, no build command). Add the deployed Concierge's https origin to
each site's `partner-callers.js`, and the sites' https origins to
`apps/concierge/js/partners.js`.
