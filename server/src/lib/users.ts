import type { Queryable } from './db.js';
import { AppError } from './errors.js';

export type Role = 'user' | 'admin';

export interface PublicUser {
  id: number;
  email: string;
  name: string;
  role: Role;
}

interface UserRow {
  id: number;
  email: string;
  name: string;
  role: Role;
  password_hash?: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USER_COLUMNS = 'id, email, name, role';

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function validateRegistration(input: {
  email: string;
  name: string;
  password: string;
}): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!EMAIL_PATTERN.test(normalizeEmail(input.email))) {
    errors.email = 'Enter a valid email address';
  }
  if (input.name.trim().length < 1) errors.name = 'Name is required';
  if (input.password.length < 8) errors.password = 'Password must be at least 8 characters';
  return errors;
}

export function toPublicUser(row: UserRow): PublicUser {
  return { id: row.id, email: row.email, name: row.name, role: row.role };
}

export async function createUser(
  db: Queryable,
  input: { email: string; name: string; passwordHash: string; role?: Role },
): Promise<PublicUser> {
  try {
    const { rows } = await db.query<UserRow>(
      `insert into users (email, name, password_hash, role) values ($1, $2, $3, $4)
       returning ${USER_COLUMNS}`,
      [normalizeEmail(input.email), input.name.trim(), input.passwordHash, input.role ?? 'user'],
    );
    return toPublicUser(rows[0] as UserRow);
  } catch (err) {
    if (typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505') {
      throw new AppError(409, 'email_taken', 'An account with that email already exists');
    }
    throw err;
  }
}

export async function findUserWithHash(
  db: Queryable,
  email: string,
): Promise<{ user: PublicUser; passwordHash: string } | null> {
  const { rows } = await db.query<UserRow>(
    `select ${USER_COLUMNS}, password_hash from users where email = $1`,
    [normalizeEmail(email)],
  );
  const row = rows[0];
  if (!row || !row.password_hash) return null;
  return { user: toPublicUser(row), passwordHash: row.password_hash };
}

export async function findUserById(db: Queryable, id: number): Promise<PublicUser | null> {
  const { rows } = await db.query<UserRow>(`select ${USER_COLUMNS} from users where id = $1`, [id]);
  return rows[0] ? toPublicUser(rows[0]) : null;
}
