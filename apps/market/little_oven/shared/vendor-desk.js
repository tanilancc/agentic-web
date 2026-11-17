// The partner desk every market vendor publishes. A vendor's partner-actions.js calls
// vendorActions() with its own catalog. Quotes come from vendor-pricing.js on that
// catalog, so the vendor is the only authority on its prices. An order runs only in a
// window of the vendor's own site, where the visitor confirms it, and is kept in that
// site's storage.

import { quote } from "./vendor-pricing.js";

/**
 * The local time now, as "YYYY-MM-DDTHH:MM".
 */
export function localNow(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Keeps a vendor's orders in the browser's storage.
 */
export class SavedOrders {
  static key(vendorId) {
    return `market-${vendorId}-orders-v1`;
  }

  /**
   * The browser's localStorage, or null.
   */
  static defaultStorage() {
    try {
      return typeof localStorage === "undefined" ? null : localStorage;
    } catch {
      return null;
    }
  }

  static load(storage, vendorId) {
    try {
      const saved = JSON.parse(storage?.getItem(SavedOrders.key(vendorId)) || "[]");
      return Array.isArray(saved) ? saved.filter((order) => order && typeof order.code === "string") : [];
    } catch {
      return [];
    }
  }

  static save(storage, vendorId, orders) {
    try {
      storage?.setItem(SavedOrders.key(vendorId), JSON.stringify(orders));
    } catch {
      // Storage full or blocked: the order is still returned to the visitor.
    }
  }
}

/**
 * A new order code, without letters that are easy to mix up.
 */
function newCode(prefix, taken) {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  for (;;) {
    let code = `${prefix}-`;
    for (let i = 0; i < 4; i += 1) {
      code += letters[Math.floor(Math.random() * letters.length)];
    }
    if (!taken.has(code)) {
      return code;
    }
  }
}

/**
 * The input schema of an order's terms.
 */
function termsSchema(catalog) {
  return {
    date: { type: "string", format: "date", description: "The day, YYYY-MM-DD." },
    time: { type: "string", maxLength: 5, description: `Delivery or pickup time, HH:MM, every ${catalog.slotMinutes} minutes.` },
    fulfilment: { type: "string", enum: ["delivery", "pickup"] },
    items: {
      type: "array", minItems: 1, maxItems: 20,
      items: {
        type: "object", additionalProperties: false, required: ["id", "qty"],
        properties: { id: { type: "string", enum: catalog.items.map((item) => item.id) }, qty: { type: "integer", minimum: 1, maximum: 500 } },
      },
    },
  };
}

/**
 * The partner actions of one vendor.
 *
 * :param catalog: The vendor's catalog.
 * :param callers: The exact origins allowed to use the desk.
 * :param storage: Where orders are kept; localStorage by default.
 * :param now: Returns the local time now.
 * :return: Action definitions for the runtime's registry.
 */
export function vendorActions({ catalog, callers, storage = SavedOrders.defaultStorage(), now = () => localNow() }) {
  const terms = termsSchema(catalog);
  const required = ["date", "time", "fulfilment", "items"];
  const orderTerms = (args) => ({ date: args.date, time: args.time, fulfilment: args.fulfilment, items: args.items });
  return [
    {
      name: "get_catalog",
      description: `${catalog.name}'s menu: each item's id, name, price in cents, servings and diets, with the opening hours, order times, notice, minimum order, delivery fee and discounts. Changes nothing.`,
      effect: "read",
      availability: "bridge",
      callerOrigins: callers,
      inputSchema: { type: "object", additionalProperties: false, properties: {} },
      execute: () => JSON.parse(JSON.stringify(catalog)),
    },
    {
      name: "request_quote",
      description: `A binding quote from ${catalog.name} for items, a day, a time and delivery or pickup: lines, discounts, fee, total in cents, servings and servings per diet. Or ${catalog.name}'s reason it cannot do it. Changes nothing.`,
      effect: "read",
      availability: "bridge",
      callerOrigins: callers,
      inputSchema: { type: "object", additionalProperties: false, required, properties: terms },
      execute: (args) => quote(catalog, orderTerms(args), now()),
    },
    {
      name: "place_order",
      description: `Place an order with ${catalog.name}. Runs in ${catalog.name}'s own window, where the visitor confirms it. Refused when the total is no longer expectedTotalCents.`,
      effect: "irreversible",
      availability: "top-level",
      callerOrigins: callers,
      inputSchema: {
        type: "object", additionalProperties: false,
        required: [...required, "firstName", "lastName", "email", "phone", "expectedTotalCents"],
        properties: {
          ...terms,
          firstName: { type: "string", minLength: 1, maxLength: 60 },
          lastName: { type: "string", minLength: 1, maxLength: 60 },
          email: { type: "string", minLength: 3, maxLength: 120 },
          phone: { type: "string", minLength: 7, maxLength: 40 },
          expectedTotalCents: { type: "integer", minimum: 0 },
        },
      },
      execute: (args) => {
        const priced = quote(catalog, orderTerms(args), now());
        if (!priced.ok) {
          return priced;
        }
        if (priced.totalCents !== args.expectedTotalCents) {
          return { ok: false, reason: `The price is now $${(priced.totalCents / 100).toFixed(2)}, not $${(args.expectedTotalCents / 100).toFixed(2)}. Nothing was ordered.` };
        }
        const orders = SavedOrders.load(storage, catalog.id);
        const code = newCode(catalog.codePrefix, new Set(orders.map((order) => order.code)));
        orders.push({
          code, placedAt: now(), order: orderTerms(args), totalCents: priced.totalCents,
          contact: { firstName: args.firstName, lastName: args.lastName, email: args.email, phone: args.phone },
        });
        SavedOrders.save(storage, catalog.id, orders);
        return { ok: true, code, totalCents: priced.totalCents };
      },
    },
  ];
}
