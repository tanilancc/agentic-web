// The itinerary board: each leg with its business, time, price and status, the total,
// and what is wrong with the plan. Everything is shown as text: names come from partner
// sites.

import { PARTNERS } from "./partners.js";

const STATUS_WORDS = {
  planned: "Planned",
  booked: "Booked",
  refused: "Not booked",
  declined: "You declined",
  unknown: "Check with the business",
};

/**
 * Format cents as dollars.
 *
 * :param cents: An amount in cents.
 * :return: Such as "$120.00".
 */
export function dollars(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * Format a local time "YYYY-MM-DDTHH:MM" for a person.
 *
 * :param at: The time.
 * :return: Such as "Thu 10 Dec, 15:00".
 */
export function when(at) {
  const date = new Date(`${at}:00Z`);
  const day = date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  return `${day}, ${at.slice(11, 16)}`;
}

/**
 * Create an element with text.
 */
function el(doc, tag, className, text = "") {
  const node = doc.createElement(tag);
  node.className = className;
  if (text) {
    node.textContent = text;
  }
  return node;
}

/**
 * The board on the page.
 */
export class Board {
  /**
   * :param root: The element the board is shown in.
   * :param doc: The document.
   */
  constructor(root, doc = document) {
    this.root = root;
    this.doc = doc;
  }

  /**
   * Show the plan.
   *
   * :param legs: The itinerary's legs, in time order.
   * :param totalCents: The total of the legs still in the plan.
   * :param conflicts: [{ids, message}].
   */
  show(legs, totalCents, conflicts) {
    const doc = this.doc;
    if (!legs.length) {
      this.root.replaceChildren(el(doc, "p", "board-empty", "Nothing planned yet. Ask the assistant what's free, then ask it to add what you like."));
      return;
    }
    const list = el(doc, "ol", "legs");
    for (const leg of legs) {
      const partner = PARTNERS.find((item) => item.id === leg.partner);
      const item = el(doc, "li", `leg leg-${leg.status}`);
      const flagged = conflicts.some((conflict) => conflict.ids.includes(leg.id));
      item.append(
        el(doc, "span", "leg-when", `${when(leg.start)} to ${when(leg.end)}`),
        el(doc, "span", "leg-title", leg.title),
        el(doc, "span", "leg-partner", `${partner ? partner.label : leg.partner} · ${leg.kind === "stay" ? "Stay" : "Trip"} · ${leg.partySize} ${leg.partySize === 1 ? "person" : "people"}`),
        el(doc, "span", "leg-price", dollars(leg.totalCents)),
        el(doc, "span", `leg-status status-${leg.status}`, STATUS_WORDS[leg.status] || leg.status),
      );
      if (leg.code) {
        item.append(el(doc, "span", "leg-code", `Reference ${leg.code}`));
      }
      if (leg.reason) {
        item.append(el(doc, "span", "leg-reason", leg.reason));
      }
      if (flagged) {
        item.classList.add("leg-flagged");
      }
      list.append(item);
    }
    const parts = [list, el(doc, "p", "board-total", `Total ${dollars(totalCents)}`)];
    if (conflicts.length) {
      const warn = el(doc, "ul", "conflicts");
      warn.setAttribute("aria-label", "Problems with this plan");
      for (const conflict of conflicts) {
        warn.append(el(doc, "li", "conflict", conflict.message));
      }
      parts.push(warn);
    }
    this.root.replaceChildren(...parts);
  }
}
