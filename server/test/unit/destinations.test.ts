import { describe, expect, it } from 'vitest';
import {
  buildDestinationQuery,
  escapeLike,
  getDestinationBySlug,
  listDestinationFilters,
  parseList,
  searchDestinations,
} from '../../src/lib/destinations.js';
import { mockDb } from '../helpers/mockDb.js';

const row = {
  id: 1,
  slug: 'tokyo',
  name: 'Tokyo',
  country: 'Japan',
  region: 'Asia',
  description: 'd',
  image_url: '/img/destinations/tokyo.svg',
  avg_daily_cost: 210,
  budget_tier: 3,
  interests: ['food'],
};

describe('SCRUM-11: keyword search query', () => {
  it('lists everything, ordered by name, when there are no filters', () => {
    const { text, values } = buildDestinationQuery({});
    expect(text).not.toContain('where');
    expect(text).toContain('order by name');
    expect(values).toEqual([]);
  });

  it('matches name, country, region and interests case-insensitively with a single parameter', () => {
    const { text, values } = buildDestinationQuery({ q: '  Tok ' });
    expect(values).toEqual(['%Tok%']);
    expect(text).toContain('name ilike $1 or country ilike $1 or region ilike $1');
    expect(text).toContain('unnest(interests)');
  });

  it('treats LIKE wildcards in the keyword literally', () => {
    expect(escapeLike('50%_off\\')).toBe('50\\%\\_off\\\\');
    expect(buildDestinationQuery({ q: '100%' }).values).toEqual(['%100\\%%']);
  });

  it('ignores a blank keyword', () => {
    expect(buildDestinationQuery({ q: '   ' }).values).toEqual([]);
  });
});

describe('SCRUM-12: filter query', () => {
  it('combines keyword, region, budget and interest filters with AND, all parameterised', () => {
    const { text, values } = buildDestinationQuery({
      q: 'a',
      regions: ['Asia', 'Europe'],
      budgets: [1, 2],
      interests: ['Food'],
    });
    expect(values).toEqual(['%a%', ['asia', 'europe'], [1, 2], ['food']]);
    expect(text).toContain('lower(region) = any($2::text[])');
    expect(text).toContain('budget_tier = any($3::int[])');
    expect(text).toContain('interests && $4::text[]');
    expect(text.match(/ and /g)?.length).toBe(3);
  });

  it('removing a filter removes its clause', () => {
    const { text } = buildDestinationQuery({ regions: ['asia'] });
    expect(text).toContain('lower(region) = any($1::text[])');
    expect(text).not.toContain('budget_tier = any');
    expect(text).not.toContain('interests &&');
  });
});

describe('SCRUM-12: parseList', () => {
  it('accepts comma lists, repeated params and blanks', () => {
    expect(parseList('a, b,,c')).toEqual(['a', 'b', 'c']);
    expect(parseList(['a,b', 'c'])).toEqual(['a', 'b', 'c']);
    expect(parseList(undefined)).toEqual([]);
    expect(parseList('')).toEqual([]);
  });
});

describe('SCRUM-11/13: destination queries (mocked DB)', () => {
  it('maps rows to camelCase summaries', async () => {
    const { db, query } = mockDb([row]);
    const result = await searchDestinations(db, { q: 'tokyo' });
    expect(query).toHaveBeenCalledOnce();
    expect(result).toEqual([
      {
        id: 1,
        slug: 'tokyo',
        name: 'Tokyo',
        country: 'Japan',
        region: 'Asia',
        description: 'd',
        imageUrl: '/img/destinations/tokyo.svg',
        avgDailyCost: 210,
        budgetTier: 3,
        interests: ['food'],
      },
    ]);
  });

  it('returns details with activities, or null for an unknown slug', async () => {
    const detail = { ...row, latitude: 35.7, longitude: 139.7, airport_code: 'NRT' };
    const activity = {
      id: 9,
      name: 'Senso-ji',
      category: 'culture',
      description: 'x',
      duration_min: 60,
    };
    const found = mockDb([detail], [activity]);
    const result = await getDestinationBySlug(found.db, 'tokyo');
    expect(result?.airportCode).toBe('NRT');
    expect(result?.activities).toEqual([
      { id: 9, name: 'Senso-ji', category: 'culture', description: 'x', durationMin: 60 },
    ]);

    const missing = mockDb([]);
    expect(await getDestinationBySlug(missing.db, 'nowhere')).toBeNull();
    expect(missing.query).toHaveBeenCalledOnce();
  });

  it('lists regions, interests and budget tiers for the filter UI', async () => {
    const { db } = mockDb([{ region: 'Asia' }, { region: 'Europe' }], [{ interest: 'food' }]);
    const result = await listDestinationFilters(db);
    expect(result.regions).toEqual(['Asia', 'Europe']);
    expect(result.interests).toEqual(['food']);
    expect(result.budgets.map((b) => b.tier)).toEqual([1, 2, 3, 4]);
  });
});
