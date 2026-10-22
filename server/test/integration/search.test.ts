import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, daysFromNow } from '../helpers/app.js';

interface Flight {
  id: number;
  origin: string;
  destination: string;
  departAt: string;
  price: number;
  durationMin: number;
  seatsAvailable: number;
  stops: number;
}

describe('Flight and hotel search (real Postgres)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
  });

  const get = (url: string) => app.inject({ method: 'GET', url });

  describe('SCRUM-21: search flights', () => {
    it('returns flights for the route on the departure date', async () => {
      const depart = daysFromNow(10);
      const res = await get(`/api/flights?origin=JFK&destination=NRT&depart=${depart}`);
      expect(res.statusCode).toBe(200);
      const body = res.json() as { outbound: Flight[]; return: Flight[] | null; note: string };
      expect(body.outbound.length).toBeGreaterThan(0);
      expect(body.return).toBeNull();
      for (const f of body.outbound) {
        expect(f.origin).toBe('JFK');
        expect(f.destination).toBe('NRT');
        expect(f.departAt.slice(0, 10)).toBe(depart);
        expect(f.price).toBeGreaterThan(0);
        expect(f.durationMin).toBeGreaterThan(0);
      }
      expect(body.note).toMatch(/sample/i);
    });

    it('also returns the reverse-route flights on the return date for a round trip', async () => {
      const depart = daysFromNow(10);
      const back = daysFromNow(17);
      const res = await get(
        `/api/flights?origin=JFK&destination=NRT&depart=${depart}&return=${back}`,
      );
      const body = res.json() as { outbound: Flight[]; return: Flight[] };
      expect(body.return.length).toBeGreaterThan(0);
      for (const f of body.return) {
        expect([f.origin, f.destination]).toEqual(['NRT', 'JFK']);
        expect(f.departAt.slice(0, 10)).toBe(back);
      }
    });

    it('sorts by price and applies a price cap', async () => {
      const depart = daysFromNow(12);
      const sorted = (
        await get(`/api/flights?origin=LAX&destination=CDG&depart=${depart}&sort=price`)
      ).json() as { outbound: Flight[] };
      const prices = sorted.outbound.map((f) => f.price);
      expect(prices).toEqual([...prices].sort((a, b) => a - b));

      const cheapest = prices[0] as number;
      const capped = (
        await get(`/api/flights?origin=LAX&destination=CDG&depart=${depart}&maxPrice=${cheapest}`)
      ).json() as { outbound: Flight[] };
      expect(capped.outbound.length).toBeGreaterThan(0);
      expect(capped.outbound.every((f) => f.price <= cheapest)).toBe(true);

      const none = (
        await get(`/api/flights?origin=LAX&destination=CDG&depart=${depart}&maxPrice=1`)
      ).json() as { outbound: Flight[] };
      expect(none.outbound).toEqual([]);
    });

    it('sorts by duration', async () => {
      const res = await get(
        `/api/flights?origin=ORD&destination=BKK&depart=${daysFromNow(9)}&sort=duration`,
      );
      const durations = (res.json() as { outbound: Flight[] }).outbound.map((f) => f.durationMin);
      expect(durations).toEqual([...durations].sort((a, b) => a - b));
    });

    it('returns an empty list (not an error) for a date with no flights', async () => {
      const res = await get(`/api/flights?origin=JFK&destination=NRT&depart=${daysFromNow(400)}`);
      expect(res.statusCode).toBe(200);
      expect((res.json() as { outbound: Flight[] }).outbound).toEqual([]);
    });

    it('rejects invalid searches with field errors', async () => {
      const past = await get(`/api/flights?origin=JFK&destination=NRT&depart=2020-01-01`);
      expect(past.statusCode).toBe(422);
      expect(past.json().error.details).toHaveProperty('depart');
      const same = await get(`/api/flights?origin=JFK&destination=JFK&depart=${daysFromNow(5)}`);
      expect(same.statusCode).toBe(422);
      const earlyReturn = await get(
        `/api/flights?origin=JFK&destination=NRT&depart=${daysFromNow(9)}&return=${daysFromNow(5)}`,
      );
      expect(earlyReturn.json().error.details).toHaveProperty('returnDate');
      expect((await get('/api/flights?origin=JFK')).statusCode).toBe(400);
    });

    it('lists the origin airports and the searchable date window', async () => {
      const body = (await get('/api/airports')).json();
      expect(
        body.airports.filter((a: { isOrigin: boolean }) => a.isOrigin).length,
      ).toBeGreaterThanOrEqual(4);
      expect(body.searchWindow.from < body.searchWindow.to).toBe(true);
    });
  });

  describe('SCRUM-23: search hotels', () => {
    const stay = () => ({ checkIn: daysFromNow(14), checkOut: daysFromNow(17) });
    const search = (extra = '') => {
      const { checkIn, checkOut } = stay();
      return get(`/api/hotels?destination=tokyo&checkIn=${checkIn}&checkOut=${checkOut}${extra}`);
    };

    it('returns hotels in the destination with rooms priced for the stay', async () => {
      const res = await search();
      expect(res.statusCode).toBe(200);
      const { hotels, note } = res.json();
      expect(hotels.length).toBeGreaterThanOrEqual(2);
      expect(note).toMatch(/sample/i);
      for (const hotel of hotels) {
        expect(hotel.destinationSlug).toBe('tokyo');
        expect(hotel.nights).toBe(3);
        expect(hotel.rooms.length).toBeGreaterThan(0);
        for (const room of hotel.rooms) {
          // total = nightly x 3 nights + 12% tax, computed on the server
          expect(room.price.subtotal).toBeCloseTo(room.nightlyPrice * 3, 2);
          expect(room.price.total).toBeCloseTo(room.nightlyPrice * 3 * 1.12, 1);
        }
      }
    });

    it('applies price, rating and amenity filters', async () => {
      const all = (await search()).json().hotels as Array<{
        rating: number;
        amenities: string[];
        fromNightly: number;
      }>;
      const rated = (await search('&minRating=4.5')).json().hotels as typeof all;
      expect(rated.length).toBeGreaterThan(0);
      expect(rated.length).toBeLessThan(all.length);
      expect(rated.every((h) => h.rating >= 4.5)).toBe(true);

      const spa = (await search('&amenity=spa,pool')).json().hotels as typeof all;
      expect(spa.every((h) => h.amenities.includes('spa') && h.amenities.includes('pool'))).toBe(
        true,
      );

      const cheap = (await search('&maxPrice=60')).json().hotels as typeof all;
      expect(cheap.every((h) => h.fromNightly <= 60)).toBe(true);
    });

    it('sorts by rating when asked', async () => {
      const ratings = (
        (await search('&sort=rating')).json().hotels as Array<{ rating: number }>
      ).map((h) => h.rating);
      expect(ratings).toEqual([...ratings].sort((a, b) => b - a));
    });

    it('rejects check-out on or before check-in and past dates', async () => {
      const bad = await get(
        `/api/hotels?destination=tokyo&checkIn=${daysFromNow(10)}&checkOut=${daysFromNow(10)}`,
      );
      expect(bad.statusCode).toBe(422);
      expect(bad.json().error.details).toHaveProperty('checkOut');
      const past = await get(
        '/api/hotels?destination=tokyo&checkIn=2020-01-01&checkOut=2020-01-03',
      );
      expect(past.json().error.details).toHaveProperty('checkIn');
    });

    it('returns no hotels for an unknown destination', async () => {
      const { checkIn, checkOut } = stay();
      const res = await get(
        `/api/hotels?destination=atlantis&checkIn=${checkIn}&checkOut=${checkOut}`,
      );
      expect(res.json().hotels).toEqual([]);
    });
  });
});
