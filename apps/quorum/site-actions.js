// Registers Quorum's operations with the agent runtime. The names in agent-manifest.json
// "actions.agentTools" become model tools, called website_<name>.
//
// Prices come only from vendors' quotes; whether a plan is acceptable comes only from
// checkPlan. The visitor's contact card never appears in a tool result: place_award
// reads it at ordering time and sends it only to each vendor's own window.

import { checkPlan, validateMandate } from "./js/mandate.js";
import { searchPlans, validateCatalog } from "./js/search.js";
import { VENDORS } from "./js/vendors.js";
import { safeOutcome } from "./shared/partner-desk.js";

const VENDOR_IDS = VENDORS.map((vendor) => vendor.id);
const CARD_FIELDS = { firstName: "first name", lastName: "last name", email: "email", phone: "phone" };
const MANDATE_FIELDS = {
  date: { type: "string", format: "date", description: "The day, YYYY-MM-DD." },
  headcount: { type: "integer", minimum: 0, maximum: 500, description: "People to feed." },
  vegetarian: { type: "integer", minimum: 0, maximum: 500, description: "Vegetarians who are not vegan. Diet groups are separate people." },
  vegan: { type: "integer", minimum: 0, maximum: 500, description: "Vegans." },
  glutenFree: { type: "integer", minimum: 0, maximum: 500, description: "People who need gluten-free food and are not vegetarian or vegan." },
  budgetCents: { type: "integer", minimum: 0, maximum: 100000000, description: "The most to spend, in cents: $500.00 is 50000." },
  from: { type: "string", maxLength: 5, description: "Start of the delivery window, HH:MM." },
  to: { type: "string", maxLength: 5, description: "End of the delivery window, HH:MM." },
  flexMinutes: { type: "integer", minimum: 0, maximum: 180, description: "How many minutes either side of the window are fine." },
  pickupAllowed: { type: "boolean", description: "Whether someone can collect an order." },
};

/**
 * Quorum's actions.
 */
export class QuorumActions {
  /**
   * What the actions work on: {desk, getMandate, setMandate, getSearch, setSearch, award,
   * card, save}. Tests set it; in the browser it comes from js/app.js (window.quorum).
   */
  static context = null;

  static page() {
    const context = QuorumActions.context || globalThis.quorum?.actionContext?.();
    if (!context) {
      throw new Error("The page is still starting.");
    }
    return context;
  }

  static parse(text) {
    try {
      return JSON.parse(text);
    } catch {
      return undefined;
    }
  }

  /**
   * A plan as the model sees it.
   */
  static summary(plan, index) {
    if (!plan) {
      return null;
    }
    return {
      plan: index,
      ok: plan.check.ok,
      totalCents: plan.check.totalCents,
      problems: plan.check.problems,
      orders: plan.orders.map((order) => ({
        vendor: order.vendor, time: order.time, fulfilment: order.fulfilment, items: order.items,
        totalCents: order.quote.totalCents, discounts: order.quote.discounts,
      })),
    };
  }

