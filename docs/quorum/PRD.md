# Quorum PRD

Covers Quorum (`apps/quorum/`) and the three demo vendors it orders from: Little Oven
Pizza, Green Fork and Harbour Bakehouse (`apps/market/`).

## Problem
Ordering food for a group means calling several vendors, matching diets, budget and
timing by hand, and hoping the order adds up. No agent can get binding quotes from
several vendors and prove that a plan meets the group's rules. The spec lists transaction
negotiation as open.

## Target users
- People who order food for a team or event: office managers and organizers.
- Vendors that want to sell to assistants without giving up control of their orders.

Adults. Ordering for a group is an adult activity, and there is no age gate. The market is
a demo: nothing is cooked, delivered or charged.

## Goals / success metric
- **Metric:** for the demo mandate, Quorum finds a plan that feeds every person with one
  suitable serving within budget and time, and that costs less than the best single
  vendor. Today it costs $176.78 against $204.80, a saving of $28.02 (14%).
- A plan the checker rejects is never called acceptable or ordered.

## Non-goals
- Payments, accounts, delivery tracking, or changing or cancelling orders.
- Vendors other than the three listed.
- Letting the model decide whether a plan fits: only the checker decides.

## Slices
1. Vendor sites with menus, pricing rules and partner desks. Status: done.
2. Mandate form and the checker: diet groups as separate people, menu-based serving
   counts and an assignment check. Status: done.
3. Search: quotes across times, pickup or delivery, and split orders. The best plan is
   shown against the best single vendor. Status: done.
4. Award: orders confirmed in each vendor's own window, with honest outcomes and no
   double sends. Status: done.
5. Second agent `plan_auditor`. Status: done.
6. Deployment of Quorum and the three vendors to `pages.dev`. Status: done.

## Open questions
- The operator and contact details for the Privacy and terms page (to be added by the
  owner).
- Should Quorum let vendors counter-offer, rather than only quote?
