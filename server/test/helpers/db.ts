import pg from 'pg';
import { loadConfig } from '../../src/lib/config.js';
import { registerTypeParsers } from '../../src/lib/pgTypes.js';

/** A pool on the test database with the production type parsers registered. */
export function createTestPool(): pg.Pool {
  registerTypeParsers();
  return new pg.Pool({ connectionString: loadConfig().testDatabaseUrl, max: 4 });
}
