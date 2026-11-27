// The search that does Quorum's negotiating. It builds each vendor's cheapest basket for
// the mandate, asks the vendors for binding quotes across times, pickup or delivery, and
// one-vendor or split orders, and checks every plan with checkPlan. Prices come only from
// the vendors' quotes; acceptability only from the checker.

import { checkPlan, clock, minutes } from "./mandate.js";

const DIET_ORDER = ["vegan", "glutenFree", "vegetarian"];
const DIET_TAG = { vegan: "vegan", glutenFree: "gluten-free", vegetarian: "vegetarian" };

/**
 * Whether an item counts for a diet. Vegan dishes are also vegetarian.
 */
function fits(item, diet) {
  const tag = DIET_TAG[diet];
  return item.diets.includes(tag) || (diet === "vegetarian" && item.diets.includes("vegan"));
}

/**
 * Find what makes a vendor's menu unusable for the search. A menu is a vendor's data, so
 * every field the search relies on is checked before it is used.
 *
 * :param catalog: The vendor's menu.
 * :return: "" when it is usable, or the reason.
 */
export function validateCatalog(catalog) {
  if (!catalog || typeof catalog !== "object") {
    return "no menu";
  }
  if (!Number.isInteger(catalog.slotMinutes) || catalog.slotMinutes < 5 || catalog.slotMinutes > 240) {
    return "its order interval is not a whole number of minutes from 5 to 240";
  }
  if (Number.isNaN(minutes(catalog.hours?.from)) || Number.isNaN(minutes(catalog.hours?.to))) {
    return "its opening hours are not times";
  }
  if (!Array.isArray(catalog.items) || !catalog.items.length || catalog.items.length > 200) {
    return "it lists no items";
  }
  for (const item of catalog.items) {
    if (!item || typeof item.id !== "string" || !Number.isInteger(item.priceCents) || item.priceCents < 1
      || !Number.isInteger(item.serves) || item.serves < 1 || item.serves > 1000
      || !Array.isArray(item.diets) || item.diets.some((diet) => typeof diet !== "string")) {
      return `an item is not a priced dish with servings and diets (${String(item?.id).slice(0, 40)})`;
    }
  }
  return "";
}

/**
 * The cheapest basket from one catalog that meets a need.
 *
 * Each diet group is separate people (see mandate.js), so each is fed with its own
 * servings: vegans with the cheapest vegan dish per serving, gluten-free people with
 * the cheapest gluten-free dish, vegetarians with the cheapest vegetarian or vegan dish;
 * then everyone else with the cheapest dish of all.
 *
 * :param catalog: The vendor's catalog.
 * :param need: {servings, vegetarian, vegan, glutenFree}: the headcount, and the
 *     people in each separate group.
 * :return: [{id, qty}], or null when the vendor has nothing for a needed diet.
 */
export function buildBasket(catalog, need) {
  const qty = new Map();
  const have = { servings: 0, vegan: 0, glutenFree: 0, vegetarian: 0 };
  const cheapest = (items) => [...items].sort((a, b) => a.priceCents / a.serves - b.priceCents / b.serves || a.id.localeCompare(b.id))[0];
  const add = (item, count) => {
    qty.set(item.id, (qty.get(item.id) || 0) + count);
    have.servings += item.serves * count;
  };
  let fed = 0;
  for (const diet of DIET_ORDER) {
    const people = need[diet] || 0;
    if (people <= 0) {
      continue;
    }
    const item = cheapest(catalog.items.filter((candidate) => fits(candidate, diet)));
    if (!item) {
      return null;
    }
    // Leftover servings of this dish still feed the people with no diet below.
    add(item, Math.ceil(people / item.serves));
    fed += people;
  }
  const rest = (need.servings || 0) - Math.max(fed, 0) - Math.max(have.servings - fed, 0);
  if (rest > 0) {
    const item = cheapest(catalog.items);
    add(item, Math.ceil(rest / item.serves));
  }
  return [...qty].map(([id, count]) => ({ id, qty: count }));
}

/**
 * List prices of a basket, before discounts: only to decide which quotes to ask first.
 */
function estimate(catalog, items) {
  return items.reduce((sum, entry) => sum + catalog.items.find((item) => item.id === entry.id).priceCents * entry.qty, 0);
}

/**
 * Servings a basket gives, from the catalog.
 */
function servingsOf(catalog, items) {
  return items.reduce((sum, entry) => sum + catalog.items.find((item) => item.id === entry.id).serves * entry.qty, 0);
}

/**
 * The order times a vendor can do inside the window and its flexibility.
 */
function slotTimes(catalog, mandate) {
  const start = Math.max(minutes(mandate.from) - mandate.flexMinutes, minutes(catalog.hours.from));
  const end = Math.min(minutes(mandate.to) + mandate.flexMinutes, minutes(catalog.hours.to));
  const times = [];
  for (let t = Math.ceil(start / catalog.slotMinutes) * catalog.slotMinutes; t <= end; t += catalog.slotMinutes) {
    times.push(clock(t));
  }
  return times;
}

/**
 * Search the vendors for the best plan.
 *
 * :param vendors: Vendor ids.
 * :param mandate: A sound mandate.
 * :param getCatalog: (id) -> Promise of the catalog or {ok:false, reason}.
 * :param quote: (id, {date, time, fulfilment, items}) -> Promise of the vendor's quote.
 * :param maxQuotes: The most quotes to ask for.
 * :return: {plans, catalogs, notes, best, closest, baseline, failures, quotesUsed, capped}.
 *     A plan is {orders:[{vendor, time, fulfilment, items, quote}], check}. notes give
 *     each vendor's first reason it could not take part; failures name vendors that did
 *     not answer or sent a menu that cannot be read.
 */
