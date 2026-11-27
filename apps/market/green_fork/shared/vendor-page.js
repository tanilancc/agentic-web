// A market vendor's own page: its menu, its rules, and the orders it has received. The
// orders list shows that an order placed from Quorum really reached the vendor.

import { SavedOrders } from "./vendor-desk.js";

function dollars(cents) {
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

/**
 * Draw the page.
 *
 * :param doc: The document, with #menu, #rules and #orders.
 * :param catalog: The vendor's catalog.
 * :param storage: Where orders are kept.
 */
export function renderVendorPage(doc, catalog, storage = SavedOrders.defaultStorage()) {
  const menu = doc.getElementById("menu");
  const list = el(doc, "ul", "menu");
  for (const item of catalog.items) {
    const row = el(doc, "li", "menu-item");
    row.append(
      el(doc, "span", "menu-name", item.name),
      el(doc, "span", "menu-price", dollars(item.priceCents)),
      el(doc, "span", "menu-meta", `Serves ${item.serves}${item.diets.length ? ` · ${item.diets.join(", ")}` : ""}`),
    );
    list.append(row);
  }
  menu.replaceChildren(list);

  const rules = [
    `Orders from ${catalog.hours.from} to ${catalog.hours.to}, every ${catalog.slotMinutes} minutes, with ${catalog.delivery.leadMinutes} minutes' notice.`,
    `Minimum order ${dollars(catalog.minOrderCents)}. Delivery ${dollars(catalog.delivery.feeCents)}, free over ${dollars(catalog.delivery.freeOverCents)}.`,
    ...catalog.tiers.map((tier) => `${tier.discountPct}% off ${tier.minItems} or more items.`),
    ...(catalog.offPeak ? [`${catalog.offPeak.discountPct}% off from ${catalog.offPeak.from} to ${catalog.offPeak.to}.`] : []),
    ...(catalog.pickup?.discountPct ? [`${catalog.pickup.discountPct}% off for pickup.`] : []),
  ];
  const rulesList = el(doc, "ul", "rules");
  for (const rule of rules) {
    rulesList.append(el(doc, "li", "", rule));
  }
  doc.getElementById("rules").replaceChildren(rulesList);

  const orders = SavedOrders.load(storage, catalog.id);
  const ordersRoot = doc.getElementById("orders");
  if (!orders.length) {
    ordersRoot.replaceChildren(el(doc, "p", "empty", "No orders yet."));
    return;
  }
  const ordersList = el(doc, "ul", "orders");
  for (const order of orders) {
    const items = order.order.items.map((entry) => `${entry.qty} × ${catalog.items.find((item) => item.id === entry.id)?.name || entry.id}`).join(", ");
    ordersList.append(el(doc, "li", "order", `${order.code}: ${order.order.date} ${order.order.time}, ${order.order.fulfilment}, ${items}. ${dollars(order.totalCents)}. For ${order.contact.firstName} ${order.contact.lastName}.`));
  }
  ordersRoot.replaceChildren(ordersList);
}
