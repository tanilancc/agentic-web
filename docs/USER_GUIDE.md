# User guide

How to use the live sites. Nothing to install: each one is a web page with an AI
assistant that runs in your browser, on an AI key you bring.

| Site | Open | What it is for |
| --- | --- | --- |
| **Beacon** | https://oaw-beacon.pages.dev | Check any agent website, find agent sites, try them |
| **Town Concierge** | https://oaw-concierge.pages.dev | Plan and book a trip across two businesses |
| **Quorum** | https://oaw-quorum.pages.dev | Order food for a group from several vendors |
| Tidewhistle Guesthouse | https://oaw-tidewhistle.pages.dev | A guesthouse with its own assistant |
| Marrow Point Harbor Tours | https://oaw-harbor-tours.pages.dev | Boat trips and walks, with their own assistant |
| Little Oven Pizza, Green Fork, Harbour Bakehouse | https://oaw-little-oven.pages.dev, https://oaw-green-fork.pages.dev, https://oaw-harbour-bakehouse.pages.dev | Food vendors Quorum orders from |

> **This is a demo town.** The businesses, rooms, trips and menus are made up. Bookings and
> orders are real only inside your browser: each site keeps them in its own storage, and
> nothing is charged or sent anywhere else.

---

## 1. Before you start: your AI key

The assistants have no server and no key of their own. You choose the AI provider, and
your messages go from your browser straight to it.

1. Open any of the sites and scroll to the assistant.
2. Open **AI model settings**.
3. Pick a provider. Each one has a link to get a key:

   | Provider | Cost | Get a key |
   | --- | --- | --- |
   | Otari (the default) | Billing may be required | https://otari.ai/dashboard#/keys |
   | Google AI Studio | Free tier | https://aistudio.google.com/apikey |
   | Groq | Free tier | https://console.groq.com/keys |
   | OpenAI | Billing may be required | https://platform.openai.com/api-keys |
   | Anthropic | Billing may be required | https://console.anthropic.com/settings/keys |

4. Paste the key, and pick a model if you want a particular one. Otherwise the site's
   default is used.
5. Save. The settings show that the model is active.

**Where your key goes.** The key stays in your browser: in its local storage, and for
the open tab in that tab's session storage. It is sent only to the provider you chose,
never to the sites or to their partners. Clear it in the same settings panel at any
time.

**Easiest free start:** a Google AI Studio or Groq key.

---

## 2. What you will see on every site

- **Chat**: type a request and press **Send**. While it is working you can add guidance
  with **Update**.
- **Agent network panel**: the agents taking part, live. Turn on **Show the technical
  execution trace** to see every model call, tool call and site-to-site call.
- **Consent cards**: before an assistant contacts another site, a card in the chat
  names the site and shows the exact message. Nothing is sent until you choose
  **Allow**. **Decline** sends nothing.
- **Confirmation dialogs**: anything that cannot be undone, such as a booking or an
  order, shows a dialog with the details first. Bookings with another business are
  also confirmed in **that business's own window**.
- **Clear conversation history** (the chat's clear button): starts the chat over. Your
  plans and bookings on the page stay.

**Allow pop-ups** for Town Concierge and Quorum. Each business opens its own small
window for you to confirm a booking. If your browser blocks it, allow pop-ups for the
site and try again.

---

## 3. Beacon: check and find agent websites

https://oaw-beacon.pages.dev

### Check a site (no key needed)
1. Paste an agent site's network address in the inspector box. For example:
   `https://oaw-tidewhistle.pages.dev/tidewhistle_guesthouse`
2. Press **Inspect**. Beacon reads the site's public files and runs 20 checks against
   the Worldwide Agentic Web spec.
3. The report's **Conformance** tab gives a level (**Conformant**, **Conformant with
   warnings**, or a failing level), and each check's evidence and fix.
4. Share the report with its link. Opening a shared link asks before it contacts the
   site.

### Find a site (no key needed)
The **Directory** lists agent sites with their latest level. Pick one to inspect it.

### Try a site (key needed)
On a report, the **Try it** tab (or **Try this agent**) runs that site's assistant inside
Beacon, after you choose **Run it here**. That site's
assistant answers as a guest and gets none of Beacon's tools or your other data.

### Red-team a site (key needed)
On a report, the **Red team** tab's **Run red team** button sends a few test prompts through the site's agents and reports:
- where your key went;
- whether private data reached the site;
- whether the site's agents steered the caller into an action it should not take.

Before it starts, it shows an estimate of the tokens it will use (about 2,500 per run).

### Ask Beacon
- "Find me an agent site that can book a boat trip."
- "Inspect https://oaw-quorum.pages.dev/quorum_procurement and tell me what fails."
- "What should that site fix first?" (Its report explainer agent answers this.)

---

## 4. Town Concierge: plan and book a trip

https://oaw-concierge.pages.dev

The Concierge works with two independent businesses: **Tidewhistle Guesthouse** (rooms)
and **Marrow Point Harbor Tours** (boat trips and a sea wall walk). Prices and
availability always come live from each business.

