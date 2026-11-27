// The visitor's mandate, and the checker that decides whether a plan meets it. The
// checker is the only thing that may call a plan acceptable: not a model, and not a
// vendor. Every problem it finds names the shortfall with numbers.
//
// A mandate is {date, headcount, vegetarian, vegan, glutenFree, budgetCents, from, to,
// flexMinutes, pickupAllowed}. The diet groups are separate people: vegetarian counts
// people who are vegetarian but not vegan, and glutenFree counts people who need
// gluten-free food and are neither. Someone with two needs is counted in the stricter
// group. Vegan dishes also suit vegetarians.
//
// The checker counts servings itself, from the vendors' menus, and never from a quote:
// a quote is only trusted for its price. Each serving feeds one person, so one dish that
// is both gluten-free and vegetarian cannot feed a person from each group.

/**
 * Minutes since midnight for "HH:MM", or NaN.
 */
export function minutes(time) {
  const match = /^(\d{2}):(\d{2})$/.exec(String(time));
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) {
    return NaN;
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

/**
 * "HH:MM" for minutes since midnight, clamped to the day.
 */
export function clock(total) {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, total));
  return `${String(Math.floor(clamped / 60)).padStart(2, "0")}:${String(clamped % 60).padStart(2, "0")}`;
}

function dollars(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}

function wholeBetween(value, low, high) {
  return Number.isInteger(value) && value >= low && value <= high;
}

/**
 * Find what is wrong with a mandate.
 *
 * :param m: The mandate.
 * :return: [{field, reason}], empty when it is sound.
 */
export function validateMandate(m) {
  const problems = [];
  const add = (field, reason) => problems.push({ field, reason });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(m?.date)) || Number.isNaN(Date.parse(`${m.date}T00:00:00Z`))) {
    add("date", "Give the day as YYYY-MM-DD.");
  }
  if (!wholeBetween(m?.headcount, 1, 500)) {
    add("headcount", "The headcount must be a whole number from 1 to 500.");
  }
  for (const field of ["vegetarian", "vegan", "glutenFree"]) {
    if (!wholeBetween(m?.[field], 0, 500)) {
      add(field, `${field} must be a whole number, 0 or more.`);
    }
  }
  if (Number.isInteger(m?.headcount) && Number.isInteger(m?.vegetarian) && Number.isInteger(m?.vegan) && m.vegetarian + m.vegan > m.headcount) {
    add("vegetarian", `${m.vegetarian} vegetarians and ${m.vegan} vegans are more than ${m.headcount} people.`);
  }
  if (Number.isInteger(m?.headcount) && Number.isInteger(m?.glutenFree) && m.glutenFree > m.headcount) {
    add("glutenFree", `${m.glutenFree} gluten-free people are more than ${m.headcount} people.`);
  } else if ([m?.headcount, m?.vegetarian, m?.vegan, m?.glutenFree].every(Number.isInteger)
    && m.vegetarian + m.vegan <= m.headcount && m.vegetarian + m.vegan + m.glutenFree > m.headcount) {
    add("glutenFree", `${m.vegetarian} vegetarians, ${m.vegan} vegans and ${m.glutenFree} gluten-free people are more than ${m.headcount} people. Count someone with two needs once, in the stricter group.`);
  }
  if (!wholeBetween(m?.budgetCents, 1, 100000000)) {
    add("budgetCents", "The budget must be more than $0.00.");
  }
  const from = minutes(m?.from);
  const to = minutes(m?.to);
  if (Number.isNaN(from)) {
    add("from", "Give the start of the window as HH:MM.");
  }
  if (Number.isNaN(to)) {
    add("to", "Give the end of the window as HH:MM.");
  } else if (!Number.isNaN(from) && to < from) {
    add("to", `The window ends at ${m.to}, before it starts at ${m.from}.`);
  }
  if (!wholeBetween(m?.flexMinutes, 0, 180)) {
    add("flexMinutes", "Flexibility must be 0 to 180 minutes.");
  }
  if (typeof m?.pickupAllowed !== "boolean") {
    add("pickupAllowed", "Say whether pickup is allowed: true or false.");
  }
  return problems;
}

/**
 * The most people the servings can feed, giving each person one serving that suits them.
 *
 * It is a maximum flow from the dishes, grouped by which diets they suit, to the four
 * groups of people. The graph has at most 8 + 4 nodes between source and sink.
 *
 * :param supply: Map of "vegan,vegetarian,gf" flags (as "101" etc.) to servings.
 * :param m: The mandate.
 * :return: The number of people fed.
 */
