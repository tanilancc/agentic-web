// The partner sites the Concierge works with, and how each one's answers become legs of
// the itinerary. Prices, names and times always come from the partner's own quote.
//
// To add a partner: it publishes partner-desk/ and lists this site's origin in its
// partner-callers.js; then add an entry here with its quote and booking actions.

import { pickOrigin } from "../shared/site-origin.js";

/**
 * Add minutes to a local time "YYYY-MM-DDTHH:MM".
 *
 * :param at: The start.
 * :param minutes: Minutes to add.
 * :return: The end, in the same form.
 */
export function addMinutes(at, minutes) {
  const time = new Date(`${at}:00Z`);
  time.setUTCMinutes(time.getUTCMinutes() + minutes);
  return time.toISOString().slice(0, 16);
}

const GUESTHOUSE = pickOrigin("http://127.0.0.1:8080", "https://oaw-tidewhistle.pages.dev");
const HARBOR_TOURS = pickOrigin("http://localhost:8081", "https://oaw-harbor-tours.pages.dev");

/**
 * The partners. Each publishes its partner desk at its own address.
 */
export const PARTNERS = [
  {
    id: "guesthouse",
    label: "Tidewhistle Guesthouse",
    origin: GUESTHOUSE,
    bridgeUrl: `${GUESTHOUSE}/partner-desk/action-bridge.html`,
    page: `${GUESTHOUSE}/`,
    offers: "Rooms for overnight stays.",
    quoteAction: "quote_stay",
    commitAction: "place_booking",
    // Fields the booking needs that are neither in the quote nor on the contact card.
    extraFields: ["arrival"],
    quoteArgs: (args) => ({ roomId: args.roomId, checkIn: args.checkIn, checkOut: args.checkOut, guests: args.guests }),
    toLeg: (quote) => ({
      kind: "stay",
      title: String(quote.name),
      start: `${quote.checkIn}T15:00`,
      end: `${quote.checkOut}T11:00`,
      partySize: quote.guests,
      totalCents: quote.totalCents,
    }),
    commitArgs: (args, card) => ({
      roomId: args.roomId, checkIn: args.checkIn, checkOut: args.checkOut, guests: args.guests, arrival: args.arrival,
      firstName: card.firstName, lastName: card.lastName, email: card.email, ...(card.phone ? { phone: card.phone } : {}),
    }),
  },
  {
    id: "harbor_tours",
    label: "Marrow Point Harbor Tours",
    origin: HARBOR_TOURS,
    bridgeUrl: `${HARBOR_TOURS}/partner-desk/action-bridge.html`,
    page: `${HARBOR_TOURS}/`,
    offers: "Boat trips and walks around the harbor.",
    quoteAction: "quote_trip",
    commitAction: "reserve_trip",
    extraFields: [],
    quoteArgs: (args) => ({ tourId: args.tourId, date: args.date, time: args.time, adults: args.adults, children: args.children }),
    toLeg: (quote) => ({
      kind: "trip",
      title: String(quote.name),
      start: `${quote.date}T${quote.time}`,
      end: addMinutes(`${quote.date}T${quote.time}`, quote.minutes),
      partySize: quote.adults + quote.children,
      totalCents: quote.totalCents,
    }),
    commitArgs: (args, card) => ({
      tourId: args.tourId, date: args.date, time: args.time, adults: args.adults, children: args.children,
      firstName: card.firstName, lastName: card.lastName, email: card.email, phone: card.phone,
    }),
  },
];
