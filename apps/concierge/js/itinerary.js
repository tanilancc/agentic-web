// The visitor's trip: the legs they planned, each from one partner site, and what is
// wrong with the plan. Times are local wall-clock times as "YYYY-MM-DDTHH:MM", compared
// as text, so no time zone is involved.

const KINDS = ["stay", "trip"];
const STATUSES = ["planned", "booked", "refused", "declined", "unknown"];
const INACTIVE = ["refused", "declined"];

/**
 * A planned trip.
 */
export class Itinerary {
  constructor() {
    this.items = [];
    this.next = 1;
  }

  /**
   * Add a leg.
   *
   * :param item: {partner, kind, title, start, end, partySize, totalCents, commit}.
   * :return: The new leg's id.
   */
  add(item) {
    const id = `leg-${this.next++}`;
    this.items.push({ ...item, id, status: "planned" });
    return id;
  }

  /**
   * Remove a leg.
   *
   * :param id: The leg's id.
   * :return: True when a leg was removed.
   */
  remove(id) {
    const before = this.items.length;
    this.items = this.items.filter((item) => item.id !== id);
    return this.items.length < before;
  }

  /**
   * Change a leg's status, code or reason.
   *
   * :param id: The leg's id.
   * :param fields: {status, code, reason}.
   */
  update(id, fields) {
    const item = this.items.find((leg) => leg.id === id);
    if (item) {
      Object.assign(item, fields);
    }
  }

  /**
   * The legs, in time order.
   *
   * :return: Copies of the legs.
   */
  list() {
    return this.items.map((item) => ({ ...item })).sort((a, b) => a.start.localeCompare(b.start) || a.id.localeCompare(b.id));
  }

  /**
   * The legs still in the plan: not refused or declined.
   */
  active() {
    return this.list().filter((item) => !INACTIVE.includes(item.status));
  }

  /**
   * The total of the active legs, in cents.
   */
  total() {
    return this.active().reduce((sum, item) => sum + item.totalCents, 0);
  }

  /**
   * What is wrong with the plan.
   *
   * :param now: The current local time as "YYYY-MM-DDTHH:MM".
   * :return: [{ids, message}].
   */
  conflicts(now) {
    const found = [];
    const legs = this.active();
    const trips = legs.filter((item) => item.kind === "trip");
    const stays = legs.filter((item) => item.kind === "stay");
    for (const item of legs) {
      if (item.start < now) {
        found.push({ ids: [item.id], message: `${item.title} is in the past.` });
      }
    }
    for (let i = 0; i < trips.length; i += 1) {
      for (let j = i + 1; j < trips.length; j += 1) {
        const [a, b] = [trips[i], trips[j]];
        if (a.start < b.end && b.start < a.end) {
          found.push({ ids: [a.id, b.id], message: `${a.title} and ${b.title} overlap.` });
        }
      }
    }
    if (stays.length) {
      const guests = Math.max(...stays.map((item) => item.partySize));
      for (const item of trips) {
        const day = item.start.slice(0, 10);
        const covered = stays.some((s) => s.start.slice(0, 10) <= day && day <= s.end.slice(0, 10));
        if (!covered) {
          found.push({ ids: [item.id], message: `${item.title} on ${day} is not during your stay.` });
        }
        if (item.partySize > guests) {
          found.push({ ids: [item.id], message: `${item.title} has more people than the stay (${item.partySize} and ${guests}).` });
        }
      }
    }
    return found;
  }

  toJSON() {
    return { items: this.items, next: this.next };
  }

  /**
   * Rebuild a plan saved with toJSON, dropping legs of the wrong shape.
   *
   * :param data: The saved value.
   * :return: The Itinerary.
   */
  static fromJSON(data) {
    const plan = new Itinerary();
    const items = Array.isArray(data?.items) ? data.items : [];
    plan.items = items.filter((item) => item && typeof item === "object" && typeof item.id === "string"
      && KINDS.includes(item.kind) && STATUSES.includes(item.status)
      && typeof item.start === "string" && typeof item.end === "string" && typeof item.title === "string"
      && Number.isInteger(item.totalCents) && Number.isInteger(item.partySize));
    const highest = plan.items.reduce((max, item) => Math.max(max, Number(item.id.replace("leg-", "")) || 0), 0);
    plan.next = Math.max(Number(data?.next) || 1, highest + 1);
    return plan;
  }
}
