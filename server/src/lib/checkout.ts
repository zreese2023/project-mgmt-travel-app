import type pg from 'pg';
import { isIsoDate, isoDateOf, todayIso } from './dates.js';
import type { Queryable } from './db.js';
import { withTransaction } from './db.js';
import { badRequest, notFound } from './errors.js';
import { FLIGHT_COLUMNS, toFlight, type Flight, type FlightRow } from './flights.js';
import { validateStay } from './hotels.js';
import type { ItineraryItem } from './itinerary.js';
import { soldOut } from './payments.js';
import {
  flightLegPrice,
  hotelBill,
  MAX_CHECKED_BAGS,
  ROOM_REQUESTS,
  type FlightLegPrice,
  type HotelBill,
  type RoomRequest,
} from './pricing.js';
import { fromCents, toCents } from './money.js';
import { addItemTx } from './trips.js';

/**
 * Checkout for flights (SCRUM-15) and hotels (SCRUM-16). Booking adds the flight or stay to one of
 * the user's trips together with the details entered at checkout; the trip is then paid for as a
 * whole by `payForTrip`. Prices always come from the database, never from the client.
 */

export const SEAT_PREFERENCES = ['no_preference', 'window', 'aisle', 'middle'] as const;
export type SeatPreference = (typeof SEAT_PREFERENCES)[number];
export const MAX_PASSENGERS = 9;
export const MAX_ROOMS = 4;
/** At least one passenger must be this old on the day of departure. */
export const ADULT_AGE = 18;

export interface Passenger {
  fullName: string;
  dateOfBirth: string;
  seat: SeatPreference;
  checkedBags: number;
}

export interface FlightCheckoutInput {
  /** The outbound flight, then the return flight for a round trip. */
  flightIds: number[];
  passengers: Passenger[];
}

export interface FlightQuote {
  legs: Array<{ flight: Flight; price: FlightLegPrice }>;
  passengers: Passenger[];
  total: number;
}

export interface GuestContact {
  fullName: string;
  email: string;
  phone: string;
}

export interface HotelCheckoutInput {
  hotelId: number;
  roomTypeId: number;
  checkIn: string;
  checkOut: string;
  rooms: number;
  guests: number;
  requests?: string[] | undefined;
}

export interface HotelQuote {
  hotel: { id: number; name: string; address: string; destinationName: string };
  room: { id: number; name: string; capacity: number; nightlyPrice: number };
  checkIn: string;
  checkOut: string;
  guests: number;
  requests: RoomRequest[];
  bill: HotelBill;
}

const NAME_LENGTH = { min: 2, max: 100 };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+?[\d\s().-]+$/;

/** Whole years from `dateOfBirth` to `on`, both ISO dates. */
export function ageOn(dateOfBirth: string, on: string): number {
  const years = Number(on.slice(0, 4)) - Number(dateOfBirth.slice(0, 4));
  return on.slice(5) < dateOfBirth.slice(5) ? years - 1 : years;
}

function validateName(value: string, field: string, details: Record<string, string>): string {
  const name = value.trim().replace(/\s+/g, ' ');
  if (name.length < NAME_LENGTH.min || name.length > NAME_LENGTH.max) {
    details[field] = `Enter a full name of ${NAME_LENGTH.min} to ${NAME_LENGTH.max} characters`;
  }
  return name;
}

/**
 * Checks every passenger and returns them with tidied names. Errors are keyed by position, e.g.
 * `passengers.1.dateOfBirth`, so the form can show each next to its field.
 */
