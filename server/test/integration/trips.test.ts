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
  cost: { lines: Array<{ kind: string; amount: number }>; total: number };
  payment: { amount: number; status: string } | null;
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
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
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

  describe('SCRUM-32: add, edit, rearrange and remove itinerary items', () => {
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

    it('edits title, notes and time, repositioning by time', async () => {
      const id = await newTrip();
      await addItem(id, { kind: 'note', title: 'Early', day: start, startTime: '08:00' });
      const late = (
        await addItem(id, { kind: 'note', title: 'Late', day: start, startTime: '20:00' })
      ).json().item;
      const res = await call('PATCH', `/trips/${id}/items/${late.id}`, user, {
        title: 'Moved',
        startTime: '07:00',
        notes: 'bring camera',
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().item).toMatchObject({
        title: 'Moved',
        startTime: '07:00',
        notes: 'bring camera',
      });
      expect(((await detail(id)).days[0]?.items ?? []).map((i) => i.title)).toEqual([
        'Moved',
        'Early',
      ]);

      const cleared = await call('PATCH', `/trips/${id}/items/${late.id}`, user, {
        startTime: null,
        notes: null,
      });
      expect(cleared.json().item).toMatchObject({ startTime: null, notes: null });
    });

    it('moves an item to another day and re-sequences both days', async () => {
      const id = await newTrip();
      await addItem(id, { kind: 'note', title: 'One', day: start });
      const two = (await addItem(id, { kind: 'note', title: 'Two', day: start })).json().item;
      await addItem(id, { kind: 'note', title: 'Three', day: start });
      const day2 = daysFromNow(21);
      const res = await call('PATCH', `/trips/${id}/items/${two.id}`, user, { day: day2 });
      expect(res.json().item.day).toBe(day2);

      const body = await detail(id);
      expect((body.days[0]?.items ?? []).map((i) => [i.title, i.position])).toEqual([
        ['One', 0],
        ['Three', 1],
      ]);
      expect((body.days[1]?.items ?? []).map((i) => [i.title, i.position])).toEqual([['Two', 0]]);
    });

    it('rejects invalid edits: blank title, bad time, day outside the trip, unknown item', async () => {
      const id = await newTrip();
      const note = (await addItem(id, { kind: 'note', title: 'Keep', day: start })).json().item;
      const patch = (payload: object) =>
        call('PATCH', `/trips/${id}/items/${note.id}`, user, payload);
      expect((await patch({ title: '   ' })).statusCode).toBe(422);
      expect((await patch({ startTime: '25:99' })).statusCode).toBe(422);
      expect((await patch({ day: daysFromNow(60) })).statusCode).toBe(422);
      expect(
        (await call('PATCH', `/trips/${id}/items/999999999`, user, { title: 'x' })).statusCode,
      ).toBe(404);
      expect(((await detail(id)).days[0]?.items ?? [])[0]?.title).toBe('Keep');
    });

    it('rearranges: moves an item up and down within its day, and stops at the ends', async () => {
      const id = await newTrip();
      const a = (await addItem(id, { kind: 'note', title: 'A', day: start })).json().item;
      const b = (await addItem(id, { kind: 'note', title: 'B', day: start })).json().item;
      const c = (await addItem(id, { kind: 'note', title: 'C', day: start })).json().item;
      const order = async () => ((await detail(id)).days[0]?.items ?? []).map((i) => i.title);
      const move = (itemId: number, direction: string) =>
        call('POST', `/trips/${id}/items/${itemId}/move`, user, { direction });

      expect(await order()).toEqual(['A', 'B', 'C']);
      expect((await move(c.id, 'up')).statusCode).toBe(200);
      expect(await order()).toEqual(['A', 'C', 'B']);
      await move(a.id, 'down');
      expect(await order()).toEqual(['C', 'A', 'B']);

      await move(c.id, 'up'); // already first: unchanged
      await move(b.id, 'down'); // already last: unchanged
      expect(await order()).toEqual(['C', 'A', 'B']);
      expect(((await detail(id)).days[0]?.items ?? []).map((i) => i.position)).toEqual([0, 1, 2]);
    });

    it('only reorders within one day and rejects a bad direction or unknown item', async () => {
      const id = await newTrip();
      const day1 = (await addItem(id, { kind: 'note', title: 'D1', day: start })).json().item;
      await addItem(id, { kind: 'note', title: 'D2', day: daysFromNow(21) });
      await call('POST', `/trips/${id}/items/${day1.id}/move`, user, { direction: 'down' });
      const body = await detail(id);
      expect((body.days[0]?.items ?? []).map((i) => i.title)).toEqual(['D1']);
      expect((body.days[1]?.items ?? []).map((i) => i.title)).toEqual(['D2']);

      expect(
        (await call('POST', `/trips/${id}/items/${day1.id}/move`, user, { direction: 'sideways' }))
          .statusCode,
      ).toBe(400);
      expect(
        (await call('POST', `/trips/${id}/items/999999999/move`, user, { direction: 'up' }))
          .statusCode,
      ).toBe(404);
    });

    it('deletes a trip together with its items', async () => {
      const id = await newTrip();
      await addItem(id, { kind: 'note', title: 'x', day: start });
      expect((await call('DELETE', `/trips/${id}`, user)).statusCode).toBe(204);
      expect((await call('GET', `/trips/${id}`, user)).statusCode).toBe(404);
      expect((await call('DELETE', `/trips/${id}`, user)).statusCode).toBe(404);
    });
  });

  describe('SCRUM-25: pay for a trip', () => {
    const pay = (tripId: number, method = 'credit_card', who = user) =>
      call('POST', `/trips/${tripId}/payment`, who, { method });

    const bookedTrip = async (): Promise<{ id: number; total: number }> => {
      const id = await newTrip();
      const { outbound } = await findFlights(app, 'JFK', 'NRT', start);
      const flight = outbound[0] as { id: number; price: number };
      await addItem(id, { kind: 'flight', flightId: flight.id });
      const { hotelId, room } = await findHotelRoom(app, 'tokyo', start, end);
      await addItem(id, { kind: 'hotel', hotelId, checkIn: start, checkOut: end });
      return { id, total: Math.round((flight.price + room.price.total) * 100) / 100 };
    };

    it('quotes the trip price from its flights and stays, and charges exactly that', async () => {
      const { id, total } = await bookedTrip();
      await addItem(id, { kind: 'note', title: 'Free', day: start });
      const before = await detail(id);
      expect(before.cost.total).toBe(total);
      expect(before.cost.lines.map((l) => l.kind)).toEqual(['flight', 'hotel']);
      expect(before.payment).toBeNull();

      const res = await pay(id, 'paypal');
      expect(res.statusCode).toBe(201);
      expect(res.json().payment).toMatchObject({
        tripId: id,
        amount: total,
        method: 'paypal',
        status: 'completed',
      });
      expect((await detail(id)).payment).toMatchObject({ amount: total, status: 'completed' });
      const listed = (await call('GET', '/trips', user)).json().trips as Array<{
        id: number;
        paid: boolean;
      }>;
      expect(listed.find((t) => t.id === id)?.paid).toBe(true);
    });

    it('accepts only one payment per trip', async () => {
      const { id } = await bookedTrip();
      expect((await pay(id)).statusCode).toBe(201);
      const again = await pay(id, 'debit_card');
      expect(again.statusCode).toBe(409);
      expect(again.json().error.code).toBe('trip_paid');
    });

    it('locks a paid trip: no adding, editing, moving, removing or deleting', async () => {
      const { id } = await bookedTrip();
      const itemId = (await detail(id)).days[0]?.items[0]?.id;
      expect((await pay(id)).statusCode).toBe(201);

      expect((await addItem(id, { kind: 'note', title: 'x', day: start })).statusCode).toBe(409);
      expect(
        (await call('PATCH', `/trips/${id}/items/${itemId}`, user, { title: 'x' })).statusCode,
      ).toBe(409);
      expect(
        (await call('POST', `/trips/${id}/items/${itemId}/move`, user, { direction: 'down' }))
          .statusCode,
      ).toBe(409);
      expect((await call('DELETE', `/trips/${id}/items/${itemId}`, user)).statusCode).toBe(409);
      expect((await call('DELETE', `/trips/${id}`, user)).statusCode).toBe(409);
      expect((await call('GET', `/trips/${id}`, user)).statusCode).toBe(200);
    });

    it('refuses to charge for a trip with nothing priced, or with an unknown method', async () => {
      const id = await newTrip();
      await addItem(id, { kind: 'note', title: 'Free', day: start });
      expect((await detail(id)).cost.total).toBe(0);
      expect((await pay(id)).statusCode).toBe(422);
      expect((await pay(id, 'bitcoin')).statusCode).toBe(400);
      expect((await detail(id)).payment).toBeNull();
    });

    it("cannot pay for another user's trip", async () => {
      const { id } = await bookedTrip();
      const other = await registerUser(app, 'Other');
      expect((await pay(id, 'credit_card', other)).statusCode).toBe(404);
      expect(
        (await call('POST', `/trips/${id}/payment`, null, { method: 'paypal' })).statusCode,
      ).toBe(401);
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
      expect(
        (await call('PATCH', `/trips/${id}/items/${item.id}`, other, { title: 'hijack' }))
          .statusCode,
      ).toBe(404);
      expect(
        (await call('POST', `/trips/${id}/items/${item.id}/move`, other, { direction: 'up' }))
          .statusCode,
      ).toBe(404);
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
      expect((await call('PATCH', '/trips/1/items/1', null, { title: 'x' })).statusCode).toBe(401);
      expect(
        (await call('POST', '/trips/1/items/1/move', null, { direction: 'up' })).statusCode,
      ).toBe(401);
    });
  });
});
