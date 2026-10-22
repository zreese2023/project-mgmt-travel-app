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

const config = loadConfig();
const sql = await Promise.all(
  ['schema.sql', 'seed.sql'].map((file) => readFile(`${dbDir}${file}`, 'utf8')),
);

for (const url of [config.databaseUrl, config.testDatabaseUrl]) {
  await ensureDatabase(url);
  await resetAndApply(url, sql);
  await seedDemoUsers(url);
  console.log(`initialised database "${databaseName(url)}"`);
}