  static registerActions(actions) {
    const argsField = { type: "string", minLength: 2, maxLength: 2000, description: "JSON, as described." };
    actions.register({
      name: "get_mandate",
      description: "The visitor's mandate: day, headcount, dietary counts, budget in cents, delivery window and flexibility, and whether pickup is allowed, with anything wrong with it.",
      effect: "read",
      inputSchema: { type: "object", additionalProperties: false, properties: {} },
      execute: QuorumActions.getMandate,
    });
    actions.register({
      name: "set_mandate",
      description: "Change some fields of the mandate. Only the fields given change. Refused, changing nothing, when the result makes no sense; the problems say which field and why.",
      effect: "write",
      inputSchema: { type: "object", additionalProperties: false, properties: MANDATE_FIELDS },
      execute: QuorumActions.setMandate,
    });
    actions.register({
      name: "list_vendors",
      description: "Each vendor's menu (item ids, names, prices in cents, servings, diets) and ordering rules. The visitor is asked before each vendor is first contacted.",
      effect: "read",
      inputSchema: { type: "object", additionalProperties: false, properties: {} },
      execute: QuorumActions.listVendors,
    });
    actions.register({
      name: "request_quote",
      description: "Ask one vendor for a binding quote: argsJson is {date, time, fulfilment, items:[{id, qty}]}. Returns the vendor's own answer.",
      effect: "read",
      inputSchema: { type: "object", additionalProperties: false, required: ["vendor", "argsJson"], properties: { vendor: { type: "string", enum: VENDOR_IDS }, argsJson: argsField } },
      execute: QuorumActions.requestQuote,
    });
    actions.register({
      name: "find_best_plan",
      description: "Search every vendor's quotes for the mandate, across times, delivery or pickup, and one-vendor or split orders, and show the result on the page. Returns the best plan that meets the mandate, the cheapest single-vendor plan, two alternatives, or the closest plan and why it fails. Each plan has a number for place_award.",
      effect: "write",
      // A vendor that stops answering costs one 15 s wait, then is skipped.
      timeoutMs: 300000,
      inputSchema: { type: "object", additionalProperties: false, properties: {} },
      execute: QuorumActions.findBestPlan,
    });
    actions.register({
      name: "check_plan",
      description: "Check a plan you composed: ordersJson is [{vendor, time, fulfilment, items:[{id, qty}]}]. Each order is quoted again by its vendor, then the plan is checked against the mandate.",
      effect: "read",
      inputSchema: { type: "object", additionalProperties: false, required: ["ordersJson"], properties: { ordersJson: argsField } },
      execute: QuorumActions.checkPlan,
    });
    actions.register({
      name: "place_award",
      description: "Place every order of a plan from find_best_plan, each in its vendor's own window, with the visitor's contact card. Only a plan that meets the mandate can be placed. Returns each order's result: booked with a code, refused, declined or unknown. Never retries.",
      effect: "irreversible",
      // The runtime's longest limit. An order still waiting then becomes unknown, and
      // the rest stay planned.
      timeoutMs: 300000,
      inputSchema: { type: "object", additionalProperties: false, required: ["plan"], properties: { plan: { type: "integer", minimum: 0, maximum: 500, description: "A plan number from find_best_plan." } } },
      execute: QuorumActions.placeAward,
    });
  }

  static getMandate() {
    const mandate = QuorumActions.page().getMandate();
    return { mandate, problems: validateMandate(mandate) };
  }

  static setMandate(args) {
    const { getMandate, setMandate, save } = QuorumActions.page();
    const next = { ...getMandate(), ...args };
    const problems = validateMandate(next);
    if (problems.length) {
      return { ok: false, problems };
    }
    setMandate(next);
    // Plans found for the old rules are no longer worth anything.
    QuorumActions.page().setSearch(null);
    save();
    return { ok: true, mandate: next };
  }

  static async listVendors() {
    const { desk } = QuorumActions.page();
    const vendors = [];
    for (const vendor of VENDORS) {
      const catalog = await desk.read(vendor.id, "get_catalog", {});
      if (!catalog || catalog.ok === false || !Array.isArray(catalog.items)) {
        vendors.push({ id: vendor.id, label: vendor.label, unavailable: String(catalog?.reason || "No menu.") });
        continue;
      }
      const { items, hours, slotMinutes, minOrderCents, delivery, pickup, tiers, offPeak } = catalog;
      vendors.push({ id: vendor.id, label: vendor.label, items, hours, slotMinutes, minOrderCents, delivery, pickup, tiers, offPeak });
    }
    return { vendors };
  }

