# Town Concierge decisions

## 2026-11-16: Partner desks for cross-site bookings
Context: a linked partner network gets no site tools, so it cannot check availability or
book. The spec lists cross-site browser actions as open.
Options: let the partner's network act; a server-to-server API; a second action bridge on
each business (the partner desk).
Decision: a partner desk with reads in a hidden frame and bookings only in the
business's own top-level window, with its own confirmation.
Consequences: two confirmations per booking, and pop-ups must be allowed. The business
keeps control.

## 2026-11-17: Save "booking" before sending, never retry an unknown leg
Context: review found double bookings on a timeout or reload.
Options: retry on timeout; ask the business for status; mark unknown and leave it to the
visitor.
Decision: save "booking" first, reload as "unknown", and never resend. Use the runtime's
longest time limit (300 s), and close the window on an abort.
Consequences: a visitor sometimes has to check with the business by hand.

## 2026-11-17: The contact card never reaches the model
Context: the visitor's name, email and phone are needed for a booking but not for
planning.
Options: pass the card through the model; keep it in the page and hand it straight to
the business's window.
Decision: keep it in the page. `safeOutcome` strips card values from partner text.
Consequences: the assistant cannot answer "what email did I use?". That is intended.

## 2026-11-17: Add `itinerary_checker` and links to the businesses' own assistants
Context: the owner asked for a second agent per network, and real agent-to-agent links.
Options: links only for reads; links for everything; links only for questions the
partners' data does not answer.
Decision: `itinerary_checker` reads the plan. Link tools to both town assistants answer
qualitative questions after a consent card. Prices and bookings stay on the partner
desks.
Consequences: one more consent card per business, per question.

## 2026-11-17: Local addresses on loopback hosts, deployed addresses elsewhere
Context: the sites must work both in local development and when deployed.
Options: a build step per environment; two code copies; pick by hostname.
Decision: `pickOrigin` in `apps/shared/site-origin.js`. Partner desks accept both caller
origins.
Consequences: a locally served town site links to the live sites for peer calls.
