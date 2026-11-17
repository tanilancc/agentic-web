// The Town Concierge page: the itinerary, the board, the contact card, and the partner
// desk the assistant's tools use. site.js boots the runtime; the tools find this page
// through window.concierge.

import { ActionBridgeClient } from "../runtime/action-transport.js";
import { validateData } from "../runtime/actions.js";
import { PartnerDesk } from "../shared/partner-desk.js";
import { Board, dollars } from "./board.js";
import { ContactCard } from "./contact-card.js";
import { Itinerary } from "./itinerary.js";
import { PARTNERS } from "./partners.js";

/**
 * The browser's localStorage, or null.
 */
function storage() {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/**
 * The local time now, as "YYYY-MM-DDTHH:MM".
 */
export function localNow(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Drives the page.
 */
export class ConciergeApp {
  /**
   * The storage key for the itinerary.
   */
  static PLAN_KEY = "concierge-itinerary-v1";

  /**
   * :param doc: The document, with #board, #contact-card and #clear-plan.
   * :param store: localStorage, or null.
   * :param engine: Returns the runtime's engine once it has booted, or null.
   */
  constructor({ doc = document, store = storage(), engine = () => globalThis.__nsweb?.engine || null } = {}) {
    this.doc = doc;
    this.store = store;
    this.engine = engine;
    this.plan = ConciergeApp.loadPlan(store);
    this.board = new Board(doc.getElementById("board"), doc);
    this.contact = new ContactCard(doc.getElementById("contact-card"), store);
    this.desk = new PartnerDesk({
      partners: PARTNERS.map(({ id, label, origin, bridgeUrl }) => ({ id, label, origin, bridgeUrl })),
      // The runtime's consent card, so partner contact is asked for in the chat.
      consent: (info) => {
        const engine = this.engine();
        return engine ? engine.requestConsent(info) : Promise.resolve("decline");
      },
      ClientClass: ActionBridgeClient,
      validate: validateData,
    });
    // Clears only legs that are still planned: a booking's reference is never thrown away.
    doc.getElementById("clear-plan")?.addEventListener("click", () => {
      this.plan.clearPlanned();
      this.save();
    });
    this.render();
  }

  /**
   * Read the saved itinerary.
   */
  static loadPlan(store) {
    try {
      return Itinerary.fromJSON(JSON.parse(store?.getItem(ConciergeApp.PLAN_KEY) || "null"));
    } catch {
      return new Itinerary();
    }
  }

  /**
   * Save the itinerary and redraw the board.
   */
  save() {
    try {
      this.store?.setItem(ConciergeApp.PLAN_KEY, JSON.stringify(this.plan));
    } catch {
      // Storage blocked: the plan still holds for this visit.
    }
    this.render();
  }

  render() {
    this.board.show(this.plan.list(), this.plan.total(), this.plan.conflicts(localNow()));
  }

  /**
   * What the assistant's tools work on.
   *
   * :return: {desk, plan, card, save, now}.
   */
  actionContext() {
    return {
      desk: this.desk,
      plan: this.plan,
      card: () => this.contact.card(),
      save: () => this.save(),
      now: () => localNow(),
    };
  }

  /**
   * The details of the "Book this trip?" dialog, or the reason not to open it.
   *
   * :return: Details by label, or {refusal}.
   */
  reviewTrip() {
    const planned = this.plan.list().filter((leg) => leg.status === "planned");
    if (!planned.length) {
      return { refusal: "Nothing is planned to book." };
    }
    const card = this.contact.card();
    const missing = ["firstName", "lastName", "email", "phone"].filter((name) => !card[name]);
    if (missing.length) {
      return { refusal: `The contact card on the page is missing: ${missing.join(", ")}. Ask the visitor to fill it in.` };
    }
    // Each line is keyed by its leg number, never by the business's own name for it, so
    // no business can merge, hide or replace a line of this dialog.
    const details = {};
    planned.forEach((leg, index) => {
      details[`Leg ${index + 1}: ${leg.title}`] = `${PARTNERS.find((p) => p.id === leg.partner)?.label || leg.partner}, ${leg.start.replace("T", " ")}, ${dollars(leg.totalCents)}`;
    });
    details.Total = dollars(planned.reduce((sum, leg) => sum + leg.totalCents, 0));
    details["Booked for"] = `${card.firstName} ${card.lastName}, ${card.email}, ${card.phone}`;
    return details;
  }
}

// Start in a browser. Node tests import the class.
if (typeof window !== "undefined" && typeof document !== "undefined" && document.getElementById("board")) {
  window.concierge = new ConciergeApp();
}
