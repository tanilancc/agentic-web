# Quorum decisions

## 2026-11-16: Group ordering across several vendors, with a code checker
Context: the spec lists negotiation and policy-bound purchasing as open, and the
repository's pizza example hints at "order 10 pizzas for 6pm".
Options: a single-vendor shop; a model that judges plans; quotes from several vendors with
a code checker.
Decision: binding quotes from three vendors, and `checkPlan` as the only judge of a plan.
Consequences: the model can explain and propose, but can never approve a plan.

## 2026-11-17: Diet groups are separate people, checked with an assignment
Context: review found the first checker counted diets twice, so a plan could pass while
someone had nothing to eat.
Options: count servings per diet tag; separate groups with an assignment check.
Decision: vegetarian means not vegan, and gluten-free means not vegetarian or vegan.
Someone with two needs is counted once, in the stricter group. A max-flow assignment
proves each person gets one suitable serving.
Consequences: the form asks for stricter-group counts, and the page explains this. The
demo saving changed to $28.02 (14%).

## 2026-11-17: Count servings from the menus, not from vendor claims
Context: a vendor's quote could claim more servings than its items hold.
Options: trust the quote; recount from the catalog.
Decision: validate catalogs, and count from the menu items in the quote.
Consequences: a vendor's quote cannot change what the plan feeds.

## 2026-11-17: Only the visitor starts a new order
Context: a finished award blocked later orders, and letting the model reset it could cause
a second order.
Options: the model resets; the visitor resets with a page button.
Decision: a "Start a new order" button. The finished award moves to the history.
Consequences: an extra click for repeat orders.

## 2026-11-17: Add a `plan_auditor` agent
Context: the owner asked for a second agent in each network, and checking a composed plan
is a separate job.
Options: the front agent calls the checker; a specialist explains the checker's result.
Decision: `plan_auditor` uses `website_get_mandate` and `website_check_plan`, and may not
override the checker.
Consequences: one more model call for a "what if this plan?" question.

## 2026-11-26: Every "would this order work?" question goes to the plan auditor
Context: in real-model testing, asked whether a one-vendor order would work, the lead agent
took a quote and judged the plan itself, because a rule sent one-vendor "what if" questions
to website_request_quote.
Options: tighten the checker's wording; route all such questions to plan_auditor.
Decision: any question whether an order or plan works goes to plan_auditor, which runs
the checker. A quote is for a price only. A test forbids the old wording.
Consequences: one more model call for these questions. Only the checker judges plans.
