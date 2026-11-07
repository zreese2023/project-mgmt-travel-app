import { isIsoDate, todayIso } from './dates.js';
import type { Queryable } from './db.js';
import { withTransaction } from './db.js';
import { AppError, badRequest, notFound } from './errors.js';
import {
  groupByDay,
  hotelStayNote,
  insertAt,
  insertionIndex,
  isPastTrip,
  isHourMinute,
  moveInOrder,
  orderTrips,
  summarizeTrip,
  toHourMinute,
  type DayPlan,
  type ItemKind,
  type ItineraryItem,
  type MoveDirection,
  type TripScope,
  type TripSummary,
} from './itinerary.js';
import {
  assertUnpaid,
  getPayment,
  getTripCost,
  tripPaid,
  type Payment,
  type TripCost,
} from './payments.js';
import type pg from 'pg';

export interface Trip {
  id: number;
  name: string;
  destination: { slug: string; name: string; imageUrl: string; airportCode: string };
  startDate: string;
  endDate: string;
  createdAt: string;
}

export interface TripListEntry extends Trip {
  itemCount: number;
  paid: boolean;
  isPast: boolean;
}

export interface TripDetail {
  trip: Trip;
  days: DayPlan[];
  summary: TripSummary;
  cost: TripCost;
  payment: Payment | null;
}

export interface NewTripInput {
  destinationSlug: string;
  name: string;
  startDate: string;
  endDate: string;
}

/** A request to add something to a trip. Exactly one of the shapes below. */
export type NewItemInput =
  | { kind: 'activity'; activityId: number; day: string; startTime?: string | undefined }
  | {
      kind: 'activity' | 'note';
      title: string;
      day: string;
      startTime?: string | undefined;
      notes?: string | undefined;
    }
  | { kind: 'flight'; flightId: number }
  | { kind: 'hotel'; hotelId: number; checkIn: string; checkOut: string };

/** The loose JSON body accepted by POST /trips/:id/items. */
export interface NewItemBody {
  kind: ItemKind;
  activityId?: number | undefined;
  title?: string | undefined;
  day?: string | undefined;
  startTime?: string | undefined;
  notes?: string | undefined;
  flightId?: number | undefined;
  hotelId?: number | undefined;
  checkIn?: string | undefined;
  checkOut?: string | undefined;
}

/** Narrows the loose body to exactly one valid shape, or throws a 422 naming what is missing. */
export function parseNewItem(body: NewItemBody): NewItemInput {
  const missing = (field: string, message: string): never => {
    throw badRequest(message, { [field]: message });
  };
  switch (body.kind) {
    case 'flight':
      return {
        kind: 'flight',
        flightId: body.flightId ?? missing('flightId', 'flightId is required'),
      };
    case 'hotel':
      return {
        kind: 'hotel',
        hotelId: body.hotelId ?? missing('hotelId', 'hotelId is required'),
        checkIn: body.checkIn ?? missing('checkIn', 'checkIn is required'),
        checkOut: body.checkOut ?? missing('checkOut', 'checkOut is required'),
      };
    case 'activity':
    case 'note': {
      const day = body.day ?? missing('day', 'day is required');
      if (body.kind === 'activity' && body.activityId !== undefined) {
        return { kind: 'activity', activityId: body.activityId, day, startTime: body.startTime };
      }
      return {
        kind: body.kind,
        title: body.title ?? missing('title', 'title is required'),
        day,
        startTime: body.startTime,
        notes: body.notes,
      };
    }
  }
}

export interface ItemPatch {
  title?: string | undefined;
  notes?: string | null | undefined;
  day?: string | undefined;
  startTime?: string | null | undefined;
}

interface TripRow {
  id: number;
  user_id: number;
  name: string;
  start_date: string;
  end_date: string;
  created_at: Date;
  destination_id: number;
  destination_slug: string;
  destination_name: string;
  image_url: string;
  airport_code: string;
}

interface ItemRow {
  id: number;
  trip_id: number;
  kind: ItemKind;
  title: string;
  day: string;
  start_time: string | null;
  position: number;
  notes: string | null;
  activity_id: number | null;
  flight_id: number | null;
  hotel_id: number | null;
}

