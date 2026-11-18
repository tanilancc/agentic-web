# Beacon PRD

## Problem
People and agent sites have no way to tell whether an open agentic website is safe to load
as a peer, or whether it follows the Worldwide Agentic Web spec. The spec lists conformance
tests, a registry and search as open problems. Site builders also have no checklist that
tells them what to fix.

## Target users
- Builders of agentic websites who want to check their own site before they publish it.
- People and calling sites deciding whether to trust and link to an agent site.
- Hackathon judges comparing entries.

Adults. Nothing is aimed at children and there are no accounts. There is no age gate: the
inspector and directory work without a key or any personal data. Anyone under 13 (US) or
16 (EU) needs a key from an AI provider to use the AI parts, which most providers allow
only to adults.

## Goals / success metric
- **Metric:** every site in Beacon's directory gets a level from fixed checks that a
  builder can reproduce from the command line (`tools/beacon_check.mjs`) and in the
  browser, with the same result.
- Today: the five deployed agent sites rate **Conformant** live.

## Non-goals
- Ranking sites, or calling a site safe or trustworthy. A level is the result of fixed
  checks on public files.
- Testing a site's own page tools: Beacon runs a site's agents only as a peer.
- A server, accounts or a hosted index. Listing is a pull request to
  `apps/beacon/index/sites.json`.

## Slices
1. Inspector: 20 checks on a site's public files, with a level, evidence and fixes. No
   key. Status: done.
2. Directory: a searchable list with levels, re-checked daily by GitHub Actions, with
   badges. Status: done.
3. Try it: run a site's agents behind Beacon's own shell network, after consent. Status:
   done.
4. Red team: a canary caller loads the site's agents and reports where the key went,
   private-context leaks and steering into a honeypot action. Status: done.
5. Ask Beacon: an assistant with two agents (`beacon_guide`, `report_explainer`).
   Status: done.
6. Deployment to https://oaw-beacon.pages.dev. Status: done.

## Open questions
- Who runs Beacon, and the contact for listing disputes. The owner will add these to the
  Privacy and terms page.
- Should the directory accept sites outside this hackathon, and who reviews the pull
  requests?
- A red-team result depends on the visitor's model. Should Beacon publish reference runs
  for named models?
