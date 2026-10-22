export interface Config {
  host: string;
  port: number;
  databaseUrl: string;
  testDatabaseUrl: string;
  jwtSecret: string;
  /** Send the session cookie over HTTPS only. */
  cookieSecure: boolean;
}

const DEFAULT_DATABASE_URL = 'postgres://wayfarer:wayfarer@localhost:5432/wayfarer';
const DEFAULT_TEST_DATABASE_URL = 'postgres://wayfarer:wayfarer@localhost:5432/wayfarer_test';
const DEV_JWT_SECRET = 'dev-only-insecure-secret-change-me';

/** Reads settings from the environment; every value has a local-dev default except the production JWT secret. */
export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const rawPort = env.PORT ?? '3001';
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT: ${rawPort}`);
  }
  const production = env.NODE_ENV === 'production';
  if (production && !env.JWT_SECRET) {
    throw new Error('JWT_SECRET must be set in production');
  }
  return {
    host: env.HOST ?? '127.0.0.1',
    port,
    databaseUrl: env.DATABASE_URL ?? DEFAULT_DATABASE_URL,
    testDatabaseUrl: env.TEST_DATABASE_URL ?? DEFAULT_TEST_DATABASE_URL,
    jwtSecret: env.JWT_SECRET ?? DEV_JWT_SECRET,
    cookieSecure: production,
  };
}
