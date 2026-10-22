import { addDays, isIsoDate, todayIso } from './dates.js';
import type { Queryable } from './db.js';
import { badRequest } from './errors.js';

export type FlightSort = 'price' | 'duration' | 'departure';

export interface FlightSearchParams {
  origin: string;
  destination: string;
  depart: string;
  returnDate?: string | undefined;
  maxPrice?: number | undefined;
  passengers?: number | undefined;
  sort?: FlightSort | undefined;
}

export interface Flight {
  id: number;
  flightNo: string;
  airline: string;
  origin: string;
  destination: string;
  departAt: string;
  arriveAt: string;
  durationMin: number;
  price: number;
  seatsAvailable: number;
  stops: number;
  status: 'on_time' | 'delayed' | 'cancelled';
}

export interface FlightRow {
  id: number;
  flight_no: string;
  airline: string;
  origin_code: string;
  dest_code: string;
  depart_at: Date;
  arrive_at: Date;
  price: number;
  seats_available: number;
  stops: number;
  status: Flight['status'];
}

export const FLIGHT_COLUMNS =
  'id, flight_no, airline, origin_code, dest_code, depart_at, arrive_at, price, seats_available, stops, status';

const ORDER_BY: Record<FlightSort, string> = {
  price: 'price asc, depart_at asc',
  duration: '(arrive_at - depart_at) asc, price asc',
  departure: 'depart_at asc, price asc',
};

const AIRPORT_CODE = /^[A-Z]{3}$/;

export function toFlight(row: FlightRow): Flight {
  return {
    id: row.id,
    flightNo: row.flight_no,
    airline: row.airline,
    origin: row.origin_code,
    destination: row.dest_code,
    departAt: row.depart_at.toISOString(),
    arriveAt: row.arrive_at.toISOString(),
    durationMin: Math.round((row.arrive_at.getTime() - row.depart_at.getTime()) / 60000),
    price: row.price,
    seatsAvailable: row.seats_available,
    stops: row.stops,
    status: row.status,
  };
}

/** Throws a 422 AppError when the search is not valid. */
export function validateFlightSearch(params: FlightSearchParams, today: string = todayIso()): void {
  const details: Record<string, string> = {};
  if (!AIRPORT_CODE.test(params.origin)) details.origin = 'Choose a departure airport';
  if (!AIRPORT_CODE.test(params.destination)) details.destination = 'Choose a destination airport';
  if (!details.origin && !details.destination && params.origin === params.destination) {
    details.destination = 'Destination must differ from origin';
  }
  if (!isIsoDate(params.depart)) {
    details.depart = 'Enter a departure date (YYYY-MM-DD)';
  } else if (params.depart < today) {
    details.depart = 'Departure date cannot be in the past';
  }
  if (params.returnDate !== undefined) {
    if (!isIsoDate(params.returnDate)) details.returnDate = 'Enter a return date (YYYY-MM-DD)';
    else if (isIsoDate(params.depart) && params.returnDate < params.depart) {
      details.returnDate = 'Return date cannot be before the departure date';
    }
  }
  if (Object.keys(details).length > 0) throw badRequest('Invalid flight search', details);
}

export function buildFlightQuery(
  origin: string,
  destination: string,
  date: string,
  options: {
    maxPrice?: number | undefined;
    passengers?: number | undefined;
    sort?: FlightSort | undefined;
  },
): { text: string; values: unknown[] } {
  const values: unknown[] = [origin, destination, date, options.passengers ?? 1];
  let text =
    `select ${FLIGHT_COLUMNS} from flights` +
    ` where origin_code = $1 and dest_code = $2` +
    ` and (depart_at at time zone 'UTC')::date = $3::date` +
    ` and status <> 'cancelled' and seats_available >= $4`;
  if (options.maxPrice !== undefined) {
    values.push(options.maxPrice);
    text += ` and price <= $${values.length}`;
  }
  text += ` order by ${ORDER_BY[options.sort ?? 'departure']}`;
  return { text, values };
}

/** Round trips search the reverse route on the return date. */
export async function searchFlights(
  db: Queryable,
  params: FlightSearchParams,
  today: string = todayIso(),
): Promise<{ outbound: Flight[]; return: Flight[] | null }> {
  validateFlightSearch(params, today);
  const options = { maxPrice: params.maxPrice, passengers: params.passengers, sort: params.sort };
  const outboundQuery = buildFlightQuery(params.origin, params.destination, params.depart, options);
  const { rows: outbound } = await db.query<FlightRow>(outboundQuery.text, outboundQuery.values);

  let inbound: FlightRow[] | null = null;
  if (params.returnDate !== undefined) {
    const returnQuery = buildFlightQuery(
      params.destination,
      params.origin,
      params.returnDate,
      options,
    );
    inbound = (await db.query<FlightRow>(returnQuery.text, returnQuery.values)).rows;
  }
  return { outbound: outbound.map(toFlight), return: inbound ? inbound.map(toFlight) : null };
}

/** Latest date flights are seeded for, used by the UI date pickers. */
export function searchWindow(today: string = todayIso()): { from: string; to: string } {
  return { from: addDays(today, 1), to: addDays(today, 90) };
}
