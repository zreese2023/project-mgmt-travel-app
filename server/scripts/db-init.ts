/**
 * Creates the dev and test databases if missing, then DROPS and recreates the
 * `public` schema in each and applies db/schema.sql + db/seed.sql.
 * Destructive by design: re-running it is also how the seed data is refreshed.
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadConfig } from '../src/lib/config.js';
import { hashPassword } from '../src/lib/password.js';

const SAFE_DB_NAME = /^[a-z][a-z0-9_]*$/;
const dbDir = fileURLToPath(new URL('../../db/', import.meta.url));

function databaseName(url: string): string {
  const name = new URL(url).pathname.slice(1);
  if (!SAFE_DB_NAME.test(name)) throw new Error(`Refusing unsafe database name: "${name}"`);
  return name;
}

async function ensureDatabase(url: string): Promise<void> {
  const name = databaseName(url);
  const adminUrl = new URL(url);
  adminUrl.pathname = '/postgres';
  const admin = new pg.Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  try {
    const { rowCount } = await admin.query('select 1 from pg_database where datname = $1', [name]);
    if (!rowCount) await admin.query(`create database ${name}`);
  } finally {
    await admin.end();
  }
}

async function resetAndApply(url: string, sql: string[]): Promise<void> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query('begin');
    await client.query('drop schema public cascade; create schema public;');
    for (const statement of sql) await client.query(statement);
    await client.query('commit');
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    await client.end();
  }
}

/** Demo login documented in the README. The password is hashed with scrypt like any other user. */
const DEMO_PASSWORD = 'wayfarer123';
const DEMO_USERS = [{ email: 'demo@wayfarer.test', name: 'Demo Traveler', role: 'user' }] as const;

async function seedDemoUsers(url: string): Promise<void> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const passwordHash = await hashPassword(DEMO_PASSWORD);
    for (const user of DEMO_USERS) {
      await client.query(
        'insert into users (email, name, password_hash, role) values ($1, $2, $3, $4)',
        [user.email, user.name, passwordHash, user.role],
      );
    }
  } finally {
    await client.end();
  }
}

/**
 * Demo trips for the demo account, so past trips, bookings and alerts can be seen straight away:
 *  - a past, paid Rome trip with a hotel stay (a "confirmed" booking, and a previous trip);
 *  - an upcoming Dubai trip with an unpaid hotel stay (a "planned" booking). Dubai carries a live
 *    level 3 State Department advisory, and if the seed data has a delayed JFK to Dubai flight it
 *    is added too, so the delay alert shows as well.
 * Dates are relative to today, so re-running db:init keeps them current.
 */
async function seedDemoTrips(url: string): Promise<void> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query('begin');
    const { rows: users } = await client.query<{ id: number }>(
      'select id from users where email = $1',
      [DEMO_USERS[0].email],
    );
    const userId = users[0]?.id;
    if (userId === undefined) throw new Error('demo user missing');

    const addTrip = async (slug: string, name: string, startOffset: number, endOffset: number) => {
      const { rows } = await client.query<{ id: number }>(
        `insert into trips (user_id, destination_id, name, start_date, end_date)
         select $1, d.id, $3, current_date + $4::int, current_date + $5::int
         from destinations d where d.slug = $2 returning id`,
        [userId, slug, name, startOffset, endOffset],
      );
      return (rows[0] as { id: number }).id;
    };
    const addStay = (tripId: number, slug: string, inOffset: number, outOffset: number) =>
      client.query(
        `insert into itinerary_items (trip_id, kind, title, day, notes, hotel_id, position)
         select $1, 'hotel', 'Stay at ' || h.name, current_date + $3::int,
                'Check-out ' || (current_date + $4::int)::text, h.id, 0
         from hotels h join destinations d on d.id = h.destination_id
         where d.slug = $2 order by h.id limit 1`,
        [tripId, slug, inOffset, outOffset],
      );

    // Past, paid trip: Rome, 3 nights.
    const rome = await addTrip('rome', 'Rome weekend (past trip)', -40, -35);
    await addStay(rome, 'rome', -39, -36);
    await client.query(
      `insert into itinerary_items (trip_id, kind, title, day, start_time, position)
       values ($1, 'activity', 'Colosseum and Forum', current_date - 38, '10:00', 0)`,
      [rome],
    );
    await client.query(
      `insert into payments (trip_id, amount, method, status)
       select $1, round(min(r.nightly_price) * 3 * 1.12, 2), 'credit_card', 'completed'
       from room_types r where r.hotel_id = (
         select i.hotel_id from itinerary_items i where i.trip_id = $1 and i.kind = 'hotel')`,
      [rome],
    );

    // Upcoming, unpaid trip: Dubai, built around a delayed flight when there is one.
    const { rows: flights } = await client.query<{ id: number; day_offset: number }>(
      `select id, (depart_at at time zone 'UTC')::date - current_date as day_offset
       from flights
       where origin_code = 'JFK' and dest_code = 'DXB' and status = 'delayed'
         and depart_at >= now() + interval '8 days'
       order by depart_at limit 1`,
    );
    const delayed = flights[0];
    const start = delayed ? delayed.day_offset - 1 : 12;
    const dubai = await addTrip('dubai', 'Dubai getaway', start, start + 6);
    await addStay(dubai, 'dubai', start + 1, start + 4);
    if (delayed) {
      await client.query(
        `insert into itinerary_items (trip_id, kind, title, day, start_time, flight_id, position)
         select $1, 'flight', 'Flight ' || f.flight_no || ': ' || f.origin_code || ' to ' || f.dest_code,
                (f.depart_at at time zone 'UTC')::date, (f.depart_at at time zone 'UTC')::time, f.id, 0
         from flights f where f.id = $2`,
        [dubai, delayed.id],
      );
    }
    await client.query('commit');
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    await client.end();
  }
}

const config = loadConfig();
const sql = await Promise.all(
  ['schema.sql', 'seed.sql'].map((file) => readFile(`${dbDir}${file}`, 'utf8')),
);

for (const url of [config.databaseUrl, config.testDatabaseUrl]) {
  await ensureDatabase(url);
  await resetAndApply(url, sql);
  await seedDemoUsers(url);
  await seedDemoTrips(url);
  console.log(`initialised database "${databaseName(url)}"`);
}
