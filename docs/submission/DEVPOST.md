# Beacon, Town Concierge and Quorum

**Three open agentic websites that find, check and work with each other by URL.**

- Beacon: https://oaw-beacon.pages.dev
- Town Concierge: https://oaw-concierge.pages.dev
- Quorum: https://oaw-quorum.pages.dev
- Source: https://github.com/tanilancc/agentic-web
- User guide: [`docs/USER_GUIDE.md`](../USER_GUIDE.md)

Bring your own AI key. A free Groq or Google AI Studio key works; paste it in **AI model
settings** on any site.

---

## Inspiration

The challenge asks for the first publicly accessible, *interconnected* agentic websites.
Looking at the starter examples and the spec, three gaps stood out:

1. **Nobody can tell whether an agent site is safe to load, or whether it follows the
   spec.** The repository's own README has a "Testing" section that says *TODO: run the
   validation script*. The spec lists conformance tests, a registry and search as open
   problems, and says a peer's instructions are untrusted.
2. **A linked partner's agent can describe its site, but it cannot check live
   availability or book.** Linking stops at conversation.
3. **No agent can get binding quotes from several sellers and prove that a deal meets
   the buyer's rules.** The spec lists negotiation as open.

We built one product for each gap.

## What it does

### Beacon: the validator and directory the agentic web is missing
- **Inspect any agent site** by its network address. Beacon runs 20 checks against the
  Worldwide Agentic Web spec, from your browser, without a key. It reports a level
  (Conformant, Conformant with warnings, or failing) with evidence and a fix for each
  check.
- **Red-team its agents.** A canary caller loads the site's agents as a peer. It reports
  where your key went, what private context reached the site, and whether its agents
  steered the caller into a honeypot action. A finding shows "Passed" only if the site's
  agents actually ran.
- **A directory** of agent sites, re-checked daily by GitHub Actions, with a badge for
  each site.
- **Try it:** run any listed site's agents inside Beacon's own shell, as a peer.
- **Ask Beacon:** a two-agent assistant. `beacon_guide` searches and inspects;
  `report_explainer` explains a report and what to fix first.

### Town Concierge: cross-site booking with every business in control
Plan a weekend in a (fictional) harbor town across two independent businesses: a
guesthouse and a boat-tour company. Each is its own agentic website.
- **Live data from each business.** The Concierge reads availability and prices from
  each business's own site, after you allow each business on a consent card.
- **Agent to agent.** Ask "Are dogs allowed at the guesthouse?" and the Concierge asks the
  guesthouse's own assistant, by URL, after a consent card. The guesthouse's network
  answers from rules quoted from its own policies page.
- **Bookings stay with the business.** Each business publishes a *partner desk*: reads
  run in a hidden frame; bookings run only in the business's own window, where you
  confirm. Every booking carries the total you saw, and the business refuses a mismatch.
- **Your details never reach the model.** The contact card goes only to each business's
  window, on your screen.
- `itinerary_checker`, a second agent, finds clashes, such as a trip outside your stay.

### Quorum: group food ordering with a checker the AI cannot overrule
Give a headcount, diets, a budget and a delivery window. Quorum:
- asks three vendors for **binding quotes** across delivery times, pickup or delivery, and
  one vendor or split orders;
- picks the cheapest plan that **a code checker** confirms feeds everyone. The checker
  counts servings from each vendor's menu, and a max-flow assignment checks that every
  person gets one suitable serving;
- shows the best plan beside the best single-vendor plan. In the demo market a split
  order saves **$28.02 (14%)**: $176.78 instead of $204.80;
- `plan_auditor` audits any plan you make up, with the same checker, and can never call a
  plan acceptable that the checker rejects.

You confirm the orders in Quorum, and then each vendor confirms its own order in its own
window.

## How we built it

- **Static sites, no server.** Each of the 8 sites (the three products, two town
  businesses and three vendors) is plain HTML and JavaScript modules on Cloudflare Pages.
- **Agent networks in the browser.** Each assistant is a Neuro SAN-style network
  (HOCON → `.network.json`) run by the nsdeploy browser runtime on the visitor's own key.
  Every network has at least two agents.
- **Linking by URL.** A site lists a partner's network URL as a tool. The runtime asks
  the visitor first, then loads the partner's public manifest and network and runs them
  as a peer.
- **Facts come from code, never the model.** Prices, availability, conformance levels
  and plan checks are computed in JavaScript and returned as tool results.
- **Tests.** There are 667 Node tests, which need no key. Browser checks drive the sites
  across separate origins with a scripted model and a fake key, and confirm that no
  partner ever receives the key. A live check then drove all three products with a real
  model.
- **Launch audit.** We ran a launch checklist covering security, privacy, accessibility
  and quality, and fixed every finding. Every page:
  - allows only its own scripts and refuses to be framed;
  - meets WCAG AA contrast;
  - scores 100 on Lighthouse SEO and best practices.

  There is a Privacy and terms page written from each project's data inventory, and a
  PRD, technical design, security document and decision log for each project.

## Challenges we ran into

- **A foreign manifest is an attack surface.** Booting another site's manifest as your
  own page's network lets it inject markup and choose where your key goes. Beacon
  never does: it runs its own shell network and binds the inspected site as a peer.
- **No double bookings, even on a timeout.** An order is saved as "booking" before it is
  sent, and a reload turns it into "unknown". Unknown orders are never sent again.
- **Real models behave differently from scripted ones.** Testing on a real model's free
  tier found that:
  - turns hit the provider's rate limit (8,000 tokens a minute), so the runtime now
    waits out rate limits;
  - the Concierge didn't use the partner assistants until its rules named them;
  - a partner's assistant, run without its own site's tools, couldn't read its own
    policies;
  - Quorum's lead agent once judged a plan itself instead of asking the checker.

  We fixed each one, with a test, and re-ran it on the real model.

## Accomplishments that we're proud of

- A visitor's question travels **three agents across two websites**. The Concierge asks
  the guesthouse's assistant, which asks its own rules agent, and the answer is correct.
- **Every agent site we built rates Conformant** in Beacon, our own validator.
- **The model never decides anything that matters.** Code computes prices, checks and
  levels, and confirmations happen on the business's own site.

## What we learned

- Consent cards and partner desks make cross-site agents practical without a server. The
  business keeps the final say.
- Instructions are an interface: naming a tool in a rule changes whether a real model
  uses it.
- Free model tiers are part of the user experience. Waiting out rate limits matters as
  much as the prompt.

## What's next

- A Beacon conformance badge any agent site can embed, and listing through a web form
  rather than a pull request.
- Partner desks proposed to the spec as a standard for cross-site actions.
- Counter-offers from vendors in Quorum, not only fixed quotes.

## Built with

JavaScript, HTML, CSS · Neuro SAN-style HOCON agent networks · nsdeploy browser runtime ·
Cloudflare Pages · GitHub Actions · Playwright · Node test runner · Groq, Otari, Google
AI Studio, OpenAI and Anthropic as visitor-chosen providers
