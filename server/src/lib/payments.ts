import type pg from 'pg';
import { isIsoDate, nightsBetween } from './dates.js';
import type { Queryable } from './db.js';
import { withTransaction } from './db.js';
import { AppError, badRequest, notFound } from './errors.js';
import { parseCheckOut } from './itinerary.js';
import { fromCents, toCents } from './money.js';
import { hotelPrice } from './pricing.js';

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
  nightly_price: number | null;
}

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

/**
 * Sample price of a trip: each flight for one passenger, each stay in the hotel's cheapest room
 * for the booked nights plus tax. Activities and notes are free.
 */
export function priceTrip(rows: readonly CostRow[]): TripCost {
  const lines: CostLine[] = [];
  for (const row of rows) {
    let amount: number | null = null;
    if (row.kind === 'flight') amount = row.flight_price;
    else if (row.nightly_price !== null) {
      const checkOut = parseCheckOut(row.notes);
      const nights = checkOut && isIsoDate(checkOut) ? nightsBetween(row.day, checkOut) : 1;
      amount = hotelPrice(row.nightly_price, Math.max(1, nights)).total;
    }
    if (amount !== null)
      lines.push({ itemId: row.item_id, kind: row.kind, title: row.title, amount });
  }
  const totalCents = lines.reduce((sum, line) => sum + toCents(line.amount), 0);
  return { lines, total: fromCents(totalCents) };
}

export async function getTripCost(db: Queryable, tripId: number): Promise<TripCost> {
  const { rows } = await db.query<CostRow>(
    `select i.id as item_id, i.kind, i.title, i.day, i.notes, f.price as flight_price,
            (select min(r.nightly_price) from room_types r where r.hotel_id = i.hotel_id) as nightly_price
     from itinerary_items i left join flights f on f.id = i.flight_id
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
    const { rows } = await db.query<PaymentRow>(
      `insert into payments (trip_id, amount, method, status)
       values ($1, $2, $3, 'completed') returning ${PAYMENT_COLUMNS}`,
      [tripId, cost.total, method],
    );
    return toPayment(rows[0] as PaymentRow);
  });
}
