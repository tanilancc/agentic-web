# Quorum browser check

`chrome/run_quorum_check.mjs` serves Quorum (http://localhost:8094), the three market vendors
(http://127.0.0.1:8095 to 8097) and a scripted model router (http://127.0.0.1:8791), seeds the fake
key `sk-test-not-a-real-key`, fills the contact card, finds the best plan and places it in Chromium,
confirming each order in the vendor's own window.

```shell
node tests/quorum/chrome/run_quorum_check.mjs
```

It checks consent before contact (by time, against each vendor's request log), the plan view, both
review steps, each vendor's own page listing its order, no key sent to a vendor, the model never
seeing the card, and no page errors or policy violations. It needs ports 8094 to 8097 and 8791 free.
