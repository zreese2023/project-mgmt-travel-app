import type { Queryable } from './db.js';

/** The kinds of alert the app raises (SCRUM-33). */
export type NotificationType = 'weather' | 'advisory' | 'delay';

export interface NewNotification {
  userId: number;
  type: NotificationType;
  title: string;
  body: string;
  /** A second notification with the same key for the same user is ignored (no repeats). */
  dedupeKey: string;
}

export interface Notification {
  id: number;
  type: NotificationType;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
}

interface NotificationRow {
  id: number;
  type: NotificationType;
  title: string;
  body: string;
  read_at: Date | null;
  created_at: Date;
}

/**
 * Creates the in-app notification and a SIMULATED email in `email_outbox` (no mail is sent).
 * Returns the notification id, or null when the dedupe key already existed.
 */
export async function createNotification(
  db: Queryable,
  input: NewNotification,
): Promise<number | null> {
  const { rows } = await db.query<{ id: number }>(
    `insert into notifications (user_id, type, title, body, dedupe_key)
     values ($1, $2, $3, $4, $5)
     on conflict (user_id, dedupe_key) do nothing
     returning id`,
    [input.userId, input.type, input.title, input.body, input.dedupeKey],
  );
  const id = rows[0]?.id;
  if (id === undefined) return null;
  await db.query(
    `insert into email_outbox (user_id, notification_id, to_email, subject, body)
     select $1, $2, email, $3, $4 from users where id = $1`,
    [input.userId, id, input.title, input.body],
  );
  return id;
}

export function toNotification(row: NotificationRow): Notification {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    read: row.read_at !== null,
    createdAt: row.created_at.toISOString(),
  };
}

export async function listNotifications(db: Queryable, userId: number): Promise<Notification[]> {
  const { rows } = await db.query<NotificationRow>(
    `select id, type, title, body, read_at, created_at from notifications
     where user_id = $1 order by created_at desc, id desc limit 100`,
    [userId],
  );
  return rows.map(toNotification);
}

export async function markAllRead(db: Queryable, userId: number): Promise<number> {
  const { rowCount } = await db.query(
    'update notifications set read_at = now() where user_id = $1 and read_at is null',
    [userId],
  );
  return rowCount ?? 0;
}
