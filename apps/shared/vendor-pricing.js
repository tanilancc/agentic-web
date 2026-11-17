// How a market vendor prices an order. Every vendor runs this same code on its own
// catalog, so a vendor's quote is the only authority on its prices. Quorum never
// computes a price itself: it asks each vendor.
//
// A catalog is:
//   {id, name, items:[{id, name, priceCents, serves, diets}], minOrderCents,
//    delivery:{feeCents, freeOverCents, leadMinutes}, pickup:{discountPct},
//    hours:{from, to}, slotMinutes, tiers:[{minItems, discountPct}],
//    offPeak:{from, to, discountPct}}
// Times are local wall-clock "HH:MM"; dates "YYYY-MM-DD"; now is "YYYY-MM-DDTHH:MM".

const DIETS = ["vegetarian", "vegan", "gluten-free"];

/**
 * Minutes since midnight for "HH:MM", or NaN.
 */
function minutes(time) {
  const match = /^(\d{2}):(\d{2})$/.exec(String(time));
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) {
    return NaN;
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

/**
 * Minutes from now until a date and time, comparing wall-clock times.
 */
function minutesUntil(now, date, time) {
  const at = Date.parse(`${date}T${time}:00Z`);
  const from = Date.parse(`${now}:00Z`);
  return (at - from) / 60000;
}

/**
 * Format cents as dollars.
 */
function dollars(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * A refusal.
 */
function refuse(reason) {
  return { ok: false, reason };
}

/**
 * Price an order.
 *
 * :param catalog: The vendor's catalog.
 * :param order: {date, time, fulfilment, items:[{id, qty}]}.
 * :param now: The vendor's current local time, "YYYY-MM-DDTHH:MM".
 * :return: {ok:true, lines, subtotalCents, discounts, feeCents, totalCents, servings,
 *     dietServings} or {ok:false, reason}.
 */
export function quote(catalog, order, now) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(order?.date)) || Number.isNaN(Date.parse(`${order.date}T00:00:00Z`))) {
    return refuse("The date must be YYYY-MM-DD.");
  }
  const at = minutes(order.time);
  if (Number.isNaN(at)) {
    return refuse("The time must be HH:MM.");
  }
  if (order.fulfilment !== "delivery" && order.fulfilment !== "pickup") {
    return refuse("Choose delivery or pickup.");
  }
  if (at < minutes(catalog.hours.from) || at > minutes(catalog.hours.to)) {
    return refuse(`${catalog.name} takes orders between ${catalog.hours.from} and ${catalog.hours.to}.`);
  }
  if (at % catalog.slotMinutes !== 0) {
    return refuse(`${catalog.name} takes orders every ${catalog.slotMinutes} minutes, such as 18:00 or 18:${String(catalog.slotMinutes).padStart(2, "0")}.`);
  }
  if (minutesUntil(now, order.date, order.time) < catalog.delivery.leadMinutes) {
    return refuse(`${catalog.name} needs at least ${catalog.delivery.leadMinutes} minutes' notice.`);
  }
  if (!Array.isArray(order.items) || order.items.length === 0) {
    return refuse("The order has no items.");
  }

  // Add up each item, merging repeats.
  const counts = new Map();
  for (const entry of order.items) {
    const item = catalog.items.find((candidate) => candidate.id === entry?.id);
    if (!item) {
      return refuse(`${catalog.name} has no item "${String(entry?.id)}".`);
    }
    if (!Number.isInteger(entry.qty) || entry.qty < 1 || entry.qty > 500) {
      return refuse(`The quantity of ${item.name} must be a whole number from 1 to 500.`);
    }
    counts.set(item.id, (counts.get(item.id) || 0) + entry.qty);
  }
  const lines = [];
  let subtotal = 0;
  let count = 0;
  let servings = 0;
  const dietServings = Object.fromEntries(DIETS.map((diet) => [diet, 0]));
  for (const [id, qty] of counts) {
    const item = catalog.items.find((candidate) => candidate.id === id);
    const cents = item.priceCents * qty;
    lines.push({ id, name: item.name, qty, unitCents: item.priceCents, cents });
    subtotal += cents;
    count += qty;
    servings += item.serves * qty;
    const diets = new Set(item.diets);
    // A vegan dish is also vegetarian.
    if (diets.has("vegan")) {
      diets.add("vegetarian");
    }
    for (const diet of diets) {
      if (diet in dietServings) {
        dietServings[diet] += item.serves * qty;
      }
    }
  }

  // Discounts, each on the running total: volume tier, then off-peak, then pickup.
  const discounts = [];
  let running = subtotal;
  const take = (label, pct) => {
    const cents = Math.round((running * pct) / 100);
    if (cents > 0) {
      discounts.push({ label, cents });
      running -= cents;
    }
  };
  const tier = [...catalog.tiers].sort((a, b) => b.minItems - a.minItems).find((candidate) => count >= candidate.minItems);
  if (tier) {
    take(`${tier.minItems}+ items`, tier.discountPct);
  }
  if (catalog.offPeak && at >= minutes(catalog.offPeak.from) && at < minutes(catalog.offPeak.to)) {
    take(`Off-peak ${catalog.offPeak.from} to ${catalog.offPeak.to}`, catalog.offPeak.discountPct);
  }
  if (order.fulfilment === "pickup" && catalog.pickup?.discountPct) {
    take("Pickup", catalog.pickup.discountPct);
  }
  if (running < catalog.minOrderCents) {
    return refuse(`The minimum order is ${dollars(catalog.minOrderCents)} after discounts; this order is ${dollars(running)}.`);
  }
  const feeCents = order.fulfilment === "delivery" && running < catalog.delivery.freeOverCents ? catalog.delivery.feeCents : 0;
  return { ok: true, lines, subtotalCents: subtotal, discounts, feeCents, totalCents: running + feeCents, servings, dietServings };
}
