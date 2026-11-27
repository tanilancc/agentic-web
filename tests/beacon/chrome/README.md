# Beacon browser checks

Run from the repository root. Each starts its own local servers and uses the Chromium that
Playwright provides. Neither needs a model key.

## Main check

`node tests/beacon/chrome/run_beacon_check.mjs` inspects a site, follows a shared report
link, runs Try it and a red-team run against the guesthouse example with a scripted model
and a fake key, and checks that no key reached the guesthouse.

## Layout check

`node tests/beacon/chrome/run_layout_check.mjs` loads Beacon, the two town sites and the
three vendors on a throttled phone, a small phone and a desktop. It fails if a page's layout
shift reaches 0.1 while the parts drawn by script fill in.