const TRIP_SELECT = `select t.id, t.user_id, t.name, t.start_date, t.end_date, t.created_at, t.destination_id,
       d.slug as destination_slug, d.name as destination_name, d.image_url, d.airport_code
     from trips t join destinations d on d.id = t.destination_id`;
const ITEM_COLUMNS =
  'id, trip_id, kind, title, day, start_time, position, notes, activity_id, flight_id, hotel_id';

function toTrip(row: TripRow): Trip {
  return {
    id: row.id,
    name: row.name,
    destination: {
      slug: row.destination_slug,
      name: row.destination_name,
      imageUrl: row.image_url,
      airportCode: row.airport_code,
    },
    startDate: row.start_date,
    endDate: row.end_date,
    createdAt: row.created_at.toISOString(),
  };
}

export function toItem(row: ItemRow): ItineraryItem {
  return {
    id: row.id,
    tripId: row.trip_id,
    kind: row.kind,
    title: row.title,
    day: row.day,
    startTime: toHourMinute(row.start_time),
    position: row.position,
    notes: row.notes,
    activityId: row.activity_id,
    flightId: row.flight_id,
    hotelId: row.hotel_id,
  };
}

export function validateTripDates(startDate: string, endDate: string): void {
  const details: Record<string, string> = {};
  if (!isIsoDate(startDate)) details.startDate = 'Enter a start date (YYYY-MM-DD)';
  if (!isIsoDate(endDate)) details.endDate = 'Enter an end date (YYYY-MM-DD)';
  if (!details.startDate && !details.endDate && endDate < startDate) {
    details.endDate = 'End date cannot be before the start date';
  }
  if (Object.keys(details).length > 0) throw badRequest('Invalid trip dates', details);
}

/** Loads a trip only if it belongs to the user; other users' trips look like they do not exist. */
async function loadOwnedTrip(db: Queryable, userId: number, tripId: number): Promise<TripRow> {
  const { rows } = await db.query<TripRow>(`${TRIP_SELECT} where t.id = $1 and t.user_id = $2`, [
    tripId,
    userId,
  ]);
  const row = rows[0];
  if (!row) throw notFound('Trip');
  return row;
}

export async function createTrip(
  pool: pg.Pool,
  userId: number,
  input: NewTripInput,
): Promise<Trip> {
  validateTripDates(input.startDate, input.endDate);
  const name = input.name.trim();
  if (!name) throw badRequest('Trip name is required', { name: 'Trip name is required' });
  const { rows: dest } = await pool.query<{ id: number }>(
    'select id from destinations where slug = $1',
    [input.destinationSlug],
  );
  const destination = dest[0];
  if (!destination) throw notFound('Destination');
  const { rows } = await pool.query<{ id: number }>(
    `insert into trips (user_id, destination_id, name, start_date, end_date)
     values ($1, $2, $3, $4, $5) returning id`,
    [userId, destination.id, name, input.startDate, input.endDate],
  );
  return toTrip(await loadOwnedTrip(pool, userId, (rows[0] as { id: number }).id));
}

export interface ListTripsOptions {
  scope?: TripScope;
  /** 'YYYY-MM-DD' used to decide what is past; defaults to today (UTC). Tests pass a fixed date. */
  today?: string;
}

/** The user's trips, upcoming first then past; `scope` narrows to one of the two groups. */
export async function listTrips(
  db: Queryable,
  userId: number,
  options: ListTripsOptions = {},
): Promise<TripListEntry[]> {
  const today = options.today ?? todayIso();
  const scope = options.scope ?? 'all';
  const { rows } = await db.query<TripRow & { item_count: number; paid: boolean }>(
    `select t.id, t.user_id, t.name, t.start_date, t.end_date, t.created_at, t.destination_id,
            d.slug as destination_slug, d.name as destination_name, d.image_url, d.airport_code,
            (select count(*) from itinerary_items i where i.trip_id = t.id) as item_count,
            exists (select 1 from payments p where p.trip_id = t.id) as paid
     from trips t join destinations d on d.id = t.destination_id
     where t.user_id = $1`,
    [userId],
  );
  const entries = rows.map((row) => ({
    ...toTrip(row),
    itemCount: row.item_count,
    paid: row.paid,
    isPast: isPastTrip(row.end_date, today),
  }));
  const ordered = orderTrips(entries, today);
  if (scope === 'past') return ordered.filter((t) => t.isPast);
  if (scope === 'upcoming') return ordered.filter((t) => !t.isPast);
  return ordered;
}

