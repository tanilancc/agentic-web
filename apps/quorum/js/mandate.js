// The visitor's mandate, and the checker that decides whether a plan meets it. The
// checker is the only thing that may call a plan acceptable: not a model, and not a
// vendor. Every problem it finds names the shortfall with numbers.
//
// A mandate is {date, headcount, vegetarian, vegan, glutenFree, budgetCents, from, to,
// flexMinutes, pickupAllowed}. vegetarian counts people who are vegetarian but not
// vegan; vegan dishes also count as vegetarian.

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
 * Check a plan against the mandate.
 *
 * :param plan: {orders: [{vendor, time, fulfilment, items, quote}]}; each quote is a
 *     vendor's request_quote result.
 * :param m: A sound mandate.
 * :return: {ok, problems, totalCents, slackCents}.
 */
export function checkPlan(plan, m) {
  const problems = [];
  const orders = Array.isArray(plan?.orders) ? plan.orders : [];
  if (!orders.length) {
    return { ok: false, problems: ["The plan has no orders."], totalCents: 0, slackCents: m.budgetCents };
  }
  let total = 0;
  let servings = 0;
  const diet = { vegetarian: 0, vegan: 0, "gluten-free": 0 };
  const earliest = minutes(m.from) - m.flexMinutes;
  const latest = minutes(m.to) + m.flexMinutes;
  for (const order of orders) {
    const quote = order.quote;
    if (!quote || quote.ok === false || !Number.isInteger(quote.totalCents)) {
      problems.push(`The order with ${order.vendor} has no quote.`);
      continue;
    }
    total += quote.totalCents;
    servings += quote.servings;
    for (const key of Object.keys(diet)) {
      diet[key] += quote.dietServings?.[key] || 0;
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
    }
  };
  need(servings, m.headcount, "");
  need(diet.vegetarian, m.vegetarian + m.vegan, "vegetarian ");
  need(diet.vegan, m.vegan, "vegan ");
  need(diet["gluten-free"], m.glutenFree, "gluten-free ");
  if (total > m.budgetCents) {
    problems.push(`${dollars(total)} is ${dollars(total - m.budgetCents)} over the ${dollars(m.budgetCents)} budget.`);
  }
  return { ok: problems.length === 0, problems, totalCents: total, slackCents: m.budgetCents - total };
}
