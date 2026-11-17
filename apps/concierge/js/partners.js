// The partner sites the Concierge works with, and how each one's answers become legs of
// the itinerary. Prices, names and times always come from the partner's own quote.
//
// To add a partner: it publishes partner-desk/ and lists this site's origin in its
// partner-callers.js; then add an entry here with its quote and booking actions.

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

/**
 * The partners, with the local addresses used in development. Change the origins to the
 * deployed https addresses when the town is hosted.
 */
export const PARTNERS = [
  {
    id: "guesthouse",
    label: "Tidewhistle Guesthouse",
    origin: "http://127.0.0.1:8080",
    bridgeUrl: "http://127.0.0.1:8080/partner-desk/action-bridge.html",
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
    origin: "http://localhost:8081",
    bridgeUrl: "http://localhost:8081/partner-desk/action-bridge.html",
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