export async function getTripDetail(
  db: Queryable,
  userId: number,
  tripId: number,
): Promise<TripDetail> {
  const tripRow = await loadOwnedTrip(db, userId, tripId);
  const { rows } = await db.query<ItemRow>(
    `select ${ITEM_COLUMNS} from itinerary_items where trip_id = $1`,
    [tripId],
  );
  const items = rows.map(toItem);
  return {
    trip: toTrip(tripRow),
    days: groupByDay(tripRow.start_date, tripRow.end_date, items),
    summary: summarizeTrip(tripRow.start_date, tripRow.end_date, items),
    cost: await getTripCost(db, tripId),
    payment: await getPayment(db, tripId),
  };
}

const PAID_TRIP_LOCKED = 'This trip has been paid for and can no longer be changed';

export async function deleteTrip(db: Queryable, userId: number, tripId: number): Promise<void> {
  let rowCount: number | null;
  try {
    ({ rowCount } = await db.query('delete from trips where id = $1 and user_id = $2', [
      tripId,
      userId,
    ]));
  } catch (err) {
    // payments.trip_id is ON DELETE RESTRICT, so a paid trip cannot be deleted.
    if (typeof err === 'object' && err !== null && (err as { code?: string }).code === '23503') {
      throw tripPaid('A paid trip cannot be deleted');
    }
    throw err;
  }
  if (!rowCount) throw notFound('Trip');
}

/** Ids of a day's items in display order, optionally leaving one out. */
async function readDay(
  db: Queryable,
  tripId: number,
  day: string,
  excludeId?: number,
): Promise<Array<{ id: number; startTime: string | null }>> {
  const { rows } = await db.query<{ id: number; start_time: string | null }>(
    `select id, start_time from itinerary_items
     where trip_id = $1 and day = $2::date and ($3::int is null or id <> $3)
     order by position, id`,
    [tripId, day, excludeId ?? null],
  );
  return rows.map((r) => ({ id: r.id, startTime: toHourMinute(r.start_time) }));
}

/** Writes positions 0..n-1 for the given ids, placing them all on `day`. */
export async function writeDayOrder(
  db: Queryable,
  tripId: number,
  day: string,
  orderedIds: readonly number[],
): Promise<void> {
  if (orderedIds.length === 0) return;
  await db.query(
    `update itinerary_items i set position = v.pos, day = $3::date
     from unnest($1::int[], $2::int[]) as v(id, pos)
     where i.id = v.id and i.trip_id = $4`,
    [[...orderedIds], orderedIds.map((_, index) => index), day, tripId],
  );
}

/** Puts an existing item into a day at the position implied by its start time. */
async function placeInDay(
  db: Queryable,
  tripId: number,
  itemId: number,
  day: string,
  startTime: string | null,
): Promise<void> {
  const others = await readDay(db, tripId, day, itemId);
  const index = insertionIndex(others, startTime);
  await writeDayOrder(
    db,
    tripId,
    day,
    insertAt(
      others.map((o) => o.id),
      itemId,
      index,
    ),
  );
}

async function resequenceDay(db: Queryable, tripId: number, day: string): Promise<void> {
  const ids = (await readDay(db, tripId, day)).map((o) => o.id);
  await writeDayOrder(db, tripId, day, ids);
}

function assertWithinTrip(trip: TripRow, day: string): void {
  if (!isIsoDate(day)) throw badRequest('Invalid day', { day: 'Enter a date (YYYY-MM-DD)' });
  if (day < trip.start_date || day > trip.end_date) {
    throw badRequest('That day is outside your trip dates', {
      day: `Choose a day between ${trip.start_date} and ${trip.end_date}`,
    });
  }
}

