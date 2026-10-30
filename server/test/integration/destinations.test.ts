import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createTestApp,
  failingAdvisoryFetch,
  failingWeatherFetch,
  okWeatherFetch,
} from '../helpers/app.js';

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

  describe('SCRUM-15: travel advisories (U.S. State Department feed, stubbed)', () => {
    it('returns the live State Department advisory for the destination country', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/destinations/rio-de-janeiro/advisory',
      });
      expect(res.statusCode).toBe(200);
      const { advisory, disclaimer } = res.json();
      expect(advisory).toMatchObject({
        destinationSlug: 'rio-de-janeiro',
        kind: 'live',
        level: 2,
        label: 'Exercise Increased Caution',
      });
      expect(advisory.sourceLabel).toMatch(/U\.S\. Department of State/);
      expect(advisory.sourceLabel).toContain('Updated 2026-10-22');
      expect(advisory.sourceUrl).toMatch(/^https:\/\/travel\.state\.gov\//);
      expect(advisory.categories).toEqual(['crime', 'terrorism']);
      expect(advisory.summary).not.toContain('<');
      expect(disclaimer).toMatch(/not an official source/i);
    });

    it('maps every destination whose country the State Department covers', async () => {
      for (const { slug } of await search()) {
        const res = await app.inject({ method: 'GET', url: `/api/destinations/${slug}/advisory` });
        expect(res.statusCode, slug).toBe(200);
        const { advisory } = res.json();
        if (slug === 'honolulu') continue; // the United States has no advisory (next test)
        expect(advisory, slug).not.toBeNull();
        expect(advisory.kind, slug).toBe('live');
        expect(advisory.level, slug).toBeGreaterThanOrEqual(1);
        expect(advisory.level, slug).toBeLessThanOrEqual(4);
      }
    });

    it('explains, instead of showing a made-up level, when no advisory is issued for the country', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/destinations/honolulu/advisory' });
      expect(res.statusCode).toBe(200);
      expect(res.json().advisory).toBeNull();
      expect(res.json().note).toMatch(/does not publish a travel advisory for United States/);
    });

    it('falls back to the labelled sample data when the State Department cannot be reached', async () => {
      const offline = await createTestApp(okWeatherFetch, failingAdvisoryFetch);
      try {
        const res = await offline.inject({
          method: 'GET',
          url: '/api/destinations/rio-de-janeiro/advisory',
        });
        expect(res.statusCode).toBe(200);
        const { advisory, disclaimer } = res.json();
        expect(advisory).toMatchObject({ kind: 'sample', level: 3, sourceUrl: null });
        expect(advisory.sourceLabel).toMatch(/not official/i);
        expect(disclaimer).toMatch(/not official guidance/i);
      } finally {
        await offline.close();
      }
    });

    it('also falls back when the feed answers with something unusable', async () => {
      const garbage = await createTestApp(okWeatherFetch, async () => ({
        ok: true,
        status: 200,
        json: async () => ({ unexpected: true }),
      }));
      try {
        const res = await garbage.inject({
          method: 'GET',
          url: '/api/destinations/paris/advisory',
        });
        expect(res.json().advisory.kind).toBe('sample');
      } finally {
        await garbage.close();
      }
    });

    it('returns 404 for an unknown destination', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/destinations/atlantis/advisory' });
      expect(res.statusCode).toBe(404);
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
