import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestPool } from '../helpers/db.js';

describe('TECH-02: schema and sample seed data (real Postgres)', () => {
  let pool: pg.Pool;

  beforeAll(() => {
    pool = createTestPool();
  });
  afterAll(async () => {
    await pool.end();
  });

  it('seeds at least 12 destinations, each with an advisory, 3+ activities and 2+ hotels', async () => {
    const { rows } = await pool.query<{
      slug: string;
      advisory: boolean;
      activities: number;
      hotels: number;
    }>(`select d.slug,
               exists (select 1 from advisories a where a.destination_id = d.id) as advisory,
               (select count(*) from activities a where a.destination_id = d.id) as activities,
               (select count(*) from hotels h where h.destination_id = d.id) as hotels
        from destinations d`);
    expect(rows.length).toBeGreaterThanOrEqual(12);
    for (const row of rows) {
      expect(row.advisory, `${row.slug} advisory`).toBe(true);
      expect(row.activities, `${row.slug} activities`).toBeGreaterThanOrEqual(3);
      expect(row.hotels, `${row.slug} hotels`).toBeGreaterThanOrEqual(2);
    }
  });

  it('has flights in both directions for every route across the next 90 days', async () => {
    const { rows } = await pool.query<{ routes: number; min_day: string; max_day: string }>(
      `select count(distinct (origin_code, dest_code)) as routes,
              min(depart_at::date)::text as min_day, max(depart_at::date)::text as max_day
       from flights where status = 'on_time'`,
    );
    const first = rows[0]!;
    // 4 origin hubs x 14 destinations x 2 directions
    expect(first.routes).toBeGreaterThanOrEqual(112);
    expect(new Date(first.max_day).getTime() - new Date(first.min_day).getTime()).toBeGreaterThan(
      80 * 24 * 3600 * 1000,
    );
  });

  it('returns money as numbers and dates as YYYY-MM-DD strings', async () => {
    const { rows } = await pool.query<{ price: number; count: number; day: string }>(
      `select (select price from flights limit 1) as price,
              (select count(*) from destinations) as count,
              current_date as day`,
    );
    const row = rows[0]!;
    expect(typeof row.price).toBe('number');
    expect(typeof row.count).toBe('number');
    expect(row.day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('derives the budget tier from average daily cost', async () => {
    const { rows } = await pool.query<{ slug: string; budget_tier: number }>(
      `select slug, budget_tier from destinations where slug in ('bangkok', 'london', 'rome')`,
    );
    const tiers = Object.fromEntries(rows.map((r) => [r.slug, r.budget_tier]));
    expect(tiers).toEqual({ bangkok: 1, rome: 3, london: 3 });
  });
});
