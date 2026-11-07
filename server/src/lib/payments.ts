import type pg from 'pg';
import { isIsoDate, nightsBetween } from './dates.js';
import type { Queryable } from './db.js';
import { withTransaction } from './db.js';
import { AppError, badRequest, notFound } from './errors.js';
import { parseCheckOut } from './itinerary.js';
import { fromCents, toCents } from './money.js';
import { flightLegPrice, hotelBill, ROOM_REQUESTS, type RoomRequest } from './pricing.js';

export const PAYMENT_METHODS = ['credit_card', 'debit_card', 'paypal'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export type PaymentStatus = 'pending' | 'completed' | 'failed';

export interface Payment {
  id: number;
  tripId: number;
  amount: number;
  method: PaymentMethod;
  status: PaymentStatus;
  createdAt: string;
}

export interface CostLine {
  itemId: number;
  kind: 'flight' | 'hotel';
  title: string;
  amount: number;
  /** What was booked at checkout, e.g. "2 passengers · 1 checked bag". Absent for quick-added items. */
  detail?: string;
}

export interface TripCost {
  lines: CostLine[];
  total: number;
}

export interface CostRow {
  item_id: number;
  kind: 'flight' | 'hotel';
  title: string;
  day: string;
  notes: string | null;
  flight_price: number | null;
  /** The booked room's rate, or the hotel's cheapest room for items added without checkout. */
  nightly_price: number | null;
  /** Checkout details; null (or absent) for items added without checkout. */
  passengers?: Array<{ checkedBags: number }> | null;
  rooms?: number | null;
  room_name?: string | null;
  room_requests?: string[] | null;
}

/** Columns and joins that price an itinerary item `i`; shared by trip costs and bookings. */
export const COST_COLUMNS = `i.id as item_id, i.kind, i.title, i.day, i.notes, f.price as flight_price,
       coalesce(r.nightly_price,
                (select min(c.nightly_price) from room_types c where c.hotel_id = i.hotel_id)) as nightly_price,
       fb.passengers, hb.rooms, r.name as room_name, hb.requests as room_requests`;
export const COST_JOINS = `left join flights f on f.id = i.flight_id
  left join flight_bookings fb on fb.item_id = i.id
  left join hotel_bookings hb on hb.item_id = i.id
  left join room_types r on r.id = hb.room_type_id`;

interface PaymentRow {
  id: number;
  trip_id: number;
  amount: number;
  method: PaymentMethod;
  status: PaymentStatus;
  created_at: Date;
}

const PAYMENT_COLUMNS = 'id, trip_id, amount, method, status, created_at';

export const tripPaid = (message: string): AppError => new AppError(409, 'trip_paid', message);
export const soldOut = (message: string): AppError => new AppError(409, 'sold_out', message);

const plural = (count: number, word: string): string => `${count} ${word}${count === 1 ? '' : 's'}`;

const isRoomRequest = (value: string): value is RoomRequest =>
  (ROOM_REQUESTS as readonly string[]).includes(value);

function toPayment(row: PaymentRow): Payment {
  return {
    id: row.id,
    tripId: row.trip_id,
    amount: row.amount,
    method: row.method,
    status: row.status,
    createdAt: row.created_at.toISOString(),
  };
}

/** Price of one flight or hotel item, with a description of what was booked at checkout. */
function priceItem(row: CostRow): { amount: number; detail?: string } | null {
  if (row.kind === 'flight') {
    if (row.flight_price === null) return null;
    if (!row.passengers?.length) return { amount: row.flight_price };
    const leg = flightLegPrice(row.flight_price, row.passengers);
    const bags = leg.checkedBags > 0 ? plural(leg.checkedBags, 'checked bag') : 'carry-on only';
    return { amount: leg.total, detail: `${plural(leg.passengers, 'passenger')} · ${bags}` };
  }
  if (row.nightly_price === null) return null;
  const checkOut = parseCheckOut(row.notes);
  const nights = Math.max(
    1,
    checkOut && isIsoDate(checkOut) ? nightsBetween(row.day, checkOut) : 1,
  );
  const rooms = row.rooms ?? 1;
  const bill = hotelBill(
    row.nightly_price,
    nights,
    rooms,
    (row.room_requests ?? []).filter(isRoomRequest),
  );
  if (!row.room_name) return { amount: bill.total };
  return {
    amount: bill.total,
    detail: `${row.room_name} × ${rooms} · ${plural(nights, 'night')}`,
  };
}

/**
 * Sample price of a trip. Items booked through checkout use their passengers, bags, room and
 * requests; items added without checkout are priced for one passenger (fare only) or the hotel's
 * cheapest room plus tax. Activities and notes are free.
 */
export function priceTrip(rows: readonly CostRow[]): TripCost {
  const lines: CostLine[] = [];
  for (const row of rows) {
    const price = priceItem(row);
    if (price) lines.push({ itemId: row.item_id, kind: row.kind, title: row.title, ...price });
  }
  const totalCents = lines.reduce((sum, line) => sum + toCents(line.amount), 0);
  return { lines, total: fromCents(totalCents) };
}

export async function getTripCost(db: Queryable, tripId: number): Promise<TripCost> {
  const { rows } = await db.query<CostRow>(
    `select ${COST_COLUMNS}
     from itinerary_items i ${COST_JOINS}
     where i.trip_id = $1 and i.kind in ('flight', 'hotel')
     order by i.day, i.position, i.id`,
    [tripId],
  );
  return priceTrip(rows);
}

export async function getPayment(db: Queryable, tripId: number): Promise<Payment | null> {
  const { rows } = await db.query<PaymentRow>(
    `select ${PAYMENT_COLUMNS} from payments where trip_id = $1`,
    [tripId],
  );
  return rows[0] ? toPayment(rows[0]) : null;
}

/**
 * Locks the trip row for the rest of the transaction and throws a 409 if it has been paid for.
 * Paying takes the same lock, so an item cannot slip in between pricing and payment.
 */
export async function assertUnpaid(db: Queryable, tripId: number, message: string): Promise<void> {
  const { rows } = await db.query<{ paid: boolean }>(
    `select exists (select 1 from payments p where p.trip_id = t.id) as paid
     from trips t where t.id = $1 for update of t`,
    [tripId],
  );
  if (rows[0]?.paid) throw tripPaid(message);
}

/**
 * Takes the seats for every flight booked through checkout on the trip. The update re-checks the
 * seat count under the row lock, so two trips cannot both take the last seats.
 */
async function reserveSeats(db: Queryable, tripId: number): Promise<void> {
  const { rows: needed } = await db.query<{ flight_id: number; seats: number }>(
    `select i.flight_id, sum(jsonb_array_length(fb.passengers))::int as seats
     from itinerary_items i join flight_bookings fb on fb.item_id = i.id
     where i.trip_id = $1 group by i.flight_id`,
    [tripId],
  );
  if (needed.length === 0) return;
  const { rowCount } = await db.query(
    `update flights f set seats_available = f.seats_available - n.seats
     from unnest($1::int[], $2::int[]) as n(flight_id, seats)
     where f.id = n.flight_id and f.seats_available >= n.seats and f.status <> 'cancelled'`,
    [needed.map((n) => n.flight_id), needed.map((n) => n.seats)],
  );
  if (rowCount !== needed.length) {
    throw soldOut('A flight on this trip was cancelled or no longer has enough seats');
  }
}

/** Fake checkout: records a completed payment for the trip's current price. One per trip. */
export async function payForTrip(
  pool: pg.Pool,
  userId: number,
  tripId: number,
  method: PaymentMethod,
): Promise<Payment> {
  return withTransaction(pool, async (db) => {
    const { rowCount } = await db.query('select 1 from trips where id = $1 and user_id = $2', [
      tripId,
      userId,
    ]);
    if (!rowCount) throw notFound('Trip');
    await assertUnpaid(db, tripId, 'This trip has already been paid for');
    const cost = await getTripCost(db, tripId);
    if (cost.total <= 0) {
      throw badRequest('There is nothing to pay for yet', {
        trip: 'Add a flight or hotel to this trip before paying',
      });
    }
    await reserveSeats(db, tripId);
    const { rows } = await db.query<PaymentRow>(
      `insert into payments (trip_id, amount, method, status)
       values ($1, $2, $3, 'completed') returning ${PAYMENT_COLUMNS}`,
      [tripId, cost.total, method],
    );
    return toPayment(rows[0] as PaymentRow);
  });
}
