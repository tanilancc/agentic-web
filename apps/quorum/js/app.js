// The Quorum page: the mandate form, the plans, the orders, and the partner desk the
// assistant's tools use. site.js boots the runtime; the tools find this page through
// window.quorum.

import { ActionBridgeClient } from "../runtime/action-transport.js";
import { validateData } from "../runtime/actions.js";
import { ContactCard } from "../shared/contact-card.js";
import { PartnerDesk } from "../shared/partner-desk.js";
import { Award } from "./award.js";
import { checkPlan, validateMandate } from "./mandate.js";
import { dollars, PlanView } from "./plan-view.js";
import { VENDORS } from "./vendors.js";

const NUMBER_FIELDS = ["headcount", "vegetarian", "vegan", "glutenFree", "flexMinutes"];

function storage() {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function field(form, name) {
  return [...(form?.querySelectorAll("input") || [])].find((input) => input.getAttribute("name") === name) ?? null;
}

/**
 * A first mandate: a team dinner nine days from today.
 */
export function defaultMandate(today = new Date()) {
  const day = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate() + 9));
  return { date: day.toISOString().slice(0, 10), headcount: 30, vegetarian: 6, vegan: 3, glutenFree: 4, budgetCents: 80000, from: "17:00", to: "18:00", flexMinutes: 30, pickupAllowed: false };
}

/**
 * Drives the page.
 */
export class QuorumApp {
  static MANDATE_KEY = "quorum-mandate-v1";
  static AWARD_KEY = "quorum-award-v1";
  static PAST_KEY = "quorum-past-awards-v1";

  /**
   * :param doc: The document, with #mandate-form, #mandate-problems, #plans and #contact-card.
   * :param store: localStorage, or null.
   * :param engine: Returns the runtime's engine once it has booted, or null.
   */
  constructor({ doc = document, store = storage(), engine = () => globalThis.__nsweb?.engine || null } = {}) {
    this.doc = doc;
    this.store = store;
    this.engine = engine;
    this.mandate = this.load(QuorumApp.MANDATE_KEY, null) || defaultMandate();
    if (validateMandate(this.mandate).length) {
      this.mandate = defaultMandate();
    }
    this.award = Award.fromJSON(this.load(QuorumApp.AWARD_KEY, null));
    this.search = null;
    this.mandateChanged = false;
    this.view = new PlanView(doc.getElementById("plans"), doc);
    this.contact = new ContactCard(doc.getElementById("contact-card"), store);
    this.form = doc.getElementById("mandate-form");
    this.desk = new PartnerDesk({
      partners: VENDORS,
      consent: (info) => {
        const engine = this.engine();
        return engine ? engine.requestConsent(info) : Promise.resolve("decline");
      },
      ClientClass: ActionBridgeClient,
      validate: validateData,
    });
    this.fillForm();
    doc.getElementById("new-award")?.addEventListener("click", () => this.newAward());
    this.form?.addEventListener("change", () => this.readForm());
    this.form?.addEventListener("submit", (event) => {
      event.preventDefault();
      this.readForm();
    });
    this.render();
  }

  load(key, fallback) {
    try {
      return JSON.parse(this.store?.getItem(key) || "null") ?? fallback;
    } catch {
      return fallback;
    }
  }

  /**
   * Save the mandate and the award, and redraw.
   */
  save() {
    try {
      this.store?.setItem(QuorumApp.MANDATE_KEY, JSON.stringify(this.mandate));
      this.store?.setItem(QuorumApp.AWARD_KEY, JSON.stringify(this.award));
    } catch {
      // Storage blocked: everything still holds for this visit.
    }
    this.fillForm();
    this.render();
  }

  fillForm() {
    if (!this.form) {
      return;
    }
    for (const name of ["date", "from", "to", ...NUMBER_FIELDS]) {
      const input = field(this.form, name);
      if (input) {
        input.value = String(this.mandate[name]);
      }
    }
    const budget = field(this.form, "budget");
    if (budget) {
      budget.value = String(this.mandate.budgetCents / 100);
    }
    const pickup = field(this.form, "pickupAllowed");
    if (pickup) {
      pickup.checked = this.mandate.pickupAllowed;
    }
  }