interface ResolvedItem {
  kind: ItemKind;
  title: string;
  day: string;
  startTime: string | null;
  notes: string | null;
  activityId: number | null;
  flightId: number | null;
  hotelId: number | null;
}

async function resolveItem(
  db: Queryable,
  trip: TripRow,
  input: NewItemInput,
): Promise<ResolvedItem> {
  const blank = { notes: null, activityId: null, flightId: null, hotelId: null, startTime: null };

  if (input.kind === 'flight') {
    const { rows } = await db.query<{
      flight_no: string;
      origin_code: string;
      dest_code: string;
      depart_at: Date;
    }>('select flight_no, origin_code, dest_code, depart_at from flights where id = $1', [
      input.flightId,
    ]);
    const flight = rows[0];
    if (!flight) throw notFound('Flight');
    const iso = flight.depart_at.toISOString();
    const day = iso.slice(0, 10);
    assertWithinTrip(trip, day);
    return {
      ...blank,
      kind: 'flight',
      title: `Flight ${flight.flight_no}: ${flight.origin_code} to ${flight.dest_code}`,
      day,
      startTime: iso.slice(11, 16),
      notes: 'Sample flight. Times are UTC.',
      flightId: input.flightId,
    };
  }

  if (input.kind === 'hotel') {
    const { rows } = await db.query<{ name: string }>('select name from hotels where id = $1', [
      input.hotelId,
    ]);
    const hotel = rows[0];
    if (!hotel) throw notFound('Hotel');
    if (!isIsoDate(input.checkOut) || input.checkOut <= input.checkIn) {
      throw badRequest('Invalid stay', { checkOut: 'Check-out must be after check-in' });
    }
    assertWithinTrip(trip, input.checkIn);
    return {
      ...blank,
      kind: 'hotel',
      title: `Stay at ${hotel.name}`,
      day: input.checkIn,
      notes: hotelStayNote(input.checkOut),
      hotelId: input.hotelId,
    };
  }

  const startTime = input.startTime ?? null;
  if (startTime !== null && !isHourMinute(startTime)) {
    throw badRequest('Invalid time', { startTime: 'Use 24-hour HH:MM' });
  }
  assertWithinTrip(trip, input.day);

  if ('activityId' in input) {
    const { rows } = await db.query<{ name: string; destination_id: number }>(
      'select name, destination_id from activities where id = $1',
      [input.activityId],
    );
    const activity = rows[0];
    if (!activity || activity.destination_id !== trip.destination_id) {
      throw badRequest("That activity is not in this trip's destination", {
        activityId: 'Choose an activity from the trip destination',
      });
    }
    return {
      ...blank,
      kind: 'activity',
      title: activity.name,
      day: input.day,
      startTime,
      activityId: input.activityId,
    };
  }

  const title = input.title.trim();
  if (!title) throw badRequest('Title is required', { title: 'Enter a title' });
  return {
    ...blank,
    kind: input.kind,
    title,
    day: input.day,
    startTime,
    notes: input.notes?.trim() || null,
  };
}

export async function addItem(
  pool: pg.Pool,
  userId: number,
  tripId: number,
  input: NewItemInput,
): Promise<ItineraryItem> {
  return withTransaction(pool, (db) => addItemTx(db, userId, tripId, input));
}

/** `addItem` inside the caller's transaction, so checkout can store booking details atomically. */
export async function addItemTx(
  db: Queryable,
  userId: number,
  tripId: number,
  input: NewItemInput,
): Promise<ItineraryItem> {
  const trip = await loadOwnedTrip(db, userId, tripId);
  await assertUnpaid(db, tripId, PAID_TRIP_LOCKED);
  const item = await resolveItem(db, trip, input);
  const { rows } = await db.query<ItemRow>(
    `insert into itinerary_items (trip_id, kind, title, day, start_time, notes, activity_id, flight_id, hotel_id)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning ${ITEM_COLUMNS}`,
    [
      tripId,
      item.kind,
      item.title,
      item.day,
      item.startTime,
      item.notes,
      item.activityId,
      item.flightId,
      item.hotelId,
    ],
  );
  const created = rows[0] as ItemRow;
  await placeInDay(db, tripId, created.id, item.day, item.startTime);
  const { rows: fresh } = await db.query<ItemRow>(
    `select ${ITEM_COLUMNS} from itinerary_items where id = $1`,
    [created.id],
  );
  return toItem(fresh[0] as ItemRow);
}

