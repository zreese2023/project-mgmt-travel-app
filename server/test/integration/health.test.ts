import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { loadConfig } from '../../src/lib/config.js';

describe('TECH-01: GET /api/health (real Postgres)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const config = loadConfig();
    app = await buildApp({ databaseUrl: config.testDatabaseUrl, jwtSecret: config.jwtSecret });
  });

  afterAll(async () => {
    await app.close();
  });

  it('reports the API and database as up', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok', db: 'up' });
  });
});
