// Shows the search's result beside the cheapest single-vendor plan, and the orders being
// placed. Item names come from the vendors' quotes, so everything is shown as text.

import { VENDORS } from "./vendors.js";

export function dollars(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}

function el(doc, tag, className, text = "") {
  const node = doc.createElement(tag);
  if (className) {
    node.className = className;
  }
  if (text) {
    node.textContent = text;
  }
  return node;
}

function label(vendor) {
  return VENDORS.find((item) => item.id === vendor)?.label || vendor;
}

const STATUS_WORDS = {
  planned: "Waiting",
  booking: "Sending…",
  booked: "Ordered",
  refused: "Not ordered",
  declined: "You declined",
  unknown: "Check with the vendor",
};

/**
 * The plans and orders area of the page.
 */
export class PlanView {
  /**
   * :param root: The element the view is drawn in.
   * :param doc: The document.
   */
  constructor(root, doc = document) {
    this.root = root;
    this.doc = doc;
  }

  /**
   * One plan as a card.
   */
  card(title, plan, note = "") {
    const doc = this.doc;
    const card = el(doc, "article", `plan ${plan.check.ok ? "plan-ok" : "plan-fails"}`);
    card.append(el(doc, "h3", "plan-title", title), el(doc, "p", "plan-total", dollars(plan.check.totalCents)));
    if (note) {
      card.append(el(doc, "p", "plan-note", note));
    }
    const list = el(doc, "ul", "plan-orders");
    for (const order of plan.orders) {
      const item = el(doc, "li", "plan-order");
      item.append(
        el(doc, "span", "order-vendor", `${label(order.vendor)} · ${order.time} · ${order.fulfilment}`),
        el(doc, "span", "order-items", order.quote.lines.map((line) => `${line.qty} × ${line.name}`).join(", ")),
        el(doc, "span", "order-total", dollars(order.quote.totalCents)),
      );
      if (order.quote.discounts.length) {
        item.append(el(doc, "span", "order-discounts", `Saved ${order.quote.discounts.map((d) => `${dollars(d.cents)} (${d.label})`).join(", ")}`));
      }
      list.append(item);
    }
    card.append(list);
    if (!plan.check.ok) {
      const problems = el(doc, "ul", "plan-problems");
      for (const problem of plan.check.problems) {
        problems.append(el(doc, "li", "", problem));
      }
      card.append(problems);
    }
    return card;
  }

  /**
   * Draw the page's result.
   *
   * :param search: The last search, or null.
   * :param award: The award's orders.
   */
  show(search, award) {
    const doc = this.doc;
    const parts = [];
    if (award.length) {
      const orders = el(doc, "section", "award");
      orders.append(el(doc, "h3", "", "Orders"));
      const list = el(doc, "ul", "award-orders");
      for (const order of award) {
        const item = el(doc, "li", `award-order status-${order.status}`);
        item.append(
          el(doc, "span", "order-vendor", `${label(order.vendor)} · ${order.time} · ${dollars(order.totalCents)}`),
          el(doc, "span", "award-status", STATUS_WORDS[order.status] || order.status),
        );
        if (order.code) {
          item.append(el(doc, "span", "award-code", `Reference ${order.code}`));
        }
        if (order.reason) {
          item.append(el(doc, "span", "award-reason", order.reason));
        }
        list.append(item);
      }
      orders.append(list);
      parts.push(orders);
    }
    if (!search) {
      if (!award.length) {
        parts.push(el(doc, "p", "empty", "Set the mandate, then ask the assistant to find the best plan."));
      }
      this.root.replaceChildren(...parts);
      return;
    }
    const grid = el(doc, "div", "plans");
    if (search.best) {
      const savings = search.baseline && search.best !== search.baseline && search.baseline.check.totalCents > search.best.check.totalCents
        ? `${dollars(search.baseline.check.totalCents - search.best.check.totalCents)} less than the best single vendor.` : "";
      grid.append(this.card("Best plan", search.best, savings));
      if (search.baseline && search.baseline !== search.best) {
        grid.append(this.card("Best with one vendor", search.baseline));
      }
    } else if (search.closest) {
      grid.append(this.card("No plan meets the mandate. Closest:", search.closest));
    } else {
      grid.append(el(doc, "p", "empty", "No vendor could quote for this mandate."));
    }
    parts.push(grid);
    const notes = [];
    for (const failure of search.failures) {
      notes.push(`${label(failure.vendor)} did not answer: ${failure.reason}`);
    }
    notes.push(`${search.quotesUsed} quotes from the vendors${search.capped ? ", the most allowed in one search: some combinations were not tried" : ""}.`);
    const list = el(doc, "ul", "search-notes");
    for (const note of notes) {
      list.append(el(doc, "li", "", note));
    }
    parts.push(list);
    this.root.replaceChildren(...parts);
  }
}
