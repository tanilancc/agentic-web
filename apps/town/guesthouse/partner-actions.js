// The actions the guesthouse offers other agent sites, through partner-desk/.
//
// Reads run in a hidden frame on the calling site. A booking runs only in a window of
// this site, where the runtime shows the visitor the request and its details, so the
// visitor confirms it here. The rules stay in js/reservation-book.js and js/stay-rules.js.
// A frame may see only part of this site's saved bookings, so the booking checks again.

import { GuesthouseData } from "./js/guesthouse-data.js";
import { ReservationBook } from "./js/reservation-book.js";
import { PARTNER_CALLERS } from "./partner-callers.js";

const DATE = { type: "string", format: "date", description: "A date as YYYY-MM-DD." };
const STAY = {
  checkIn: { ...DATE, description: "Arrival date, YYYY-MM-DD." },
  checkOut: { ...DATE, description: "Departure date, YYYY-MM-DD." },
  guests: { type: "integer", minimum: 1, maximum: 8, description: "Number of guests." },
};
const ROOM = { type: "string", enum: GuesthouseData.ROOMS.map((room) => room.id), description: "A room id from search_rooms." };

/**
 * The guesthouse's partner actions.
 */
export class PartnerActions {
  /**
   * Where bookings are kept. Undefined means the browser's localStorage. Tests set it.
   */
  static storage = undefined;

  /**
   * A book with the saved bookings.
   */
  static book() {
    return PartnerActions.storage === undefined ? new ReservationBook() : new ReservationBook(PartnerActions.storage);
  }

  /**
   * The site's first error message, as a refusal.
   */
  static refuse(errors) {
    return { ok: false, reason: String(Object.values(errors)[0] || "The guesthouse could not do that.") };
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
      name: "search_rooms",
      description: "Rooms free for a stay that fit the guests, each with its total price in cents (room, cleaning fee and tourist tax). Changes nothing.",
      effect: "read",
      availability: "bridge",
      inputSchema: { type: "object", additionalProperties: false, required: ["checkIn", "checkOut", "guests"], properties: STAY },
      execute: PartnerActions.searchRooms,
    });
    actions.register({
      ...shared,
      name: "quote_stay",
      description: "The total price in cents for one room and stay, or the guesthouse's reason it cannot be booked. Changes nothing.",
      effect: "read",
      availability: "bridge",
      inputSchema: { type: "object", additionalProperties: false, required: ["roomId", "checkIn", "checkOut", "guests"], properties: { roomId: ROOM, ...STAY } },
      execute: PartnerActions.quoteStay,
    });
    actions.register({
      ...shared,
      name: "place_booking",
      description: "Book a room. Runs in the guesthouse's own window, where the visitor confirms it. Refused when the price has changed since the quote (expectedTotalCents).",
      effect: "irreversible",
      availability: "top-level",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["roomId", "checkIn", "checkOut", "guests", "firstName", "lastName", "email", "arrival", "expectedTotalCents"],
        properties: {
          roomId: ROOM,
          ...STAY,
          firstName: { type: "string", minLength: 1, maxLength: 60 },
          lastName: { type: "string", minLength: 1, maxLength: 60 },
          email: { type: "string", minLength: 3, maxLength: 120 },
          phone: { type: "string", maxLength: 40 },
          arrival: { type: "string", enum: GuesthouseData.ARRIVAL_TIMES },
          expectedTotalCents: { type: "integer", minimum: 0 },
        },
      },
      execute: PartnerActions.placeBooking,
    });
  }

  static searchRooms(args) {
    const found = PartnerActions.book().search(args.checkIn, args.checkOut, args.guests);
    if (found.errors) {
      return PartnerActions.refuse(found.errors);
    }
    return {
      rooms: found.rooms.map((item) => ({
        roomId: item.room.id, name: item.room.name, maxGuests: item.room.maxGuests, totalCents: item.quote.total,
      })),
    };
  }

  static stayOf(args) {
    return { roomId: args.roomId, checkIn: args.checkIn, checkOut: args.checkOut, guests: args.guests, extras: [] };
  }

  static quoteStay(args) {
    const priced = PartnerActions.book().quote(PartnerActions.stayOf(args));
    if (priced.errors) {
      return PartnerActions.refuse(priced.errors);
    }
    const room = GuesthouseData.findById(GuesthouseData.ROOMS, args.roomId);
    return { roomId: room.id, name: room.name, checkIn: args.checkIn, checkOut: args.checkOut, guests: args.guests, totalCents: priced.quote.total };
  }

  static placeBooking(args) {
    const book = PartnerActions.book();
    const stay = PartnerActions.stayOf(args);
    const priced = book.quote(stay);
    if (priced.errors) {
      return PartnerActions.refuse(priced.errors);
    }
    if (priced.quote.total !== args.expectedTotalCents) {
      return { ok: false, reason: `The price is now $${(priced.quote.total / 100).toFixed(2)}, not $${(args.expectedTotalCents / 100).toFixed(2)}. Nothing was booked.` };
    }
    const placed = book.place(stay, {
      firstName: args.firstName, lastName: args.lastName, email: args.email, phone: args.phone || "", arrival: args.arrival, requests: "",
    });
    if (placed.errors) {
      return PartnerActions.refuse(placed.errors);
    }
    return { ok: true, code: placed.booking.code, totalCents: placed.booking.quote.total };
  }
}

// The runtime calls the module's registerActions export.
export const registerActions = PartnerActions.registerActions;