export function validatePassengers(
  passengers: readonly Passenger[],
  departureDay: string,
  today: string = todayIso(),
): Passenger[] {
  const details: Record<string, string> = {};
  if (passengers.length < 1 || passengers.length > MAX_PASSENGERS) {
    throw badRequest('Invalid passengers', {
      passengers: `Add between 1 and ${MAX_PASSENGERS} passengers`,
    });
  }
  const tidied = passengers.map((p, i) => {
    const key = `passengers.${i}`;
    const fullName = validateName(p.fullName, `${key}.fullName`, details);
    if (!isIsoDate(p.dateOfBirth) || p.dateOfBirth < '1900-01-01') {
      details[`${key}.dateOfBirth`] = 'Enter a date of birth (YYYY-MM-DD)';
    } else if (p.dateOfBirth > today) {
      details[`${key}.dateOfBirth`] = 'Date of birth cannot be in the future';
    }
    if (!(SEAT_PREFERENCES as readonly string[]).includes(p.seat)) {
      details[`${key}.seat`] = 'Choose a seat preference';
    }
    if (!Number.isInteger(p.checkedBags) || p.checkedBags < 0 || p.checkedBags > MAX_CHECKED_BAGS) {
      details[`${key}.checkedBags`] = `Choose 0 to ${MAX_CHECKED_BAGS} checked bags`;
    }
    return { ...p, fullName };
  });
  const datesValid = passengers.every((_, i) => !details[`passengers.${i}.dateOfBirth`]);
  if (datesValid && !passengers.some((p) => ageOn(p.dateOfBirth, departureDay) >= ADULT_AGE)) {
    details.passengers = `At least one passenger must be ${ADULT_AGE} or older on the day of travel`;
  }
  if (Object.keys(details).length > 0) throw badRequest('Check the passenger details', details);
  return tidied;
}

export function validateGuest(guest: GuestContact): GuestContact {
  const details: Record<string, string> = {};
  const fullName = validateName(guest.fullName, 'fullName', details);
  const email = guest.email.trim().toLowerCase();
  if (!EMAIL.test(email)) details.email = 'Enter a valid email address';
  const phone = guest.phone.trim();
  const digits = phone.replace(/\D/g, '').length;
  if (!PHONE.test(phone) || digits < 7 || digits > 15) {
    details.phone = 'Enter a phone number of 7 to 15 digits';
  }
  if (Object.keys(details).length > 0) throw badRequest('Check the guest details', details);
  return { fullName, email, phone };
}

export function validateRequests(requests: readonly string[] = []): RoomRequest[] {
  const unknown = requests.filter((r) => !(ROOM_REQUESTS as readonly string[]).includes(r));
  if (unknown.length > 0) {
    throw badRequest('Unknown room request', {
      requests: `Unknown request: ${unknown.join(', ')}`,
    });
  }
  return [...new Set(requests as RoomRequest[])];
}

/** Prices the selected flights for the passengers; nothing is stored. */
export async function quoteFlights(
  db: Queryable,
  input: FlightCheckoutInput,
  today: string = todayIso(),
): Promise<FlightQuote> {
  const { flightIds } = input;
  if (
    flightIds.length < 1 ||
    flightIds.length > 2 ||
    new Set(flightIds).size !== flightIds.length
  ) {
    throw badRequest('Choose an outbound flight and, optionally, a different return flight', {
      flightIds: 'Choose one or two different flights',
    });
  }
  const { rows } = await db.query<FlightRow>(
    `select ${FLIGHT_COLUMNS} from flights where id = any($1::int[])`,
    [flightIds],
  );
  const flights = flightIds.map((id) => {
    const row = rows.find((r) => r.id === id);
    if (!row) throw notFound('Flight');
    return toFlight(row);
  });

  const [outbound, inbound] = flights as [Flight, Flight | undefined];
  if (inbound) {
    const reverse =
      inbound.origin === outbound.destination && inbound.destination === outbound.origin;
    if (!reverse || inbound.departAt < outbound.arriveAt) {
      throw badRequest('That return flight does not match the outbound flight', {
        flightIds: 'The return flight must fly back on the same route after you arrive',
      });
    }
  }
  for (const flight of flights) {
    if (isoDateOf(new Date(flight.departAt)) < today) {
      throw badRequest('That flight has already departed', { flightIds: 'Choose a future flight' });
    }
    if (flight.status === 'cancelled') {
      throw soldOut(`Flight ${flight.flightNo} has been cancelled`);
    }
    if (flight.seatsAvailable < input.passengers.length) {
      throw soldOut(`Flight ${flight.flightNo} has only ${flight.seatsAvailable} seats left`);
    }
  }

  const passengers = validatePassengers(
    input.passengers,
    isoDateOf(new Date(outbound.departAt)),
    today,
  );
  const legs = flights.map((flight) => ({
    flight,
    price: flightLegPrice(flight.price, passengers),
  }));
  const total = fromCents(legs.reduce((sum, leg) => sum + toCents(leg.price.total), 0));
  return { legs, passengers, total };
}

