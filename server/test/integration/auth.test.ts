import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auth, createTestApp, loginAs, registerUser } from '../helpers/app.js';

describe('SCRUM-34: accounts (real Postgres)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
  });

  const email = () => `user-${randomUUID()}@test.local`;

  it('registers an account, signs the user in with an httpOnly cookie and never returns the hash', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: email(), name: 'Ada', password: 'longenough1' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().user).toMatchObject({
      name: 'Ada',
      role: 'user',
    });
    expect(JSON.stringify(res.json())).not.toMatch(/hash|password/i);
    const cookie = res.cookies.find((c) => c.name === 'wf_token');
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe('Lax');
  });

  it('rejects a duplicate email (case-insensitively) with 409', async () => {
    const address = email();
    await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: address, name: 'A', password: 'longenough1' },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: address.toUpperCase(), name: 'B', password: 'longenough1' },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('email_taken');
  });

  it('rejects invalid registrations with field errors', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'nope', name: 'A', password: 'short' },
    });
    expect(res.statusCode).toBe(422);
    expect(Object.keys(res.json().error.details).sort()).toEqual(['email', 'password']);
  });

  it('logs in with the right password and rejects a wrong password or unknown email the same way', async () => {
    const user = await registerUser(app);
    const ok = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: user.email, password: user.password },
    });
    expect(ok.statusCode).toBe(200);

    const wrong = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: user.email, password: 'wrong-password' },
    });
    const unknown = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: email(), password: 'wrong-password' },
    });
    expect(wrong.statusCode).toBe(401);
    expect(unknown.statusCode).toBe(401);
    expect(wrong.json()).toEqual(unknown.json());
  });

  it('returns the current user from the cookie and 401 without one', async () => {
    const user = await registerUser(app, 'Grace');
    const me = await app.inject({ method: 'GET', url: '/api/me', headers: auth(user) });
    expect(me.statusCode).toBe(200);
    expect(me.json().user.name).toBe('Grace');

    expect((await app.inject({ method: 'GET', url: '/api/me' })).statusCode).toBe(401);
    expect(
      (await app.inject({ method: 'GET', url: '/api/me', headers: { cookie: 'wf_token=garbage' } }))
        .statusCode,
    ).toBe(401);
  });

  it('logs out by clearing the cookie', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/auth/logout' });
    expect(res.statusCode).toBe(204);
    expect(res.cookies.find((c) => c.name === 'wf_token')?.value).toBe('');
  });

  it('has a working demo account from db:init', async () => {
    const cookie = await loginAs(app, 'demo@wayfarer.test', 'wayfarer123');
    const me = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } });
    expect(me.json().user).toMatchObject({ email: 'demo@wayfarer.test', role: 'user' });
  });

  it('no longer exposes profile editing or admin-only data', async () => {
    const user = await registerUser(app);
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/me',
      headers: auth(user),
      payload: { name: 'x' },
    });
    expect(res.statusCode).toBe(404);
    const me = await app.inject({ method: 'GET', url: '/api/me', headers: auth(user) });
    expect(Object.keys(me.json().user).sort()).toEqual(['email', 'id', 'name', 'role']);
  });
});
