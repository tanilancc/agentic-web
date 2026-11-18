# The market: food vendors for Quorum

Three small demo food vendors. Each is a static site with a menu page that lists the
orders it has received, and a partner desk (`partner-desk/`) that Quorum uses:

| Vendor | What makes it different |
| --- | --- |
| Little Oven Pizza (`little_oven`) | Cheapest per serving, strong volume discounts, no gluten-free |
| Green Fork (`green_fork`) | Vegan and gluten-free bowls, dearer, 20% off from 14:30 to 17:00 |
| Harbour Bakehouse (`harbour_bakehouse`) | Platters for groups, 12% off for pickup, high minimum order, long notice |

All three run the same code (`apps/shared/vendor-pricing.js`, `vendor-desk.js` and
`vendor-page.js`, copied in by `tools/sync_runtime.mjs`) on their own `catalog.js`. A
vendor's `request_quote` is the only authority on its prices: Quorum never computes a
price itself.

| Action | Effect | Where it runs |
| --- | --- | --- |
| `get_catalog` | read | a hidden frame on the calling site |
| `request_quote` | read | a hidden frame on the calling site |
| `place_order` | irreversible | only a window of the vendor's own site, after the visitor confirms there |

`place_order` prices the order again and refuses it if the total is not the one the
visitor saw. Orders are kept in the vendor's own browser storage; nothing is cooked or
charged.

Pricing rules, in order: each item's price times its quantity; the largest volume tier;
the off-peak discount; the pickup discount, each on the running total; then the minimum
order; then the delivery fee unless the discounted total is over the free-delivery line.

## Run

```shell
node tools/serve_town.mjs
```

Little Oven http://127.0.0.1:8095/, Green Fork http://127.0.0.1:8096/, Harbour Bakehouse
http://127.0.0.1:8097/.

## Deploy

Each vendor is its own Cloudflare Pages project (root `apps/market/<vendor>`, no build
command). Add the deployed Quorum's https origin to each `partner-callers.js`, and the
vendors' https origins to `apps/quorum/js/vendors.js`.