/** Adds the flights to the trip with their passengers, in one transaction. */
export async function bookFlights(
  pool: pg.Pool,
  userId: number,
  tripId: number,
  input: FlightCheckoutInput,
  today: string = todayIso(),
): Promise<{ items: ItineraryItem[]; quote: FlightQuote }> {
  return withTransaction(pool, async (db) => {
    const quote = await quoteFlights(db, input, today);
    const items: ItineraryItem[] = [];
    for (const { flight } of quote.legs) {
      const item = await addItemTx(db, userId, tripId, { kind: 'flight', flightId: flight.id });
      await db.query('insert into flight_bookings (item_id, passengers) values ($1, $2)', [
        item.id,
        JSON.stringify(quote.passengers),
      ]);
      items.push(item);
    }
    return { items, quote };
  });
}

interface RoomRow {
  room_type_id: number;
  room_name: string;
  capacity: number;
  nightly_price: number;
  hotel_id: number;
  hotel_name: string;
  address: string;
  destination_name: string;
}

/** Prices a room for the stay, including any paid requests; nothing is stored. */
export async function quoteHotel(
  db: Queryable,
  input: HotelCheckoutInput,
  today: string = todayIso(),
): Promise<HotelQuote> {
  const nights = validateStay(input.checkIn, input.checkOut, undefined, today);
  const requests = validateRequests(input.requests);
  const { rows } = await db.query<RoomRow>(
    `select r.id as room_type_id, r.name as room_name, r.capacity, r.nightly_price,
            h.id as hotel_id, h.name as hotel_name, h.address, d.name as destination_name
     from room_types r join hotels h on h.id = r.hotel_id join destinations d on d.id = h.destination_id
     where r.id = $1`,
    [input.roomTypeId],
  );
  const row = rows[0];
  if (!row) throw notFound('Room');
  if (row.hotel_id !== input.hotelId) {
    throw badRequest('That room is not at this hotel', {
      roomTypeId: 'Choose a room at this hotel',
    });
  }
  const details: Record<string, string> = {};
  if (!Number.isInteger(input.rooms) || input.rooms < 1 || input.rooms > MAX_ROOMS) {
    details.rooms = `Book 1 to ${MAX_ROOMS} rooms`;
  } else if (!Number.isInteger(input.guests) || input.guests < 1) {
    details.guests = 'Enter at least 1 guest';
  } else if (input.guests > row.capacity * input.rooms) {
    details.guests = `${input.rooms} × ${row.room_name} sleeps at most ${row.capacity * input.rooms}`;
  }
  if (Object.keys(details).length > 0) throw badRequest('Check the room selection', details);

  return {
    hotel: {
      id: row.hotel_id,
      name: row.hotel_name,
      address: row.address,
      destinationName: row.destination_name,
    },
    room: {
      id: row.room_type_id,
      name: row.room_name,
      capacity: row.capacity,
      nightlyPrice: row.nightly_price,
    },
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    guests: input.guests,
    requests,
    bill: hotelBill(row.nightly_price, nights, input.rooms, requests),
  };
}

/** Adds the stay to the trip with the room, guest and requests, in one transaction. */
export async function bookHotel(
  pool: pg.Pool,
  userId: number,
  tripId: number,
  input: HotelCheckoutInput & { guest: GuestContact; requestNote?: string | undefined },
  today: string = todayIso(),
): Promise<{ item: ItineraryItem; quote: HotelQuote }> {
  const guest = validateGuest(input.guest);
  const requestNote = input.requestNote?.trim() || null;
  return withTransaction(pool, async (db) => {
    const quote = await quoteHotel(db, input, today);
    const item = await addItemTx(db, userId, tripId, {
      kind: 'hotel',
      hotelId: input.hotelId,
      checkIn: input.checkIn,
      checkOut: input.checkOut,
    });
    await db.query(
      `insert into hotel_bookings (item_id, room_type_id, rooms, guests, guest_name, guest_email,
                                   guest_phone, requests, request_note)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        item.id,
        input.roomTypeId,
        input.rooms,
        input.guests,
        guest.fullName,
        guest.email,
        guest.phone,
        quote.requests,
        requestNote,
      ],
    );
    return { item, quote };
  });
}
