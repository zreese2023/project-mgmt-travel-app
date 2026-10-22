import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, failingWeatherFetch } from '../helpers/app.js';

interface Destination {
  slug: string;
  name: string;
  region: string;
  budgetTier: number;
  interests: string[];
  imageUrl: string;
}

describe('Destination discovery (real Postgres)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
  });

  const search = async (query = ''): Promise<Destination[]> => {
    const res = await app.inject({ method: 'GET', url: `/api/destinations${query}` });
    expect(res.statusCode).toBe(200);
    return res.json().destinations;
  };

  describe('SCRUM-11: search by keyword', () => {
    it('returns matching destinations for a keyword (case-insensitive)', async () => {
      const results = await search('?q=tOKy');
      expect(results.map((d) => d.slug)).toContain('tokyo');
      expect(results.every((d) => /tok/i.test(`${d.name} ${d.slug}`))).toBe(true);
    });

    it('matches on country and region too', async () => {
      expect((await search('?q=japan')).map((d) => d.slug)).toContain('tokyo');
      expect((await search('?q=oceania')).map((d) => d.slug)).toContain('sydney');
    });

    it('returns an empty list when nothing matches', async () => {
      expect(await search('?q=zzzz-no-such-place')).toEqual([]);
    });

    it('lists everything when the keyword is empty', async () => {
      expect((await search()).length).toBeGreaterThanOrEqual(12);
      expect((await search('?q=')).length).toBeGreaterThanOrEqual(12);
    });

    it('treats % and _ literally instead of as wildcards', async () => {
      expect(await search('?q=%25')).toEqual([]);
    });
  });

  describe('SCRUM-12: filter destinations', () => {
    it('filters by region', async () => {
      const results = await search('?region=Asia');
      expect(results.length).toBeGreaterThan(0);
      expect(results.every((d) => d.region === 'Asia')).toBe(true);
    });

    it('filters by budget tier, including several tiers', async () => {
      const cheap = await search('?budget=1');
      expect(cheap.length).toBeGreaterThan(0);
      expect(cheap.every((d) => d.budgetTier === 1)).toBe(true);
      const two = await search('?budget=1,4');
      expect(two.every((d) => [1, 4].includes(d.budgetTier))).toBe(true);
    });

    it('filters by interest', async () => {
      const results = await search('?interest=beach');
      expect(results.length).toBeGreaterThan(0);
      expect(results.every((d) => d.interests.includes('beach'))).toBe(true);
    });

    it('combines filters and the keyword, and removing a filter widens the results', async () => {
      const narrow = await search('?region=Europe&interest=food&budget=3');
      const wide = await search('?region=Europe&interest=food');
      const all = await search();
      expect(narrow.length).toBeLessThanOrEqual(wide.length);
      expect(wide.length).toBeLessThan(all.length);
      expect(narrow.every((d) => d.region === 'Europe' && d.budgetTier === 3)).toBe(true);
    });

    it('rejects an invalid budget tier', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/destinations?budget=9' });
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe('validation_error');
    });

    it('lists the available filter values', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/destinations/filters' });
      const body = res.json();
      expect(body.regions).toContain('Asia');
      expect(body.interests).toContain('food');
      expect(body.budgets).toHaveLength(4);
    });
  });

  describe('SCRUM-13: destination details', () => {
    it('shows a description, a list of activities and a photo', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/destinations/tokyo' });
      expect(res.statusCode).toBe(200);
      const { destination } = res.json();
      expect(destination.description.length).toBeGreaterThan(20);
      expect(destination.activities.length).toBeGreaterThanOrEqual(3);
      expect(destination.activities[0]).toHaveProperty('name');
      expect(destination.imageUrl).toBe('/img/destinations/tokyo.svg');
    });

    it('returns 404 for an unknown destination', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/destinations/atlantis' });
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe('not_found');
    });
  });

  describe('SCRUM-14: weather (Open-Meteo stubbed)', () => {
    it('returns current conditions and a forecast in the requested unit', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/destinations/tokyo/weather?unit=C',
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.available).toBe(true);
      expect(body.unit).toBe('C');
      expect(body.current).toMatchObject({ temperature: 72, condition: 'Light rain' });
      expect(body.forecast).toHaveLength(2);
    });

    it('degrades gracefully with HTTP 200 and available=false when the API is unreachable', async () => {
      const broken = await createTestApp(failingWeatherFetch);
      try {
        const res = await broken.inject({ method: 'GET', url: '/api/destinations/paris/weather' });
        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual({ available: false, reason: 'unreachable' });
      } finally {
        await broken.close();
      }
    });

    it('returns 404 for an unknown destination and 400 for a bad unit', async () => {
      expect(
        (await app.inject({ method: 'GET', url: '/api/destinations/atlantis/weather' })).statusCode,
      ).toBe(404);
      expect(
        (await app.inject({ method: 'GET', url: '/api/destinations/paris/weather?unit=K' }))
          .statusCode,
      ).toBe(400);
    });
  });
});
