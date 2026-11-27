# Town Concierge browser check

`chrome/run_concierge_check.mjs` serves the Concierge (http://localhost:8093), the town guesthouse
(http://127.0.0.1:8080), the town tour site (http://localhost:8081) and a scripted model router
(http://127.0.0.1:8791), seeds the fake key `sk-test-not-a-real-key`, fills the contact card, and
plans and books a stay and a trip in Chromium, confirming each booking in the business's own window.

```shell
node tests/concierge/chrome/run_concierge_check.mjs
```

It checks consent before contact, the board, both review steps, both bookings saved on the
businesses' own sites, no key sent to a business, the model never seeing the card, and no page
errors or policy violations. It needs ports 8080, 8081, 8093 and 8791 free.