export async function searchPlans({ vendors, mandate, getCatalog, quote, maxQuotes = 60 }) {
  const catalogs = {};
  const failures = [];
  // Per vendor, the first reason it could not take part: shown when no plan fits.
  const notes = new Map();
  const note = (vendor, reason) => {
    if (!notes.has(vendor)) {
      notes.set(vendor, String(reason).slice(0, 300));
    }
  };
  for (const id of vendors) {
    const catalog = await getCatalog(id);
    if (!catalog || catalog.ok === false) {
      failures.push({ vendor: id, reason: String(catalog?.reason || `${id} sent no menu.`).slice(0, 300) });
      continue;
    }
    const problem = validateCatalog(catalog);
    if (problem) {
      failures.push({ vendor: id, reason: `${id} sent a menu Quorum cannot read: ${problem}.` });
    } else {
      catalogs[id] = catalog;
    }
  }
  const ids = Object.keys(catalogs);
  const fulfilments = mandate.pickupAllowed ? ["delivery", "pickup"] : ["delivery"];
  const fullNeed = { servings: mandate.headcount, vegetarian: mandate.vegetarian, vegan: mandate.vegan, glutenFree: mandate.glutenFree };
  for (const id of ids) {
    if (!slotTimes(catalogs[id], mandate).length) {
      note(id, `${id} has no order time between ${clock(minutes(mandate.from) - mandate.flexMinutes)} and ${clock(minutes(mandate.to) + mandate.flexMinutes)}.`);
    }
  }
  const dietNeed = { ...fullNeed, servings: 0 };

  // Candidate plans, each a list of parts {vendor, items}, ranked by list price.
  const shapes = [];
  for (const id of ids) {
    const items = buildBasket(catalogs[id], fullNeed);
    if (items) {
      shapes.push([{ vendor: id, items }]);
    } else {
      note(id, `${id} has no dish for one of the diets, so it can only feed the others in a split order.`);
    }
  }
  for (const a of ids) {
    const dietItems = buildBasket(catalogs[a], dietNeed);
    if (!dietItems || !dietItems.length) {
      continue;
    }
    const left = mandate.headcount - mandate.vegetarian - mandate.vegan - mandate.glutenFree
      - Math.max(0, servingsOf(catalogs[a], dietItems) - mandate.vegetarian - mandate.vegan - mandate.glutenFree);
    for (const b of ids) {
      if (b === a || left <= 0) {
        continue;
      }
      const restItems = buildBasket(catalogs[b], { servings: left, vegetarian: 0, vegan: 0, glutenFree: 0 });
      if (restItems) {
        shapes.push([{ vendor: a, items: dietItems }, { vendor: b, items: restItems }]);
      }
    }
  }
  const candidates = [];
  for (const parts of shapes) {
    for (const fulfilment of fulfilments) {
      // Every part of a plan arrives at the same time, so all its vendors must do it.
      const common = parts.map((part) => slotTimes(catalogs[part.vendor], mandate)).reduce((a, b) => a.filter((t) => b.includes(t)));
      for (const time of common) {
        candidates.push({ parts, fulfilment, time, estimate: parts.reduce((sum, p) => sum + estimate(catalogs[p.vendor], p.items), 0) });
      }
    }
  }
  candidates.sort((a, b) => a.estimate - b.estimate || a.time.localeCompare(b.time));

  // Ask for quotes, cheapest-looking first, never twice for the same thing.
  const cache = new Map();
  let quotesUsed = 0;
  let capped = false;
  const ask = async (vendor, args) => {
    const key = JSON.stringify([vendor, args]);
    if (!cache.has(key)) {
      if (quotesUsed >= maxQuotes) {
        capped = true;
        return null;
      }
      quotesUsed += 1;
      cache.set(key, await quote(vendor, args));
    }
    return cache.get(key);
  };
  const plans = [];
  const gone = new Set();
  for (const candidate of candidates) {
    if (candidate.parts.some((part) => gone.has(part.vendor))) {
      continue;
    }
    const orders = [];
    let complete = true;
    for (const part of candidate.parts) {
      const args = { date: mandate.date, time: candidate.time, fulfilment: candidate.fulfilment, items: part.items };
      const answer = await ask(part.vendor, args);
      if (answer?.unreachable) {
        // The vendor stopped answering: name it once, and ask it nothing more.
        gone.add(part.vendor);
        failures.push({ vendor: part.vendor, reason: String(answer.reason).slice(0, 300) });
      } else if (answer && answer.ok === false) {
        note(part.vendor, answer.reason);
      }
      if (!answer || answer.ok !== true) {
        complete = false;
        break;
      }
      orders.push({ vendor: part.vendor, time: candidate.time, fulfilment: candidate.fulfilment, items: part.items, quote: answer });
    }
    if (complete) {
      plans.push({ orders, check: checkPlan({ orders }, mandate, catalogs) });
    }
    if (capped) {
      break;
    }
  }
  plans.sort((a, b) => Number(b.check.ok) - Number(a.check.ok) || a.check.totalCents - b.check.totalCents);
  const passing = plans.filter((plan) => plan.check.ok);
  const closest = passing.length ? null
    : [...plans].sort((a, b) => a.check.problems.length - b.check.problems.length || a.check.totalCents - b.check.totalCents)[0] || null;
  for (const vendor of gone) {
    notes.delete(vendor);
  }
  return {
    plans,
    catalogs,
    notes: [...notes].map(([vendor, reason]) => ({ vendor, reason })),
    best: passing[0] || null,
    closest,
    baseline: passing.find((plan) => plan.orders.length === 1) || null,
    failures,
    quotesUsed,
    capped,
  };
}
