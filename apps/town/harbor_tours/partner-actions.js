// The actions the tour site offers other agent sites, through partner-desk/.
//
// Reads run in a hidden frame on the calling site. A reservation runs only in a window of
// this site, where the visitor confirms it. The rules stay in js/trip-book.js and
// js/trip-rules.js. A frame may see only part of this site's saved reservations, so the
// reservation checks again.

import { TourData } from "./js/tour-data.js";
import { TripBook } from "./js/trip-book.js";
import { PARTNER_CALLERS } from "./partner-callers.js";

const PARTY = {
  adults: { type: "integer", minimum: 0, maximum: 12, description: "Adults and children over 12." },
  children: { type: "integer", minimum: 0, maximum: 12, description: "Children aged 4 to 12." },
};
const DATE = { type: "string", format: "date", description: "The trip's date, YYYY-MM-DD." };
const TRIP = {
  tourId: { type: "string", enum: TourData.TOURS.map((tour) => tour.id), description: "A tour id from find_departures." },
  date: DATE,
  time: { type: "string", maxLength: 5, description: "The departure time from find_departures, such as 10:00." },
  ...PARTY,
};

/**
 * The tour site's partner actions.
 */
export class PartnerActions {
  /**
   * Where reservations are kept. Undefined means the browser's localStorage. Tests set it.
   */
  static storage = undefined;

  static book() {
    return PartnerActions.storage === undefined ? new TripBook() : new TripBook(PartnerActions.storage);
  }

  static refuse(errors) {
    return { ok: false, reason: String(Object.values(errors)[0] || "The tour site could not do that.") };
  }

  static tripOf(args) {
    return { tourId: args.tourId, date: args.date, time: args.time, adults: args.adults, children: args.children, under4s: 0 };
  }

  /**
   * Register every partner action.
   *
   * :param actions: The runtime registry facade.
   */
  static registerActions(actions) {
    const shared = { callerOrigins: PARTNER_CALLERS };
    actions.register({
      ...shared,
      name: "find_departures",
      description: "Departures on a date that have room for the party, each with the tour's name, length in minutes, places left and total price in cents. Changes nothing.",
      effect: "read",
      availability: "bridge",
      inputSchema: { type: "object", additionalProperties: false, required: ["date", "adults", "children"], properties: { date: DATE, ...PARTY } },
      execute: PartnerActions.findDepartures,
    });
    actions.register({
      ...shared,
      name: "quote_trip",
      description: "The total price in cents for one departure and party, or the tour site's reason it cannot be booked. Changes nothing.",
      effect: "read",
      availability: "bridge",
      inputSchema: { type: "object", additionalProperties: false, required: ["tourId", "date", "time", "adults", "children"], properties: TRIP },
      execute: PartnerActions.quoteTrip,
    });
    actions.register({
      ...shared,
      name: "reserve_trip",
      description: "Reserve one departure. Runs in the tour site's own window, where the visitor confirms it. Refused when the price has changed since the quote (expectedTotalCents).",
      effect: "irreversible",
      availability: "top-level",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["tourId", "date", "time", "adults", "children", "firstName", "lastName", "email", "phone", "expectedTotalCents"],
        properties: {
          ...TRIP,
          firstName: { type: "string", minLength: 1, maxLength: 60 },
          lastName: { type: "string", minLength: 1, maxLength: 60 },
          email: { type: "string", minLength: 3, maxLength: 120 },
          phone: { type: "string", maxLength: 40 },
          expectedTotalCents: { type: "integer", minimum: 0 },
        },
      },
      execute: PartnerActions.reserveTrip,
    });
  }

  static findDepartures(args) {
    const found = PartnerActions.book().departures(args.date, { adults: args.adults, children: args.children, under4s: 0 });
    if (found.errors) {
      return PartnerActions.refuse(found.errors);
    }
    return {
      departures: found.departures.filter((departure) => !departure.problem).map((departure) => {
        const tour = TourData.findById(TourData.TOURS, departure.tourId);
        return {
          tourId: tour.id, name: tour.name, date: departure.date, time: departure.time,
          minutes: tour.minutes, placesLeft: departure.placesLeft, totalCents: departure.quote.total,
        };
      }),
    };
  }

  static quoteTrip(args) {
    const priced = PartnerActions.book().quote(PartnerActions.tripOf(args));
    if (priced.errors) {
      return PartnerActions.refuse(priced.errors);
    }
    const tour = TourData.findById(TourData.TOURS, args.tourId);
    return { tourId: tour.id, name: tour.name, date: args.date, time: args.time, minutes: tour.minutes, adults: args.adults, children: args.children, totalCents: priced.quote.total };
  }

  static reserveTrip(args) {
    const book = PartnerActions.book();
    const trip = PartnerActions.tripOf(args);
    const priced = book.quote(trip);
    if (priced.errors) {
      return PartnerActions.refuse(priced.errors);
    }
    if (priced.quote.total !== args.expectedTotalCents) {
      return { ok: false, reason: `The price is now $${(priced.quote.total / 100).toFixed(2)}, not $${(args.expectedTotalCents / 100).toFixed(2)}. Nothing was reserved.` };
    }
    const made = book.reserve([trip], { firstName: args.firstName, lastName: args.lastName, email: args.email, phone: args.phone });
    if (made.errors) {
      return PartnerActions.refuse(made.errors);
    }
    return { ok: true, code: made.reservation.code, totalCents: priced.quote.total };
  }
}

// The runtime calls the module's registerActions export.
export const registerActions = PartnerActions.registerActions;
