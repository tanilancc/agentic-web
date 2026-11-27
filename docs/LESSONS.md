# What a real model taught us about multi-agent websites

We built three open agentic websites for The Open Agentic Web Challenge:
- **Beacon**, a validator and directory for agent sites;
- **Town Concierge**, which plans and books a trip across two independent businesses' sites;
- **Quorum**, which orders food for a group from three vendors.

Every site runs its agent networks in the visitor's browser, on the visitor's own key, and
links to other agent sites by URL.

Before any real model touched them, more than 600 automated tests passed. They used a
**scripted** model that always calls the right tool. Then we drove the live sites with a
real one (Groq's free tier, `gpt-oss-120b`), as a visitor would. It found nine problems in
an afternoon. Each lesson below is one of them, with the fix.

---

## 1. Scripted tests prove the plumbing, not the behaviour

The scripted model proved that tools, consent cards, cross-site windows and key handling
all work. It could not show that a real model would *choose* those tools. Every problem
below got past hundreds of passing tests.

**Takeaway:** keep the scripted tests; they make the plumbing safe to change. Add a
real-model check (ours is `tests/live/run_live_model_check.mjs`). Run it before every
demo, not once.

## 2. Free tiers are part of your user experience

Groq's free tier allows 8,000 tokens a minute. One model call here uses about 2,400
tokens, and a turn in which one agent asks another takes four or more calls. **One
visitor message could exceed the budget on its own.**

The runtime stopped at the first `429` and showed the visitor the provider's raw JSON,
which included the account's **organization ID**.

**Fix:** when a provider says "try again in 8.2 s", wait that long and retry, up to
twice. Show "Waiting N s for your AI provider's rate limit…". If the wait is too long,
give a plain sentence, never the provider's text.

**Takeaway:** test on the cheapest tier your users will use. Treat provider errors as
untrusted text: they can hold account details.

## 3. A tool the model is not told about does not exist

The Concierge could ask each business's own assistant by URL. Its rule said: "ask that
business's own assistant". Asked "Are dogs allowed at the guesthouse?", the model said it
didn't know. It never connected the question to a tool described only as "Hand off to the
Tidewhistle Guesthouse network".

**Fix:** name the tools in the rule. It now says to call `tidewhistle_guesthouse` or
`marrow_point_harbor_tours`, that business's own assistant, *before saying you do not
know*. A test keeps those names in step with the runtime's tool names.

**Takeaway:** instructions are an interface. Refer to tools by their exact names.

## 4. An agent called from elsewhere is not the agent on its own site

Once the Concierge did ask, the guesthouse's assistant also said "I'm not sure". When
another site calls it, its network runs as a peer, **without its own site's tools**, so
it could not read its own policies page.

**Fix:** a small rules agent per business (`house_rules`, `tour_rules`) that holds the key
facts. Each fact is **quoted word for word** from the business's policies page. A test
fails if any sentence isn't on the page, so the agent can't drift from what the business
publishes. Now one question travels through three agents on two websites, and comes back
right: "dogs are welcome in the Garden Room, up to two per stay".

**Takeaway:** design for the context an agent has *when it is called*, not the one it has
at home. Facts copied into a prompt need a test that ties them to their source.

## 5. A helpful-sounding rule can route around a guarantee

Quorum's promise is that only a code checker decides whether a plan feeds everyone. A
rule also said "for a *what if* about one vendor, request a quote". Asked "Would one
Harbour Bakehouse order work?", the model took a quote and **judged the plan itself**.
Its conclusion was right, but its reasoning table was its own.

**Fix:** any "would this work?" question goes to `plan_auditor`, which runs the checker.
A quote is for a price only. A test **forbids the old wording**, so it can't creep back.

**Takeaway:** when the model must not decide something, look for every rule that gives it
another path to that decision.

## 6. Put invariants in code, not in prompts

After a turn failed on the rate limit, the model planned the same guesthouse stay again.
The confirmation listed the room twice: **$709 instead of $394**. The guesthouse refused
the second booking, because the room was already booked. Nothing was charged, but a
visitor should never see that.

**Fix:** the planning tool now refuses an identical leg (same business, item and times)
unless the earlier one was refused or declined. It tells the model why.

**Takeaway:** "never do X" belongs in the tool, where a confused model or a retried turn
can't get around it. The earlier code-level guards caught what the prompt couldn't:
- each booking carries the total the visitor saw;
- a booking is saved as "booking" before it is sent;
- each business confirms in its own window.

## 7. Grounding means "only what the tool said", including what you *imply*

Asked to inspect the guesthouse, Beacon reported "Conformant" correctly. Then it added:
"You can proceed to use it for booking a boat trip." The guesthouse runs no boat trips.

**Fix:** a grounding rule says an inspection reports checks only. What a site does comes
only from directory search results.

**Takeaway:** check helpful closing sentences as carefully as the facts.

## 8. Ambiguity belongs to the user, and that's correct behaviour

"Add the cheapest room, arriving in the evening" made the model ask which arrival window,
because the guesthouse offers three evening windows. It wasn't a bug: the rules told it to
ask. Our *test script* was the vague part.

**Takeaway:** before you "fix" a model, check whether it did what you told it to.

## 9. Meet models where they are

- Models write `<br>` inside Markdown table cells. The chat now renders a bare `<br>` as a
  line break, and still shows every other tag as text.
- The model wrote one subtotal as "13 199 ¢". Tools use cents, so the rule now says to
  show money to the visitor in dollars.

**Takeaway:** handle the model's harmless habits in the renderer, and state units
explicitly.

---

## A checklist for your next multi-agent site

- [ ] Run real-model scenarios on the cheapest tier you support, before each demo.
- [ ] Retry rate limits with the provider's own wait, and never show raw provider errors.
- [ ] Name every tool in the rule that should trigger it.
- [ ] Test each agent in the context it has when *another* agent calls it.
- [ ] Quote facts from their source, and test that they still match it.
- [ ] Find every rule path to a decision the model must not make.
- [ ] Enforce invariants (no duplicates, price checks, confirmations) in code.
- [ ] Check closing lines for claims no tool returned.
- [ ] Keep a test for each fix, including tests that forbid wording that misled a model.

The live sites:
- https://oaw-beacon.pages.dev
- https://oaw-concierge.pages.dev
- https://oaw-quorum.pages.dev
