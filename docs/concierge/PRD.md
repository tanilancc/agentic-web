# Town Concierge PRD

Covers the Town Concierge (`apps/concierge/`) and the two town sites it works with:
Tidewhistle Guesthouse and Marrow Point Harbor Tours (`apps/town/`).

## Problem
A visitor planning a short trip has to visit each local business's site separately, and
an assistant on one site can describe a partner but cannot check the partner's live
availability or book with it. The spec lists cross-site browser actions as an open
problem.

## Target users
- Visitors planning a short trip to (fictional) Marrow Point.
- Small businesses that want an assistant on another site to book with them, without
  giving up control of their bookings.

Adults. Booking a stay is an adult activity, and there is no age gate. The town is a demo:
nothing is really booked or charged, and visitors are told to use made-up details.

## Goals / success metric
- **Metric:** a visitor can plan a stay and a trip and book both, each confirmed in the
  business's own window, with every name, time and price coming from the business's own
  quote. This is checked end to end by the browser check, which shows the booking
  references on each business's page.
- No partner receives the visitor's key, and the model never sees the contact card.

## Non-goals
- Payments, accounts or email confirmations.
- Changing or cancelling a booking from the Concierge: the visitor does that on the
  business's own site.
- Businesses other than the two listed partners, and restaurants.

## Slices
1. Partner desks on the town sites: reads in a hidden frame, bookings only in the
   business's own window. Status: done.
2. Concierge planning: search partners, plan legs, conflicts on the trip board. Status:
   done.
3. Booking the whole trip, with honest outcomes (booked, refused, declined, unknown) and
   no double sends. Status: done.
4. Second agent `itinerary_checker`. Status: done.
5. Agent-to-agent links to both businesses' own assistants, behind consent cards. Status:
   done.
6. Deployment of the Concierge and both town sites to `pages.dev`. Status: done.

## Open questions
- The operator and contact details for the Privacy and terms page (to be added by the
  owner).
- Would a real business accept bookings this way? The partner desk is a proposal for the
  spec, not an agreed standard.
