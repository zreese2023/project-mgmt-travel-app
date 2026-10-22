import { describe, expect, it } from 'vitest';
import { AppError } from '../../src/lib/errors.js';
import {
  createUser,
  findUserById,
  findUserWithHash,
  normalizeEmail,
  toPublicUser,
  validateRegistration,
} from '../../src/lib/users.js';
import { mockDb } from '../helpers/mockDb.js';

const userRow = { id: 1, email: 'ada@example.com', name: 'Ada', role: 'user' as const };
const user = toPublicUser(userRow);

describe('SCRUM-34: registration validation', () => {
  it('accepts a good registration', () => {
    expect(validateRegistration({ email: 'a@b.co', name: 'Ada', password: 'longenough' })).toEqual(
      {},
    );
  });

  it('reports every bad field', () => {
    const errors = validateRegistration({ email: 'nope', name: ' ', password: 'short' });
    expect(Object.keys(errors).sort()).toEqual(['email', 'name', 'password']);
  });

  it('normalises email case and whitespace', () => {
    expect(normalizeEmail('  Ada@Example.COM ')).toBe('ada@example.com');
  });
});

describe('SCRUM-34: user queries (mocked DB)', () => {
  it('creates a user and returns the public shape without the hash', async () => {
    const { db, query } = mockDb([userRow]);
    const created = await createUser(db, {
      email: 'Ada@Example.com',
      name: 'Ada',
      passwordHash: 'h',
    });
    expect(created).toEqual(user);
    expect(JSON.stringify(created)).not.toContain('password');
    expect((query.mock.calls[0] as unknown[])[1]).toEqual(['ada@example.com', 'Ada', 'h', 'user']);
  });

  it('turns a unique violation into a 409 email_taken error', async () => {
    const db = {
      query: async () => Promise.reject(Object.assign(new Error('dup'), { code: '23505' })),
    };
    await expect(
      createUser(db as never, { email: 'a@b.co', name: 'A', passwordHash: 'h' }),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: 'email_taken',
    });
  });

  it('rethrows other database errors untouched', async () => {
    const boom = new Error('connection lost');
    const db = { query: async () => Promise.reject(boom) };
    await expect(
      createUser(db as never, { email: 'a@b.co', name: 'A', passwordHash: 'h' }),
    ).rejects.toBe(boom);
  });

  it('finds users by email (with hash) and id, or null', async () => {
    expect(
      await findUserWithHash(mockDb([{ ...userRow, password_hash: 'h' }]).db, 'ADA@example.com'),
    ).toEqual({
      user,
      passwordHash: 'h',
    });
    expect(await findUserWithHash(mockDb([]).db, 'x@y.z')).toBeNull();
    expect(await findUserById(mockDb([userRow]).db, 1)).toEqual(user);
    expect(await findUserById(mockDb([]).db, 2)).toBeNull();
  });
});

describe('AppError', () => {
  it('carries status, code and details', () => {
    const err = new AppError(409, 'x', 'msg', { a: 'b' });
    expect([err.statusCode, err.code, err.details, err.name]).toEqual([
      409,
      'x',
      { a: 'b' },
      'AppError',
    ]);
  });
});
