import type pg from 'pg';
import { nightsBetween, todayIso } from './dates.js';
import type { Queryable } from './db.js';
import { badRequest, notFound } from './errors.js';
import { validateStay } from './hotels.js';
import { hotelStayNote, parseCheckOut } from './itinerary.js';
import { COST_COLUMNS, COST_JOINS, priceTrip, type CostRow } from './payments.js';
import { removeItem, updateItem } from './trips.js';

/**
 * A "booking" is a flight or hotel on one of the user's trips. It is `planned` until the trip is
 * paid for, then `confirmed`. Prices are the same sample prices the trip's cost uses.
 */
export type BookingKind = 'flight' | 'hotel';
export type BookingStatus = 'planned' | 'confirmed';
export type BookingSort = 'date' | 'price' | 'trip' | 'type' | 'status';
export type SortOrder = 'asc' | 'desc';
export type BookingScope = 'all' | 'upcoming' | 'past';

export interface Booking {
  /** The itinerary item id. */
  id: number;
  tripId: number;
  tripName: string;
  destination: string;
  kind: BookingKind;
  title: string;
  startDate: string;
  endDate: string;
  /** Hotel nights; null for flights. */
  nights: number | null;
  amount: number;
  /** What was booked at checkout (passengers, room); null for items added without checkout. */
  detail: string | null;
  status: BookingStatus;
  paidAt: string | null;
  isPast: boolean;
  /** Planned bookings can be removed; only upcoming planned hotel stays can change dates. */
  canRemove: boolean;
  canChangeDates: boolean;
}

export interface BookingRow extends CostRow {
  trip_id: number;
  trip_name: string;
  destination_name: string;
  paid_at: Date | null;
}

export interface BookingQuery {
  sort?: BookingSort | undefined;
  order?: SortOrder | undefined;
  scope?: BookingScope | undefined;
  today?: string | undefined;
}

const STATUS_RANK: Record<BookingStatus, number> = { planned: 0, confirmed: 1 };

/** Shapes database rows into bookings; `today` decides which are past. Pure. */
export function toBookings(rows: readonly BookingRow[], today: string): Booking[] {
  return rows.map((row) => {
    const line = priceTrip([row]).lines[0];
    const endDate = row.kind === 'hotel' ? (parseCheckOut(row.notes) ?? row.day) : row.day;
    const status: BookingStatus = row.paid_at ? 'confirmed' : 'planned';
    const isPast = endDate < today;
    return {
      id: row.item_id,
      tripId: row.trip_id,
      tripName: row.trip_name,
      destination: row.destination_name,
      kind: row.kind,
      title: row.title,
      startDate: row.day,
      endDate,
      nights: row.kind === 'hotel' ? Math.max(1, nightsBetween(row.day, endDate)) : null,
      amount: line?.amount ?? 0,
      detail: line?.detail ?? null,
      status,
      paidAt: row.paid_at ? row.paid_at.toISOString() : null,
      isPast,
      canRemove: status === 'planned',
      canChangeDates: status === 'planned' && !isPast && row.kind === 'hotel',
    };
  });
}

export function filterByScope(bookings: readonly Booking[], scope: BookingScope): Booking[] {
  if (scope === 'past') return bookings.filter((b) => b.isPast);
  if (scope === 'upcoming') return bookings.filter((b) => !b.isPast);
  return [...bookings];
}

/** Sorts by one column (ties fall back to start date then id) in ascending or descending order. */
export function sortBookings(
  bookings: readonly Booking[],
  sort: BookingSort = 'date',
  order: SortOrder = 'asc',
): Booking[] {
  const primary = (a: Booking, b: Booking): number => {
    switch (sort) {
      case 'price':
        return a.amount - b.amount;
      case 'trip':
        return a.tripName.localeCompare(b.tripName);
      case 'type':
        return a.kind.localeCompare(b.kind);
      case 'status':
        return STATUS_RANK[a.status] - STATUS_RANK[b.status];
      case 'date':
        return a.startDate.localeCompare(b.startDate);
    }
  };
  const direction = order === 'desc' ? -1 : 1;
  return [...bookings].sort(
    (a, b) => direction * primary(a, b) || a.startDate.localeCompare(b.startDate) || a.id - b.id,
  );
}

const BOOKING_SELECT = `
  select ${COST_COLUMNS}, i.trip_id, t.name as trip_name, d.name as destination_name,
         p.created_at as paid_at
  from itinerary_items i
  join trips t on t.id = i.trip_id
  join destinations d on d.id = t.destination_id
  ${COST_JOINS}
  left join payments p on p.trip_id = t.id
  where t.user_id = $1 and i.kind in ('flight', 'hotel')`;

/** SCRUM-26: every flight and hotel on the user's trips, sorted and filtered. */
export async function listBookings(
  db: Queryable,
  userId: number,
  query: BookingQuery = {},
): Promise<Booking[]> {
  const { rows } = await db.query<BookingRow>(BOOKING_SELECT, [userId]);
  const today = query.today ?? todayIso();
  const scoped = filterByScope(toBookings(rows, today), query.scope ?? 'all');
  return sortBookings(scoped, query.sort, query.order);
}

async function getBooking(
  db: Queryable,
  userId: number,
  itemId: number,
  today: string,
): Promise<Booking> {
  const { rows } = await db.query<BookingRow>(`${BOOKING_SELECT} and i.id = $2`, [userId, itemId]);
  const booking = toBookings(rows, today)[0];
  if (!booking) throw notFound('Booking');
  return booking;
}

/** The booking's trip and kind, only if the booking belongs to the user. */
async function findOwned(
  db: Queryable,
  userId: number,
  itemId: number,
): Promise<{ tripId: number; kind: string }> {
  const { rows } = await db.query<{ trip_id: number; kind: string }>(
    `select i.trip_id, i.kind from itinerary_items i join trips t on t.id = i.trip_id
     where i.id = $1 and t.user_id = $2 and i.kind in ('flight', 'hotel')`,
    [itemId, userId],
  );
  const row = rows[0];
  if (!row) throw notFound('Booking');
  return { tripId: row.trip_id, kind: row.kind };
}

/**
 * Modifies a hotel booking's dates. The stay is repriced automatically because the price is
 * always worked out from the dates. Paid trips are locked (409 from the trip update).
 */
export async function changeHotelStay(
  pool: pg.Pool,
  userId: number,
  itemId: number,
  stay: { checkIn: string; checkOut: string },
  today: string = todayIso(),
): Promise<Booking> {
  const { tripId, kind } = await findOwned(pool, userId, itemId);
  if (kind !== 'hotel') {
    throw badRequest('Only hotel stays can have their dates changed', {
      kind: 'Remove this flight and add a different one instead',
    });
  }
  validateStay(stay.checkIn, stay.checkOut, undefined, today);
  await updateItem(pool, userId, tripId, itemId, {
    day: stay.checkIn,
    notes: hotelStayNote(stay.checkOut),
  });
  return getBooking(pool, userId, itemId, today);
}

/** Removes a planned booking from its trip (409 if the trip has been paid for). */
export async function removeBooking(pool: pg.Pool, userId: number, itemId: number): Promise<void> {
  const { tripId } = await findOwned(pool, userId, itemId);
  await removeItem(pool, userId, tripId, itemId);
}
