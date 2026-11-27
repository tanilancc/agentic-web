# Beacon browser check

`chrome/run_beacon_check.mjs` runs Beacon in Chromium with three origins:

| Origin | What |
| --- | --- |
| `http://localhost:8090` | Beacon (`apps/beacon`) |
| `http://127.0.0.1:8080` | the guesthouse example (`examples/guesthouse_agentified`) |
| `http://127.0.0.1:8791` | a scripted model router (`apps/beacon/tests/script_router.mjs`) |

It seeds the fake key `sk-test-not-a-real-key` in Beacon's tab, so no model is called.
Each site's server logs every request, so the check can see what reached the guesthouse
and whether it carried an `Authorization` header.

```shell
node tests/beacon/chrome/run_beacon_check.mjs
```

| Check | Passes when |
| --- | --- |
| 1 | inspecting the guesthouse shows a level and all five check groups |
| 2 | `act.bridge-loads` passes in a real frame |
| 3 | opening a `?site=` link sends nothing to the guesthouse until **Inspect** is pressed |
| 4 | **Try it** mounts Beacon's shell network, with the guesthouse bound as a peer, after **Run it here** |
| 5 | a full red-team run finishes with seven findings, the guesthouse gets no request with an `Authorization` header, and every model call carries the key to the router |

It also fails on any page error or Content-Security-Policy violation. It needs ports 8080, 8090 and 8791 free, and uses the
pre-installed Playwright.
