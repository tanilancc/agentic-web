// Registers the Concierge's operations with the agent runtime. The names in
// agent-manifest.json "actions.agentTools" become model tools, called website_<name>.
//
// Every price, name and time comes from a partner's own answer. The visitor's contact
// card never appears in a tool result: book_trip reads it at booking time and sends it
// only to each partner's own window, where the visitor sees it before confirming.

import { PARTNERS } from "./js/partners.js";

const PARTNER_IDS = PARTNERS.map((partner) => partner.id);
const CARD_FIELDS = { firstName: "first name", lastName: "last name", email: "email", phone: "phone" };

/**
 * The Concierge's actions.
 */
export class ConciergeActions {
  /**
   * What the actions work on: {desk, plan, card, save, now}. Tests set it; in the
   * browser it comes from the page (js/app.js sets window.concierge).
   */
  static context = null;

  static page() {
    const context = ConciergeActions.context || globalThis.concierge?.actionContext?.();
    if (!context) {
      throw new Error("The page is still starting.");
    }
    return context;
  }

  static partner(id) {
    return PARTNERS.find((partner) => partner.id === id);
  }

  /**
   * Parse the model's arguments for a partner.
   *
   * :param text: JSON text.
   * :return: An object, or null.
   */
  static parseArgs(text) {
    try {
      const value = JSON.parse(text);
      return value && typeof value === "object" && !Array.isArray(value) ? value : null;
    } catch {
      return null;
    }
  }

  /**
   * A leg as the model sees it: no booking details.
   */
  static view(leg) {
    const { id, partner, kind, title, start, end, partySize, totalCents, status, code, reason } = leg;
    return { id, partner, kind, title, start, end, partySize, totalCents, status, ...(code ? { code } : {}), ...(reason ? { reason } : {}) };
  }

  /**
   * Register every action.
   *
   * :param actions: The runtime registry facade.
   */
  static registerActions(actions) {
    const partnerField = { type: "string", enum: PARTNER_IDS, description: "A partner id from website_list_partners." };
    const argsField = { type: "string", minLength: 2, maxLength: 1000, description: "The partner action's arguments as a JSON object, using the names website_list_partners gives." };
    actions.register({
      name: "list_partners",
      description: "The partner sites, what each offers, the reads you can ask them for, and the extra fields a booking with them needs. The visitor is asked before each partner is first contacted.",
      effect: "read",
      inputSchema: { type: "object", additionalProperties: false, properties: {} },
      execute: ConciergeActions.listPartners,
    });
    actions.register({
      name: "search_partner",
      description: "Run one of a partner's reads, such as free rooms or departures, and return the partner's own answer. Changes nothing.",
      effect: "read",
      inputSchema: {
        type: "object", additionalProperties: false, required: ["partner", "action", "argsJson"],
        properties: { partner: partnerField, action: { type: "string", maxLength: 60, description: "A read from website_list_partners." }, argsJson: argsField },
      },
      execute: ConciergeActions.searchPartner,
    });
    actions.register({
      name: "plan_leg",
      description: "Add a stay or trip to the itinerary. The partner quotes it, and its name and price come from that quote. For the guesthouse give roomId, checkIn, checkOut, guests and arrival; for harbor tours give tourId, date, time, adults and children. Returns the leg and any conflicts.",
      effect: "write",
      inputSchema: { type: "object", additionalProperties: false, required: ["partner", "argsJson"], properties: { partner: partnerField, argsJson: argsField } },
      execute: ConciergeActions.planLeg,
    });
    actions.register({
      name: "remove_leg",
      description: "Remove a planned leg from the itinerary.",
      effect: "write",
      inputSchema: { type: "object", additionalProperties: false, required: ["id"], properties: { id: { type: "string", maxLength: 20, description: "A leg id from website_get_itinerary." } } },
      execute: ConciergeActions.removeLeg,
    });
    actions.register({
      name: "get_itinerary",
      description: "The itinerary: each leg with its partner, times, price and status, the total of the legs still in the plan, and conflicts.",
      effect: "read",
      inputSchema: { type: "object", additionalProperties: false, properties: {} },
      execute: ConciergeActions.getItinerary,
    });
    actions.register({
      name: "book_trip",
      description: "Book every planned leg, each on its own partner's site, with the visitor's contact card. The visitor confirms the whole trip here, then each booking in that partner's window. Returns each leg's result: booked with a code, refused, declined or unknown. Never retries.",
      effect: "irreversible",
      inputSchema: { type: "object", additionalProperties: false, properties: {} },
      execute: ConciergeActions.bookTrip,
    });
  }