  /**
   * Take the form's values. A mandate that makes no sense is shown with its problems and
   * not kept.
   */
  readForm() {
    const next = { ...this.mandate };
    for (const name of ["date", "from", "to"]) {
      next[name] = String(field(this.form, name)?.value ?? next[name]).trim();
    }
    for (const name of NUMBER_FIELDS) {
      next[name] = Number(field(this.form, name)?.value);
    }
    next.budgetCents = Math.round(Number(field(this.form, "budget")?.value) * 100);
    next.pickupAllowed = !!field(this.form, "pickupAllowed")?.checked;
    const problems = validateMandate(next);
    const out = this.doc.getElementById("mandate-problems");
    out?.replaceChildren(...problems.map((problem) => {
      const item = this.doc.createElement("li");
      item.textContent = problem.reason;
      return item;
    }));
    if (!problems.length) {
      this.setMandate(next);
      this.save();
    }
    return problems;
  }

  /**
   * Change the mandate. Plans found for the old rules are dropped, never shown as best.
   */
  setMandate(next) {
    if (JSON.stringify(next) !== JSON.stringify(this.mandate)) {
      this.search = null;
      this.mandateChanged = true;
    }
    this.mandate = next;
  }

  /**
   * Start a new order, once the last one is finished. Only the visitor can do this, with
   * the page's button: the assistant cannot order twice. The finished order is kept.
   *
   * :return: True when a new order was started.
   */
  newAward() {
    if (!this.award.list().length || !this.award.finished()) {
      return false;
    }
    const past = this.load(QuorumApp.PAST_KEY, []);
    past.push(this.award.toJSON());
    try {
      this.store?.setItem(QuorumApp.PAST_KEY, JSON.stringify(Array.isArray(past) ? past.slice(-20) : [this.award.toJSON()]));
    } catch {
      // Storage blocked: the visitor still starts again.
    }
    this.award = new Award();
    this.save();
    return true;
  }

  render() {
    this.view.show(this.search, this.award.list(), { mandateChanged: this.mandateChanged });
  }

  /**
   * What the assistant's tools work on.
   */
  actionContext() {
    return {
      desk: this.desk,
      getMandate: () => ({ ...this.mandate }),
      setMandate: (m) => this.setMandate(m),
      getSearch: () => this.search,
      setSearch: (s) => {
        this.search = s;
        if (s) {
          this.mandateChanged = false;
        }
      },
      award: () => this.award,
      card: () => this.contact.card(),
      save: () => this.save(),
    };
  }

  /**
   * The details of the "Place these orders?" dialog, or the reason not to open it.
   *
   * :param planIndex: The plan number.
   * :return: Details by label, or {refusal}.
   */
  reviewAward(planIndex) {
    const plan = this.search?.plans?.[planIndex];
    if (!plan) {
      return { refusal: `No plan ${planIndex}. Run find_best_plan first.` };
    }
    const check = checkPlan({ orders: plan.orders }, this.mandate, this.search.catalogs || {});
    if (!check.ok) {
      return { refusal: `Plan ${planIndex} does not meet the mandate: ${check.problems.join(" ")}` };
    }
    if (this.award.list().length) {
      return { refusal: "The last order's results stand. Start a new order on the page first." };
    }
    const card = this.contact.card();
    const missing = ["firstName", "lastName", "email", "phone"].filter((name) => !String(card[name] || "").trim());
    if (missing.length) {
      return { refusal: `The contact card on the page is missing: ${missing.join(", ")}. Ask the visitor to fill it in.` };
    }
    // Keyed by order number, never by a vendor's own words.
    const details = {};
    plan.orders.forEach((order, index) => {
      const vendor = VENDORS.find((item) => item.id === order.vendor)?.label || order.vendor;
      details[`Order ${index + 1}: ${vendor}`] = `${this.mandate.date} ${order.time}, ${order.fulfilment}: ${order.quote.lines.map((line) => `${line.qty} × ${line.name}`).join(", ")}. ${dollars(order.quote.totalCents)}`;
    });
    details.Total = dollars(check.totalCents);
    details["Ordered for"] = `${card.firstName} ${card.lastName}, ${card.email}, ${card.phone}`;
    return details;
  }
}

if (typeof window !== "undefined" && typeof document !== "undefined" && document.getElementById("plans")) {
  window.quorum = new QuorumApp();
}