function feedable(supply, m) {
  const groups = [
    { need: m.vegan, suits: (f) => f[0] === "1" },
    { need: m.vegetarian, suits: (f) => f[1] === "1" },
    { need: m.glutenFree, suits: (f) => f[2] === "1" },
    { need: m.headcount - m.vegan - m.vegetarian - m.glutenFree, suits: () => true },
  ];
  const kinds = [...supply.keys()];
  const n = 2 + kinds.length + groups.length;
  const sink = n - 1;
  const cap = Array.from({ length: n }, () => new Array(n).fill(0));
  kinds.forEach((flags, i) => {
    cap[0][1 + i] = supply.get(flags);
    groups.forEach((group, j) => {
      if (group.suits(flags)) {
        cap[1 + i][1 + kinds.length + j] = Number.MAX_SAFE_INTEGER;
      }
    });
  });
  groups.forEach((group, j) => {
    cap[1 + kinds.length + j][sink] = Math.max(0, group.need);
  });
  let flow = 0;
  for (;;) {
    const prev = new Array(n).fill(-1);
    prev[0] = 0;
    const queue = [0];
    while (queue.length && prev[sink] === -1) {
      const u = queue.shift();
      for (let v = 0; v < n; v += 1) {
        if (prev[v] === -1 && cap[u][v] > 0) {
          prev[v] = u;
          queue.push(v);
        }
      }
    }
    if (prev[sink] === -1) {
      return flow;
    }
    let push = Number.MAX_SAFE_INTEGER;
    for (let v = sink; v !== 0; v = prev[v]) {
      push = Math.min(push, cap[prev[v]][v]);
    }
    for (let v = sink; v !== 0; v = prev[v]) {
      cap[prev[v]][v] -= push;
      cap[v][prev[v]] += push;
    }
    flow += push;
  }
}

/**
 * Check a plan against the mandate.
 *
 * :param plan: {orders: [{vendor, time, fulfilment, items, quote}]}; each quote is a
 *     vendor's request_quote result, trusted only for its price.
 * :param m: A sound mandate.
 * :param catalogs: The vendors' menus by vendor id, already checked with validateCatalog.
 * :return: {ok, problems, totalCents, slackCents}.
 */
export function checkPlan(plan, m, catalogs = {}) {
  const problems = [];
  const orders = Array.isArray(plan?.orders) ? plan.orders : [];
  if (!orders.length) {
    return { ok: false, problems: ["The plan has no orders."], totalCents: 0, slackCents: m.budgetCents };
  }
  let total = 0;
  // Servings by which diets they suit: flags "vegan, vegetarian, gluten-free" as "1"/"0".
  const supply = new Map();
  let servings = 0;
  const diet = { vegan: 0, vegetarian: 0, glutenFree: 0 };
  const earliest = minutes(m.from) - m.flexMinutes;
  const latest = minutes(m.to) + m.flexMinutes;
  for (const order of orders) {
    const quote = order?.quote;
    if (!quote || quote.ok !== true || !Number.isInteger(quote.totalCents) || quote.totalCents < 0) {
      problems.push(`The order with ${order?.vendor} has no usable quote.`);
    } else {
      total += quote.totalCents;
    }
    const catalog = catalogs[order?.vendor];
    if (!catalog || !Array.isArray(catalog.items)) {
      problems.push(`The order with ${order?.vendor} has no menu to check it against.`);
      continue;
    }
    for (const entry of Array.isArray(order.items) ? order.items : []) {
      const item = catalog.items.find((candidate) => candidate.id === entry?.id);
      if (!item) {
        problems.push(`${order.vendor} has no item "${String(entry?.id)}".`);
        continue;
      }
      if (!Number.isInteger(entry.qty) || entry.qty < 1) {
        problems.push(`The quantity of ${item.id} with ${order.vendor} must be a whole number of 1 or more.`);
        continue;
      }
      const count = item.serves * entry.qty;
      const vegan = item.diets.includes("vegan");
      const vegetarian = vegan || item.diets.includes("vegetarian");
      const gf = item.diets.includes("gluten-free");
      const flags = `${Number(vegan)}${Number(vegetarian)}${Number(gf)}`;
      supply.set(flags, (supply.get(flags) || 0) + count);
      servings += count;
      diet.vegan += vegan ? count : 0;
      diet.vegetarian += vegetarian ? count : 0;
      diet.glutenFree += gf ? count : 0;
    }
    const at = minutes(order.time);
    if (!(at >= earliest && at <= latest)) {
      problems.push(`${order.vendor} at ${order.time} is outside ${clock(earliest)} to ${clock(latest)}.`);
    }
    if (order.fulfilment === "pickup" && !m.pickupAllowed) {
      problems.push(`${order.vendor} is a pickup, and pickup is not allowed.`);
    }
  }
  const need = (have, people, label) => {
    if (have < people) {
      problems.push(`${have} ${label}servings for ${people} people: ${people - have} short.`);
      return true;
    }
    return false;
  };
  let short = need(servings, m.headcount, "");
  short = need(diet.vegetarian, m.vegetarian + m.vegan, "vegetarian ") || short;
  short = need(diet.vegan, m.vegan, "vegan ") || short;
  short = need(diet.glutenFree, m.glutenFree, "gluten-free ") || short;
  if (!short) {
    const fed = feedable(supply, m);
    if (fed < m.headcount) {
      problems.push(`With one serving each, ${m.headcount - fed} people would have nothing suitable: some dishes count for more than one diet group.`);
    }
  }
  if (total > m.budgetCents) {
    problems.push(`${dollars(total)} is ${dollars(total - m.budgetCents)} over the ${dollars(m.budgetCents)} budget.`);
  }
  return { ok: problems.length === 0, problems, totalCents: total, slackCents: m.budgetCents - total };
}
