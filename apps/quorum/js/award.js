// The award: the orders of the plan the visitor chose, and what happened to each.
// An order is saved as "booking" before it is sent; one found that way after a reload
// may have been placed, so it comes back as "unknown" and is never sent again.

const STATUSES = ["planned", "booking", "booked", "refused", "declined", "unknown"];

/**
 * The orders being placed.
 */
export class Award {
  constructor() {
    this.date = "";
    this.orders = [];
  }

  /**
   * Start an award from a plan's orders.
   *
   * :param orders: [{vendor, time, fulfilment, items, totalCents}].
   * :param date: The day of the orders.
   */
  start(orders, date) {
    this.date = date;
    this.orders = orders.map((order) => ({ ...order, status: "planned" }));
  }

  /**
   * Change an order's status, code or reason.
   */
  update(index, fields) {
    if (this.orders[index]) {
      Object.assign(this.orders[index], fields);
    }
  }

  list() {
    return this.orders.map((order) => ({ ...order }));
  }

  total() {
    return this.orders.reduce((sum, order) => sum + order.totalCents, 0);
  }

  /**
   * Whether this award still holds orders that are planned, being placed, placed or
   * uncertain: then a new award would risk ordering twice.
   */
  active() {
    return this.orders.some((order) => !["refused", "declined"].includes(order.status));
  }

  toJSON() {
    return { date: this.date, orders: this.orders };
  }

  /**
   * Rebuild a saved award, dropping orders of the wrong shape.
   */
  static fromJSON(data) {
    const award = new Award();
    award.date = typeof data?.date === "string" ? data.date : "";
    const orders = Array.isArray(data?.orders) ? data.orders : [];
    award.orders = orders.filter((order) => order && typeof order.vendor === "string" && STATUSES.includes(order.status)
      && Number.isInteger(order.totalCents) && Array.isArray(order.items) && typeof order.time === "string");
    for (const order of award.orders) {
      if (order.status === "booking") {
        order.status = "unknown";
        order.reason = "The page closed while this order was being sent, so it may have been placed. Check with the vendor before ordering again.";
      }
    }
    return award;
  }
}
