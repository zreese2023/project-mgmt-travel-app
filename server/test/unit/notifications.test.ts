import { describe, expect, it } from 'vitest';
import {
  createNotification,
  listNotifications,
  markAllRead,
  toNotification,
} from '../../src/lib/notifications.js';
import { mockDb } from '../helpers/mockDb.js';

const alert = {
  userId: 1,
  type: 'weather' as const,
  title: 'Severe weather expected in Tokyo',
  body: 'Thunderstorm is forecast.',
  dedupeKey: 'weather:7:2026-11-11',
};

describe('SCRUM-33: notifications (mocked DB)', () => {
  it('creates the notification and a simulated email addressed to the user', async () => {
    const { db, query } = mockDb([{ id: 5 }], []);
    expect(await createNotification(db, alert)).toBe(5);
    expect(query).toHaveBeenCalledTimes(2);
    const [insertSql, insertValues] = query.mock.calls[0] as [string, unknown[]];
    expect(insertSql).toContain('on conflict (user_id, dedupe_key) do nothing');
    expect(insertValues).toEqual([1, 'weather', alert.title, alert.body, alert.dedupeKey]);
    const [emailSql, emailValues] = query.mock.calls[1] as [string, unknown[]];
    expect(emailSql).toContain('email_outbox');
    expect(emailValues).toEqual([1, 5, alert.title, alert.body]);
  });

  it('does nothing, and sends no email, when the dedupe key already exists', async () => {
    const { db, query } = mockDb([]);
    expect(await createNotification(db, alert)).toBeNull();
    expect(query).toHaveBeenCalledOnce();
  });

  it('lists notifications newest first with read flags', async () => {
    const created = new Date('2026-11-10T12:00:00Z');
    const rows = [
      { id: 2, type: 'advisory', title: 'B', body: 'b', read_at: null, created_at: created },
      { id: 1, type: 'weather', title: 'A', body: 'a', read_at: created, created_at: created },
    ];
    const list = await listNotifications(mockDb(rows).db, 1);
    expect(list.map((n) => [n.id, n.type, n.read])).toEqual([
      [2, 'advisory', false],
      [1, 'weather', true],
    ]);
    expect(toNotification(rows[0] as never).createdAt).toBe('2026-11-10T12:00:00.000Z');
  });

  it('marks everything read and reports how many changed', async () => {
    expect(await markAllRead({ query: async () => ({ rowCount: 3 }) } as never, 1)).toBe(3);
    expect(await markAllRead({ query: async () => ({ rowCount: null }) } as never, 1)).toBe(0);
  });
});