**Steps**
1. **Fill in the contact card** (name, email, phone). It stays in your browser. The
   assistant never sees it; it goes only to each business's booking window, where you
   see it before you confirm.
2. **Ask for options**, for example:
   - "What's free at the guesthouse for two people from the 10th to the 12th of next month?"
   - "What boat trips are there on the 11th?"
   - The first time each business is contacted, a consent card asks you.
3. **Build the trip.** "Add the sea view room, arriving in the evening." Then "Add the
   seal trip on the 11th for both of us." Each leg appears under **Your trip** with
   its price.
4. **Check it.** "Does my plan work?" The itinerary checker agent reports clashes, such
   as overlapping trips or a trip outside your stay, and suggests fixes.
5. **Ask the businesses directly.** "Are dogs allowed at the guesthouse?" The Concierge
   asks the guesthouse's own assistant, after a consent card, and passes on its answer
   with a link.
6. **Book.** "Book the whole trip."
   - A **Book this trip?** dialog lists every leg, the total and who it is for.
   - Each business then opens **its own window**. Confirm there.
   - Each leg ends as **booked** (with a reference such as `TW-…` or `HT-…`),
     **refused** (with the reason, for example a changed price), **declined**, or
     **unknown**.

**Good to know**
- An **unknown** leg may have been booked. Check on that business's page. The Concierge
  never books it again by itself.
- To change or cancel a booking, use the business's own site (addresses at the top of
  this guide).
- The Concierge cannot take payments or book restaurants.

---

## 5. Quorum: order food for a group

https://oaw-quorum.pages.dev

Quorum gets binding quotes from three vendors (Little Oven Pizza, Green Fork and
Harbour Bakehouse) and finds the cheapest plan that feeds everyone within your rules.

**Steps**
1. **Set the mandate** in the form:
   - day and number of people;
   - diet groups: vegetarian (not vegan), vegan, gluten-free (not vegetarian). Each
     group is separate people, so count someone with two needs once, in the stricter
     group;
   - budget;
   - the delivery window (from, to) and how many minutes either side are acceptable;
   - whether pickup is fine.
2. **Fill in the contact card.** As in the Concierge, the assistant never sees it.
3. **Ask:** "Find the best plan for our team dinner."
   - Allow each vendor on its consent card.
   - Quorum tries times, pickup or delivery, and one vendor or split orders.
   - It shows the **Best plan** beside the **Best with one vendor**, with the saving.
4. **Explore** with questions such as:
   - "What if we say 45 people and a $900 budget?"
   - "Could pickup make it cheaper?"
   - "Would two bakehouse platters work?" The plan auditor agent checks this with
     Quorum's checker, and a plan the checker rejects is never called acceptable.
5. **Order.** "Place the best plan."
   - A dialog lists every order, the total and who it is for.
   - Each vendor opens **its own window**. Confirm there.
   - Each order ends as ordered (with a reference), not ordered (with the reason),
     declined, or unknown ("check with the vendor").
6. **Next time**, press **Start a new order**. The finished order is kept. The
   assistant cannot start a new order by itself, so it can never order twice by
   mistake.

If no plan fits, Quorum shows the closest plan, what is wrong with it, and each vendor's
reason, such as "needs at least 120 minutes' notice". Relax one rule and ask again.

---

## 6. The town and vendor sites

These also work on their own.

- **Tidewhistle Guesthouse** and **Harbor Tours** have their own assistants. They can
  check availability and book or cancel, and each can ask the other's assistant (for
  example "Is there a boat trip while we stay?").
- **Vendor pages** show their menu, prices, discounts and the orders placed with them.
  They have no assistant: Quorum orders through their partner desks.

Bookings made through the Concierge or Quorum appear on these pages, in the same
browser.

---

## 7. Troubleshooting

| Problem | Fix |
| --- | --- |
| "Connecting the assistant…" never goes away | Reload. If it stays, try another browser; a strict blocker extension can stop the page's scripts. |
| The assistant says the model failed, or "LLM ERROR" | Check the key and the provider in **AI model settings**. Free tiers have rate limits, so wait a minute and retry. |
| Nothing happens after **Book** or **Place** | Allow pop-ups for the site. Each business confirms in its own window. |
| A leg or order shows **unknown** | Check the business's or vendor's page in the same browser. Do not book again until you have. |
| "The contact card is missing…" | Fill in all four fields of the contact card on the page. |
| A consent card was declined by mistake | Ask again; a new card appears. |
| Bookings are gone | They are stored per browser and per site. Another browser, a private window or cleared site data starts empty. |

---

## Privacy in one paragraph

Your key, your contact card and your bookings stay in your browser. Your messages go
only to the AI provider you chose. Another site is contacted only after you allow it on
a card, and it receives only the message shown on that card, never your key, your chat
or your contact details. Bookings and orders are confirmed by you, twice: in the site's
dialog, and in the business's own window.

The full **Privacy and terms** page, which names each AI provider and links to its privacy
policy, is linked at the bottom of every site, for example
https://oaw-concierge.pages.dev/shared/privacy.html.
