# Beacon browser checks

Run from the repository root. Each starts its own local servers and uses the Chromium that
Playwright provides. Neither needs a model key.

## Main check

`node tests/beacon/chrome/run_beacon_check.mjs` inspects a site, follows a shared report
link, runs Try it and a red-team run against the guesthouse example with a scripted model
and a fake key, and checks that no key reached the guesthouse.

## Layout check

`node tests/beacon/chrome/run_layout_check.mjs` loads Beacon on a throttled phone, a small
phone and a desktop, and fails if the page's layout shift reaches 0.1 while the report and
directory fill in.