/** Edits an item's title, notes, day or time; a changed day or time re-places it in the day. */
export async function updateItem(
  pool: pg.Pool,
  userId: number,
  tripId: number,
  itemId: number,
  patch: ItemPatch,
): Promise<ItineraryItem> {
  return withTransaction(pool, async (db) => {
    const trip = await loadOwnedTrip(db, userId, tripId);
    await assertUnpaid(db, tripId, PAID_TRIP_LOCKED);
    const { rows } = await db.query<ItemRow>(
      `select ${ITEM_COLUMNS} from itinerary_items where id = $1 and trip_id = $2`,
      [itemId, tripId],
    );
    const current = rows[0];
    if (!current) throw notFound('Itinerary item');

    const title = patch.title !== undefined ? patch.title.trim() : current.title;
    if (!title) throw badRequest('Title is required', { title: 'Enter a title' });
    const day = patch.day ?? current.day;
    const startTime =
      patch.startTime !== undefined ? patch.startTime : toHourMinute(current.start_time);
    if (startTime !== null && !isHourMinute(startTime)) {
      throw badRequest('Invalid time', { startTime: 'Use 24-hour HH:MM' });
    }
    if (patch.day !== undefined) assertWithinTrip(trip, day);
    const notes = patch.notes !== undefined ? patch.notes : current.notes;

    await db.query(
      'update itinerary_items set title = $2, notes = $3, start_time = $4, day = $5::date where id = $1',
      [itemId, title, notes, startTime, day],
    );
    const moved = day !== current.day || startTime !== toHourMinute(current.start_time);
    if (moved) {
      await placeInDay(db, tripId, itemId, day, startTime);
      if (day !== current.day) await resequenceDay(db, tripId, current.day);
    }
    const { rows: fresh } = await db.query<ItemRow>(
      `select ${ITEM_COLUMNS} from itinerary_items where id = $1`,
      [itemId],
    );
    return toItem(fresh[0] as ItemRow);
  });
}

/** Rearranges: moves an item one place up or down within its day (a no-op at either end). */
export async function moveItem(
  pool: pg.Pool,
  userId: number,
  tripId: number,
  itemId: number,
  direction: MoveDirection,
): Promise<ItineraryItem> {
  return withTransaction(pool, async (db) => {
    await loadOwnedTrip(db, userId, tripId);
    await assertUnpaid(db, tripId, PAID_TRIP_LOCKED);
    const { rows } = await db.query<ItemRow>(
      `select ${ITEM_COLUMNS} from itinerary_items where id = $1 and trip_id = $2`,
      [itemId, tripId],
    );
    const current = rows[0];
    if (!current) throw notFound('Itinerary item');

    const ids = (await readDay(db, tripId, current.day)).map((entry) => entry.id);
    await writeDayOrder(db, tripId, current.day, moveInOrder(ids, itemId, direction));
    const { rows: fresh } = await db.query<ItemRow>(
      `select ${ITEM_COLUMNS} from itinerary_items where id = $1`,
      [itemId],
    );
    return toItem(fresh[0] as ItemRow);
  });
}

export async function removeItem(
  pool: pg.Pool,
  userId: number,
  tripId: number,
  itemId: number,
): Promise<void> {
  await withTransaction(pool, async (db) => {
    await loadOwnedTrip(db, userId, tripId);
    await assertUnpaid(db, tripId, PAID_TRIP_LOCKED);
    const { rows } = await db.query<{ day: string }>(
      'delete from itinerary_items where id = $1 and trip_id = $2 returning day',
      [itemId, tripId],
    );
    const removed = rows[0];
    if (!removed) throw new AppError(404, 'not_found', 'Itinerary item not found');
    await resequenceDay(db, tripId, removed.day);
  });
}