  static async requestQuote(args) {
    const parsed = QuorumActions.parse(args.argsJson);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, reason: "argsJson must be a JSON object." };
    }
    return QuorumActions.page().desk.read(args.vendor, "request_quote", parsed);
  }

  static async findBestPlan() {
    const { desk, getMandate, setSearch, save } = QuorumActions.page();
    const mandate = getMandate();
    const problems = validateMandate(mandate);
    if (problems.length) {
      return { ok: false, reason: "Fix the mandate first.", problems };
    }
    const search = await searchPlans({
      vendors: VENDOR_IDS,
      mandate,
      getCatalog: (id) => desk.read(id, "get_catalog", {}),
      quote: (id, args) => desk.read(id, "request_quote", args),
    });
    setSearch(search);
    save();
    const index = (plan) => search.plans.indexOf(plan);
    const alternatives = search.plans.filter((plan) => plan.check.ok && plan !== search.best && plan !== search.baseline).slice(0, 2);
    return {
      best: QuorumActions.summary(search.best, index(search.best)),
      baseline: QuorumActions.summary(search.baseline, index(search.baseline)),
      alternatives: alternatives.map((plan) => QuorumActions.summary(plan, index(plan))),
      closest: QuorumActions.summary(search.closest, index(search.closest)),
      notes: search.best ? [] : search.notes,
      failures: search.failures,
      quotesUsed: search.quotesUsed,
      capped: search.capped,
    };
  }

  static async checkPlan(args) {
    const { desk, getMandate } = QuorumActions.page();
    const parsed = QuorumActions.parse(args.ordersJson);
    if (!Array.isArray(parsed) || !parsed.length || parsed.length > 3) {
      return { ok: false, reason: "ordersJson must be a list of 1 to 3 orders." };
    }
    const mandate = getMandate();
    const orders = [];
    const catalogs = {};
    for (const order of parsed) {
      if (!VENDOR_IDS.includes(order?.vendor)) {
        return { ok: false, reason: `No vendor named ${String(order?.vendor)}.` };
      }
      if (!catalogs[order.vendor]) {
        const catalog = await desk.read(order.vendor, "get_catalog", {});
        const problem = catalog?.ok === false ? catalog.reason : validateCatalog(catalog);
        if (problem) {
          return { ok: false, reason: `${order.vendor}: ${String(problem).slice(0, 200)}` };
        }
        catalogs[order.vendor] = catalog;
      }
      const terms = { date: mandate.date, time: order.time, fulfilment: order.fulfilment, items: order.items };
      const answer = await desk.read(order.vendor, "request_quote", terms);
      if (!answer || answer.ok === false) {
        return { ok: false, reason: `${order.vendor}: ${String(answer?.reason || "no quote")}` };
      }
      orders.push({ ...order, quote: answer });
    }
    return checkPlan({ orders }, mandate, catalogs);
  }

  static missing(card) {
    return Object.entries(CARD_FIELDS).filter(([key]) => !String(card?.[key] ?? "").trim()).map(([, label]) => label);
  }

  static async placeAward(args, { signal } = {}) {
    const { desk, getMandate, getSearch, award, card, save } = QuorumActions.page();
    const plan = getSearch()?.plans?.[args.plan];
    if (!plan) {
      return { ok: false, reason: `No plan ${args.plan}. Run find_best_plan first.` };
    }
    const mandate = getMandate();
    // The checker decides, again, against the mandate as it is now.
    const check = checkPlan({ orders: plan.orders }, mandate, getSearch().catalogs);
    if (!check.ok) {
      return { ok: false, reason: `Plan ${args.plan} does not meet the mandate: ${check.problems.join(" ")}` };
    }
    const current = award();
    if (current.list().length && !current.finished()) {
      return { ok: false, reason: "An award is already being placed." };
    }
    if (current.list().length) {
      // Only the visitor starts a new order, on the page: a model cannot order twice.
      return { ok: false, reason: "The last order's results stand. Start a new order on the page first if the visitor wants another." };
    }
    const contact = card();
    const missing = QuorumActions.missing(contact);
    if (missing.length) {
      return { ok: false, reason: `The contact card on the page is missing: ${missing.join(", ")}. Ask the visitor to fill it in.` };
    }
    current.start(plan.orders.map((order) => ({
      vendor: order.vendor, time: order.time, fulfilment: order.fulfilment, items: order.items, totalCents: order.quote.totalCents,
    })), mandate.date);
    save();
    const results = [];
    for (const [index, order] of current.list().entries()) {
      if (signal?.aborted) {
        current.stopRemaining();
        save();
        return { orders: results, stopped: "Ordering was stopped. The orders not listed here were not sent." };
      }
      // Saved before anything is sent, so a reload or a retry can never send it again.
      current.update(index, { status: "booking" });
      save();
      const outcome = await desk.commit(order.vendor, "place_order", {
        date: current.date, time: order.time, fulfilment: order.fulfilment, items: order.items,
        firstName: contact.firstName, lastName: contact.lastName, email: contact.email, phone: contact.phone,
        expectedTotalCents: order.totalCents,
      }, { signal });
      const fields = safeOutcome(outcome, contact);
      current.update(index, fields);
      save();
      results.push({ vendor: order.vendor, ...fields });
    }
    return { orders: results };
  }
}

// The runtime calls the module's registerActions export.
export const registerActions = QuorumActions.registerActions;
