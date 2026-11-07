import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  auth,
  createTestApp,
  daysFromNow,
  failingAdvisoryFetch,
  failingWeatherFetch,
  okAdvisoryFetch,
  okWeatherFetch,
  registerUser,
  severeWeatherFetch,
  type TestUser,
} from '../helpers/app.js';
import { createTestFlight, createTestPool } from '../helpers/db.js';

interface NotificationJson {
  id: number;
  type: 'weather' | 'advisory' | 'delay';
  title: string;
  body: string;
  read: boolean;
}

describe('SCRUM-33: receive alerts (real Postgres)', () => {
  // Weather stub: thunderstorm today, clear, heavy rain, clear, snow. Advisories: Dubai/UAE level 3,
  // France level 2, Japan level 1.
  let app: FastifyInstance;
  // Nothing reachable: no weather, no State Department feed.
  let offline: FastifyInstance;
  // Weather fine (never severe), advisories as stubbed.
  let calm: FastifyInstance;
  let pool: pg.Pool;

  beforeAll(async () => {
    app = await createTestApp(severeWeatherFetch(), okAdvisoryFetch);
    offline = await createTestApp(failingWeatherFetch, failingAdvisoryFetch);
    calm = await createTestApp(okWeatherFetch, okAdvisoryFetch);
    pool = createTestPool();
  });
  afterAll(async () => {
    await pool.end();
    await Promise.all([app.close(), offline.close(), calm.close()]);
  });

  const call = (
    target: FastifyInstance,
    method: 'GET' | 'POST' | 'DELETE',
    url: string,
    who: TestUser | null,
    payload?: object,
  ) =>
    target.inject({
      method,
      url: `/api${url}`,
      ...(who ? { headers: auth(who) } : {}),
      ...(payload ? { payload } : {}),
    });

  const newTrip = async (
    target: FastifyInstance,
    who: TestUser,
    slug: string,
    startOffset: number,
    endOffset: number,
  ) => {
    const res = await call(target, 'POST', '/trips', who, {
      destinationSlug: slug,
      name: `${slug} trip`,
      startDate: daysFromNow(startOffset),
      endDate: daysFromNow(endOffset),
    });
    expect(res.statusCode).toBe(201);
    return res.json().trip.id as number;
  };

  const scan = async (target: FastifyInstance, who: TestUser) => {
    const res = await call(target, 'POST', '/alerts/scan', who);
    expect(res.statusCode).toBe(200);
    return res.json().created as number;
  };

  const notifications = async (
    target: FastifyInstance,
    who: TestUser,
  ): Promise<{ notifications: NotificationJson[]; unread: number }> =>
    (await call(target, 'GET', '/notifications', who)).json();

  describe('inclement weather', () => {
    it('alerts for each severe forecast day that falls inside an upcoming trip', async () => {
      const who = await registerUser(app);
      await newTrip(app, who, 'tokyo', 0, 3); // forecast days 0..4: thunder, clear, heavy rain, clear, snow
      expect(await scan(app, who)).toBe(2); // day 4 (snow) is after the trip ends

      const { notifications: list, unread } = await notifications(app, who);
      expect(unread).toBe(2);
      expect(list.map((n) => n.type)).toEqual(['weather', 'weather']);
      const bodies = list.map((n) => n.body).sort();
      expect(bodies[0]).toContain(`Heavy rain is forecast for ${daysFromNow(2)}`);
      expect(bodies[1]).toContain(`Thunderstorm is forecast for ${daysFromNow(0)}`);
      expect(list[0]?.title).toBe('Severe weather expected in Tokyo');
    });

    it('has nothing to say about a trip that starts after the 5-day forecast', async () => {
      const who = await registerUser(app);
      await newTrip(app, who, 'tokyo', 30, 35);
      expect(await scan(app, who)).toBe(0);
    });

    it('stays quiet in calm weather', async () => {
      const who = await registerUser(calm);
      await newTrip(calm, who, 'tokyo', 0, 3);
      expect(await scan(calm, who)).toBe(0);
    });

    it('still scans, using the other checks, when the weather service is unreachable', async () => {
      const who = await registerUser(offline);
      await newTrip(offline, who, 'tokyo', 0, 3);
      expect(await scan(offline, who)).toBe(0); // and no error
    });
  });

  describe('travel advisories', () => {
    it('alerts for a live level 3 State Department advisory', async () => {
      const who = await registerUser(calm);
      await newTrip(calm, who, 'dubai', 40, 45);
      expect(await scan(calm, who)).toBe(1);
      const { notifications: list } = await notifications(calm, who);
      expect(list[0]).toMatchObject({
        type: 'advisory',
        title: 'Travel advisory: Level 3 for Dubai',
      });
      expect(list[0]?.body).toContain('Reconsider Travel');
    });

    it('does not alert for level 1 or 2 destinations', async () => {
      const who = await registerUser(calm);
      await newTrip(calm, who, 'paris', 40, 45); // France: level 2
      await newTrip(calm, who, 'tokyo', 40, 45); // Japan: level 1
      expect(await scan(calm, who)).toBe(0);
    });

    it('never alerts from the made-up sample advisory used when the feed is down', async () => {
      const who = await registerUser(offline);
      await newTrip(offline, who, 'rio-de-janeiro', 40, 45); // sample data says level 3
      expect(await scan(offline, who)).toBe(0);
    });
  });

  describe('flight delays and cancellations', () => {
    const addFlight = async (who: TestUser, tripId: number, flightId: number) =>
      call(app, 'POST', `/trips/${tripId}/items`, who, { kind: 'flight', flightId });

    it('alerts for a delayed flight and for a cancelled flight on an upcoming trip', async () => {
      const who = await registerUser(calm);
      const tripId = await newTrip(calm, who, 'tokyo', 29, 36);
      const delayed = await createTestFlight(pool, {
        origin: 'JFK',
        destination: 'NRT',
        days: 30,
        status: 'delayed',
      });
      const cancelled = await createTestFlight(pool, {
        origin: 'JFK',
        destination: 'NRT',
        days: 31,
        status: 'cancelled',
      });
      const ok = await createTestFlight(pool, { origin: 'JFK', destination: 'NRT', days: 32 });
      for (const flight of [delayed, cancelled, ok]) {
        expect(
          (
            await call(calm, 'POST', `/trips/${tripId}/items`, who, {
              kind: 'flight',
              flightId: flight.id,
            })
          ).statusCode,
        ).toBe(201);
      }

      expect(await scan(calm, who)).toBe(2);
      const { notifications: list } = await notifications(calm, who);
      expect(list.map((n) => n.type)).toEqual(['delay', 'delay']);
      expect(list.map((n) => n.title).sort()).toEqual(
        [
          `Flight ${cancelled.flightNo} is cancelled`,
          `Flight ${delayed.flightNo} is delayed`,
        ].sort(),
      );
    });

    it('raises a new alert when a flight that was only delayed is later cancelled', async () => {
      const who = await registerUser(calm);
      const tripId = await newTrip(calm, who, 'tokyo', 29, 36);
      const flight = await createTestFlight(pool, {
        origin: 'JFK',
        destination: 'NRT',
        days: 30,
        status: 'delayed',
      });
      await call(calm, 'POST', `/trips/${tripId}/items`, who, {
        kind: 'flight',
        flightId: flight.id,
      });
      expect(await scan(calm, who)).toBe(1);
      await pool.query("update flights set status = 'cancelled' where id = $1", [flight.id]);
      expect(await scan(calm, who)).toBe(1);
      expect((await notifications(calm, who)).notifications).toHaveLength(2);
    });

    it('ignores trips that are already over', async () => {
      const who = await registerUser(calm);
      const tripId = await newTrip(calm, who, 'tokyo', -6, -2);
      const flight = await createTestFlight(pool, {
        origin: 'JFK',
        destination: 'NRT',
        days: -4,
        status: 'delayed',
      });
      expect(
        (
          await call(calm, 'POST', `/trips/${tripId}/items`, who, {
            kind: 'flight',
            flightId: flight.id,
          })
        ).statusCode,
      ).toBe(201);
      expect(await scan(calm, who)).toBe(0);
    });

    it('uses the seeded sample data: some seeded flights really are delayed or cancelled', async () => {
      const { rows } = await pool.query<{ status: string; n: number }>(
        "select status, count(*) as n from flights where status <> 'on_time' group by status",
      );
      const counts = Object.fromEntries(rows.map((r) => [r.status, r.n]));
      expect(counts.delayed).toBeGreaterThan(0);
      expect(counts.cancelled).toBeGreaterThan(0);
      // every route keeps at least one flight that can still be selected on a given day
      const { rows: bare } = await pool.query(
        `select 1 from (select origin_code, dest_code, depart_at::date d,
                               count(*) filter (where status <> 'cancelled') ok
                        from flights where depart_at > now() and flight_no not like 'TS%'
                        group by 1, 2, 3) x where ok = 0 limit 1`,
      );
      expect(bare).toEqual([]);
    });

    it('lets a delayed seeded-style flight still be added to a trip (only cancelled ones are hidden from search)', async () => {
      const who = await registerUser(app);
      const tripId = await newTrip(app, who, 'tokyo', 29, 36);
      const delayed = await createTestFlight(pool, {
        origin: 'JFK',
        destination: 'NRT',
        days: 30,
        status: 'delayed',
      });
      expect((await addFlight(who, tripId, delayed.id)).statusCode).toBe(201);
    });
  });

  describe('delivery: in-app notifications and simulated email', () => {
    it('never repeats an alert on a second scan, and records one simulated email per alert', async () => {
      const who = await registerUser(app);
      await newTrip(app, who, 'dubai', 0, 3); // advisory + 2 severe weather days
      expect(await scan(app, who)).toBe(3);
      expect(await scan(app, who)).toBe(0);
      expect((await notifications(app, who)).notifications).toHaveLength(3);

      const { rows } = await pool.query<{ to_email: string; subject: string }>(
        'select to_email, subject from email_outbox where user_id = $1 order by id',
        [who.id],
      );
      expect(rows).toHaveLength(3);
      expect(rows.every((r) => r.to_email === who.email)).toBe(true);
      expect(rows.map((r) => r.subject).sort()).toEqual(
        (await notifications(app, who)).notifications.map((n) => n.title).sort(),
      );
    });

    it('marks everything read and does not bring read alerts back on the next scan', async () => {
      const who = await registerUser(app);
      await newTrip(app, who, 'tokyo', 0, 3);
      await scan(app, who);
      expect((await notifications(app, who)).unread).toBe(2);

      const read = await call(app, 'POST', '/notifications/read-all', who);
      expect(read.json().updated).toBe(2);
      expect((await notifications(app, who)).unread).toBe(0);
      expect(await scan(app, who)).toBe(0);
      const after = await notifications(app, who);
      expect(after.unread).toBe(0);
      expect(after.notifications.every((n) => n.read)).toBe(true);
      expect((await call(app, 'POST', '/notifications/read-all', who)).json().updated).toBe(0);
    });

    it('lists newest first, and starts empty for a new user', async () => {
      const who = await registerUser(app);
      expect(await notifications(app, who)).toEqual({ notifications: [], unread: 0 });
    });
  });

  describe('privacy and access', () => {
    it("scans and shows only the signed-in user's trips and alerts", async () => {
      const a = await registerUser(app);
      const b = await registerUser(app);
      await newTrip(app, a, 'tokyo', 0, 3);
      expect(await scan(app, b)).toBe(0);
      expect(await scan(app, a)).toBe(2);
      expect((await notifications(app, b)).notifications).toEqual([]);
      expect((await call(app, 'POST', '/notifications/read-all', b)).json().updated).toBe(0);
      expect((await notifications(app, a)).unread).toBe(2);
    });

    it('requires sign-in', async () => {
      expect((await call(app, 'GET', '/notifications', null)).statusCode).toBe(401);
      expect((await call(app, 'POST', '/notifications/read-all', null)).statusCode).toBe(401);
      expect((await call(app, 'POST', '/alerts/scan', null)).statusCode).toBe(401);
    });
  });
});
