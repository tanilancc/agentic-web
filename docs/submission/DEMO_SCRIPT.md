# Demo video script (about 3 minutes)

Record in a desktop browser at 1440 × 900 or larger. Before you start:
- paste a key in **AI model settings** on the Concierge, Quorum and Beacon. A Groq key
  works; with Groq's free tier, pause the recording while a turn waits for its rate limit;
- allow pop-ups for `oaw-concierge.pages.dev` and `oaw-quorum.pages.dev`;
- fill the contact cards with made-up details.

Screenshots of each shot are in [`screenshots/`](screenshots/).

| Time | Show | Say |
| --- | --- | --- |
| 0:00–0:15 | The three home pages, one after another | "Three open agentic websites. Each runs its agents in your browser, on your own key, and links to other agent sites by URL." |
| **Beacon** | | |
| 0:15–0:40 | Beacon. Paste `https://oaw-concierge.pages.dev/marrow_point_concierge`, press **Inspect** (shot 01) | "The challenge README still has a TODO where a validation script should be. Beacon is that validator: 20 checks against the spec, no key needed. The Concierge is Conformant." |
| 0:40–0:55 | Scroll the report; show the directory with its levels | "Every check has evidence and a fix. The directory is re-checked every day." |
| 0:55–1:05 | Open the **Red team** tab | "Red team loads a site's agents as a peer and reports where your key went, and whether its agents tried to steer you." |
| **Town Concierge** | | |
| 1:05–1:25 | Concierge. Ask: *"What rooms are free at the guesthouse for two adults from 10 to 12 December 2026?"* Show the consent card (shot 02), press **Allow** | "The guesthouse is a separate website. Nothing is sent to it until I allow it. The rooms and prices come live from the guesthouse." |
| 1:25–1:45 | *"Add the cheapest of those rooms, arriving in the evening."* Then *"Add the 10:00 Seal Rocks Cruise on 11 December for both of us. Does the plan work?"* Show the trip board (shot 03) | "A second agent checks the itinerary for clashes." |
| 1:45–2:05 | *"Are dogs allowed at the guesthouse?"* Show the card naming the guesthouse (shot 04), **Allow**, show the answer (shot 05) | "Now the Concierge asks the guesthouse's own assistant, agent to agent. Dogs are welcome in the Garden Room." |
| 2:05–2:30 | *"Book the whole trip."* Show the review dialog (shot 06), then a business's own window (shot 07), confirm both, show the references (shot 08) | "I confirm here, then each business confirms in its own window. The AI never sees my contact details, and it can't book twice." |
| **Quorum** | | |
| 2:30–2:50 | Quorum. Show the mandate. Ask: *"Find the best plan for our team dinner."* Show the plans (shot 09) | "Binding quotes from three vendors. A code checker, not the AI, confirms that every person gets a suitable meal. Splitting the order saves 14%." |
| 2:50–3:00 | Back to Beacon's directory, every site Conformant | "Open, linked by URL, and checked against the spec. This is the agentic web, today." |

**If a turn fails on screen,** say so and run it again. The sites retry rate limits by
themselves. A visible wait ("Waiting N s for your AI provider's rate limit…") is fine to
leave in.
