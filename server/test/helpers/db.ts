import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { loadConfig } from '../../src/lib/config.js';
import { registerTypeParsers } from '../../src/lib/pgTypes.js';

/** A pool on the test database with the production type parsers registered. */
export function createTestPool(): pg.Pool {
  registerTypeParsers();
  return new pg.Pool({ connectionString: loadConfig().testDatabaseUrl, max: 4 });
}

export interface TestFlight {
  id: number;
  flightNo: string;
}

/**
 * Inserts a private flight with a chosen status so alert tests never depend on, or change,
 * the seeded flights. Each flight has a unique number, so leftovers from earlier runs are harmless.
 */
export async function createTestFlight(
  pool: pg.Pool,
  options: {
    origin: string;
    destination: string;
    days: number;
    status?: 'on_time' | 'delayed' | 'cancelled';
  },
): Promise<TestFlight> {
  const flightNo = `TS${randomUUID().slice(0, 6).toUpperCase()}`;
  const { rows } = await pool.query<{ id: number }>(
    `insert into flights (flight_no, airline, origin_code, dest_code, depart_at, arrive_at, price,
                          seats_available, status)
     values ($1, 'Test Air', $2, $3,
             ((current_date + $4::int) + time '09:00') at time zone 'UTC',
             ((current_date + $4::int) + time '09:00') at time zone 'UTC' + interval '8 hours',
             500, 20, $5)
     returning id`,
    [flightNo, options.origin, options.destination, options.days, options.status ?? 'on_time'],
  );
  return { id: (rows[0] as { id: number }).id, flightNo };
}