  static async listPartners() {
    const { desk } = ConciergeActions.page();
    const partners = [];
    for (const partner of PARTNERS) {
      const catalog = await desk.catalog(partner.id);
      if (!Array.isArray(catalog)) {
        partners.push({ id: partner.id, label: partner.label, offers: partner.offers, unavailable: catalog.reason });
        continue;
      }
      const commit = catalog.find((entry) => entry.name === partner.commitAction);
      partners.push({
        id: partner.id,
        label: partner.label,
        offers: partner.offers,
        reads: catalog.filter((entry) => entry.effect === "read").map((entry) => ({ action: entry.name, description: entry.description, input: entry.inputSchema })),
        bookingNeeds: partner.extraFields.map((field) => ({ field, options: commit?.inputSchema?.properties?.[field]?.enum || [] })),
      });
    }
    return { partners };
  }

  static async searchPartner(args) {
    const parsed = ConciergeActions.parseArgs(args.argsJson);
    if (!parsed) {
      return { ok: false, reason: "argsJson must be a JSON object." };
    }
    return ConciergeActions.page().desk.read(args.partner, args.action, parsed);
  }

  static async planLeg(args) {
    const { desk, plan, save, now } = ConciergeActions.page();
    const partner = ConciergeActions.partner(args.partner);
    const parsed = ConciergeActions.parseArgs(args.argsJson);
    if (!parsed) {
      return { ok: false, reason: "argsJson must be a JSON object." };
    }
    const quote = await desk.read(partner.id, partner.quoteAction, partner.quoteArgs(parsed));
    if (!quote || quote.ok === false) {
      return { ok: false, reason: String(quote?.reason || `${partner.label} did not quote it.`) };
    }
    const id = plan.add({ partner: partner.id, ...partner.toLeg(quote), commit: { action: partner.commitAction, args: parsed } });
    save();
    return { leg: ConciergeActions.view(plan.list().find((leg) => leg.id === id)), conflicts: plan.conflicts(now()).map((c) => c.message) };
  }

  static removeLeg(args) {
    const { plan, save } = ConciergeActions.page();
    if (!plan.remove(args.id)) {
      return { ok: false, reason: `No leg ${args.id} in the itinerary.` };
    }
    save();
    return { ok: true };
  }

  static getItinerary() {
    const { plan, now } = ConciergeActions.page();
    return { legs: plan.list().map(ConciergeActions.view), totalCents: plan.total(), conflicts: plan.conflicts(now()).map((c) => c.message) };
  }

  /**
   * What is missing from the contact card, as field names.
   *
   * :param card: The card.
   * :return: The missing fields' names.
   */
  static missing(card) {
    return Object.entries(CARD_FIELDS).filter(([key]) => !String(card?.[key] ?? "").trim()).map(([, label]) => label);
  }

  static async bookTrip() {
    const { desk, plan, card, save } = ConciergeActions.page();
    const planned = plan.list().filter((leg) => leg.status === "planned");
    if (!planned.length) {
      return { ok: false, reason: "Nothing is planned to book." };
    }
    const contact = card();
    const missing = ConciergeActions.missing(contact);
    if (missing.length) {
      // Names the empty fields only; the card's values never reach the model.
      return { ok: false, reason: `The contact card on the page is missing: ${missing.join(", ")}. Ask the visitor to fill it in.` };
    }
    const results = [];
    for (const leg of planned) {
      const partner = ConciergeActions.partner(leg.partner);
      const outcome = await desk.commit(partner.id, partner.commitAction, {
        ...partner.commitArgs(leg.commit.args, contact),
        expectedTotalCents: leg.totalCents,
      });
      const fields = outcome.status === "booked"
        ? { status: "booked", code: String(outcome.value.code) }
        : { status: outcome.status, reason: String(outcome.reason || "") };
      plan.update(leg.id, fields);
      save();
      results.push({ id: leg.id, title: leg.title, ...fields });
    }
    return { legs: results };
  }
}

// The runtime calls the module's registerActions export.
export const registerActions = ConciergeActions.registerActions;
