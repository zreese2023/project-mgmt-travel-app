import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  auth,
  createTestApp,
  daysFromNow,
  findFlights,
  findHotelRoom,
  registerUser,
  type TestUser,
} from '../helpers/app.js';

interface Item {
  id: number;
  kind: string;
  title: string;
  day: string;
  startTime: string | null;
  position: number;
}
interface Detail {
  trip: {
    id: number;
    name: string;
    startDate: string;
    endDate: string;
    destination: { slug: string };
  };
  days: Array<{ day: string; dayNumber: number | null; items: Item[] }>;
  summary: { days: number; items: number; byKind: Record<string, number> };
}

describe('Itinerary (real Postgres)', () => {
  let app: FastifyInstance;
  let user: TestUser;
  beforeAll(async () => {
    app = await createTestApp();
    user = await registerUser(app);
  });
  afterAll(async () => {
    await app.close();
  });

  const start = daysFromNow(20);
  const end = daysFromNow(23); // 4 days

  const call = (
    method: 'GET' | 'POST' | 'DELETE',
    url: string,
    who: TestUser | null,
    payload?: object,
  ) =>
    app.inject({
      method,
      url: `/api${url}`,
      ...(who ? { headers: auth(who) } : {}),
      ...(payload ? { payload } : {}),
    });

  const newTrip = async (who = user, destinationSlug = 'tokyo'): Promise<number> => {
    const res = await call('POST', '/trips', who, {
      destinationSlug,
      name: 'Tokyo trip',
      startDate: start,
      endDate: end,
    });
    expect(res.statusCode).toBe(201);
    return res.json().trip.id;
  };
  const detail = async (id: number, who = user): Promise<Detail> =>
    (await call('GET', `/trips/${id}`, who)).json();
  const addItem = (tripId: number, body: object, who = user) =>
    call('POST', `/trips/${tripId}/items`, who, body);

  describe('SCRUM-31: create itinerary', () => {
    it('creates a trip with a day-by-day timeline and saves it to the account', async () => {
      const id = await newTrip();
      const body = await detail(id);
      expect(body.trip).toMatchObject({
        name: 'Tokyo trip',
        startDate: start,
        endDate: end,
        destination: { slug: 'tokyo', airportCode: 'NRT' },
      });
      expect(body.days.map((d) => d.dayNumber)).toEqual([1, 2, 3, 4]);
      expect(body.summary).toMatchObject({ days: 4, items: 0 });

      const list = (await call('GET', '/trips', user)).json().trips as Array<{
        id: number;
        itemCount: number;
      }>;
      expect(list.map((t) => t.id)).toContain(id);
    });

    it('rejects bad dates, a blank name and an unknown destination', async () => {
      const reversed = await call('POST', '/trips', user, {
        destinationSlug: 'tokyo',
        name: 'x',
        startDate: end,
        endDate: start,
      });
      expect(reversed.statusCode).toBe(422);
      const blank = await call('POST', '/trips', user, {
        destinationSlug: 'tokyo',
        name: '  ',
        startDate: start,
        endDate: end,
      });
      expect(blank.statusCode).toBe(422);
      const unknown = await call('POST', '/trips', user, {
        destinationSlug: 'atlantis',
        name: 'x',
        startDate: start,
        endDate: end,
      });
      expect(unknown.statusCode).toBe(404);
    });

    it('adds a destination activity to a day', async () => {
      const id = await newTrip();
      const dest = (await app.inject({ method: 'GET', url: '/api/destinations/tokyo' })).json()
        .destination;
      const activity = dest.activities[0];
      const res = await addItem(id, {
        kind: 'activity',
        activityId: activity.id,
        day: start,
        startTime: '10:00',
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().item).toMatchObject({
        kind: 'activity',
        title: activity.name,
        day: start,
        startTime: '10:00',
      });
    });

    it('rejects an activity from a different destination', async () => {
      const id = await newTrip();
      const paris = (await app.inject({ method: 'GET', url: '/api/destinations/paris' })).json()
        .destination;
      const res = await addItem(id, {
        kind: 'activity',
        activityId: paris.activities[0].id,
        day: start,
      });
      expect(res.statusCode).toBe(422);
    });

    it('adds a custom timed activity ("Visit Shibuya station at 1:00 pm") and orders the day by time', async () => {
      const id = await newTrip();
      await addItem(id, {
        kind: 'activity',
        title: 'Dinner in Shinjuku',
        day: start,
        startTime: '19:00',
      });
      await addItem(id, {
        kind: 'activity',
        title: 'Visit Shibuya station',
        day: start,
        startTime: '13:00',
      });
      await addItem(id, { kind: 'note', title: 'Buy a Suica card', day: start });
      await addItem(id, { kind: 'activity', title: 'Breakfast', day: start, startTime: '08:30' });

      const first = (await detail(id)).days[0] as Detail['days'][number];
      expect(first.items.map((i) => i.title)).toEqual([
        'Breakfast',
        'Visit Shibuya station',
        'Dinner in Shinjuku',
        'Buy a Suica card',
      ]);
      expect(first.items.map((i) => i.position)).toEqual([0, 1, 2, 3]);
    });

    it('validates item input: day within the trip, time format, title', async () => {
      const id = await newTrip();
      expect(
        (await addItem(id, { kind: 'note', title: 'x', day: daysFromNow(60) })).statusCode,
      ).toBe(422);
      expect(
        (await addItem(id, { kind: 'note', title: 'x', day: start, startTime: '25:00' }))
          .statusCode,
      ).toBe(422);
      expect((await addItem(id, { kind: 'note', title: '  ', day: start })).statusCode).toBe(422);
      expect((await addItem(id, { kind: 'note', day: start })).statusCode).toBe(422);
    });

    it('adds a flight selection and a hotel selection onto the right days', async () => {
      const id = await newTrip();
      const { outbound } = await findFlights(app, 'JFK', 'NRT', start);
      const flight = outbound[0] as { id: number; flightNo: string };
      const flightRes = await addItem(id, { kind: 'flight', flightId: flight.id });
      expect(flightRes.statusCode).toBe(201);
      expect(flightRes.json().item).toMatchObject({ kind: 'flight', day: start });
      expect(flightRes.json().item.title).toContain(flight.flightNo);

      const { hotelId } = await findHotelRoom(app, 'tokyo', start, end);
      const hotelRes = await addItem(id, { kind: 'hotel', hotelId, checkIn: start, checkOut: end });
      expect(hotelRes.statusCode).toBe(201);
      expect(hotelRes.json().item).toMatchObject({ kind: 'hotel', day: start });
      expect(hotelRes.json().item.notes).toContain(end);

      const body = await detail(id);
      expect(body.summary.byKind).toMatchObject({ flight: 1, hotel: 1 });
    });

    it('rejects a flight that departs outside the trip dates', async () => {
      const id = await newTrip();
      const { outbound } = await findFlights(app, 'JFK', 'NRT', daysFromNow(40));
      const res = await addItem(id, {
        kind: 'flight',
        flightId: (outbound[0] as { id: number }).id,
      });
      expect(res.statusCode).toBe(422);
    });
  });

  describe('SCRUM-32: add and remove itinerary items', () => {
    it('removes an item and closes the gap in the day order', async () => {
      const id = await newTrip();
      const a = (await addItem(id, { kind: 'note', title: 'A', day: start })).json().item;
      await addItem(id, { kind: 'note', title: 'B', day: start });
      await addItem(id, { kind: 'note', title: 'C', day: start });
      expect((await call('DELETE', `/trips/${id}/items/${a.id}`, user)).statusCode).toBe(204);

      const items = (await detail(id)).days[0]?.items ?? [];
      expect(items.map((i) => [i.title, i.position])).toEqual([
        ['B', 0],
        ['C', 1],
      ]);
      expect((await call('DELETE', `/trips/${id}/items/${a.id}`, user)).statusCode).toBe(404);
    });

    it('deletes a trip together with its items', async () => {
      const id = await newTrip();
      await addItem(id, { kind: 'note', title: 'x', day: start });
      expect((await call('DELETE', `/trips/${id}`, user)).statusCode).toBe(204);
      expect((await call('GET', `/trips/${id}`, user)).statusCode).toBe(404);
      expect((await call('DELETE', `/trips/${id}`, user)).statusCode).toBe(404);
    });
  });

  describe('Authorisation', () => {
    it("hides one user's trips and items from another (404, not 403)", async () => {
      const id = await newTrip();
      const item = (await addItem(id, { kind: 'note', title: 'Private', day: start })).json().item;
      const other = await registerUser(app, 'Other');

      expect((await call('GET', `/trips/${id}`, other)).statusCode).toBe(404);
      expect((await call('DELETE', `/trips/${id}`, other)).statusCode).toBe(404);
      expect((await addItem(id, { kind: 'note', title: 'x', day: start }, other)).statusCode).toBe(
        404,
      );
      expect((await call('DELETE', `/trips/${id}/items/${item.id}`, other)).statusCode).toBe(404);
      expect(((await call('GET', '/trips', other)).json().trips as unknown[]).length).toBe(0);
    });

    it('requires a session for every itinerary route', async () => {
      expect((await call('GET', '/trips', null)).statusCode).toBe(401);
      expect(
        (
          await call('POST', '/trips', null, {
            destinationSlug: 'tokyo',
            name: 'x',
            startDate: start,
            endDate: end,
          })
        ).statusCode,
      ).toBe(401);
      expect((await call('GET', '/trips/1', null)).statusCode).toBe(401);
    });
  });
});
