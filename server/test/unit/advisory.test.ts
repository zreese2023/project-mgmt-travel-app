import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ADVISORY_FEED_URL,
  LIVE_DISCLAIMER,
  SAMPLE_DISCLAIMER,
  createAdvisoryService,
  extractCategories,
  getAdvisory,
  getSampleAdvisory,
  htmlToText,
  leadSummary,
  levelLabel,
  normalizeCountryName,
  parseAdvisoryTitle,
  parseFeed,
  toLiveAdvisory,
  truncate,
  type AdvisoryService,
  type FeedAdvisory,
} from '../../src/lib/advisory.js';
import type { FetchLike } from '../../src/lib/weather.js';
import { mockDb } from '../helpers/mockDb.js';

const brazilHtml =
  'Exercise increased caution<p>in <b>Brazil </b>due to <b>crime</b>, <b>terrorism</b> &amp; <b>health</b>.&nbsp;Read the entire Travel Advisory.</p>' +
  "<ul><li><span class='body-regular'><b>Do not travel to the border.</b> Some areas have <b>kidnapping</b> risks.</span></li></ul>";

const feed = [
  {
    Title: 'Brazil - Level 2: Exercise Increased Caution',
    Link: 'https://travel.state.gov/brazil.html',
    Summary: brazilHtml,
    Updated: '2026-10-22T20:00:00-04:00',
  },
  {
    Title: 'Mexico Travel Advisory - Level 2: Exercise Increased Caution',
    Link: 'https://travel.state.gov/mexico.html',
    Summary: 'x',
    Updated: '2026-10-01T00:00:00Z',
  },
  { Title: 'The Bahamas - Level 2: Exercise Increased Caution', Summary: '', Link: '' },
  { Title: 'Türkiye - Level 3: Reconsider Travel', Summary: '', Link: '' },
  { Title: 'not a real title' },
  null,
  'junk',
];

const okFetch = (body: unknown = feed): FetchLike =>
  vi.fn(async () => ({ ok: true, status: 200, json: async () => body }));

describe('SCRUM-15: feed parsing helpers', () => {
  it('labels each level with the State Department wording', () => {
    expect([1, 2, 3, 4].map(levelLabel)).toEqual([
      'Exercise Normal Precautions',
      'Exercise Increased Caution',
      'Reconsider Travel',
      'Do Not Travel',
    ]);
    expect(levelLabel(9)).toBe('Unknown');
  });

  it('normalises country names so spellings and suffixes match', () => {
    expect(normalizeCountryName('Mexico Travel Advisory')).toBe('mexico');
    expect(normalizeCountryName('The Bahamas')).toBe('bahamas');
    expect(normalizeCountryName('Türkiye')).toBe('turkiye');
    expect(normalizeCountryName("Côte d'Ivoire")).toBe('cote d ivoire');
    expect(normalizeCountryName('  United   Kingdom ')).toBe('united kingdom');
  });

  it('parses "Country - Level N: Label" titles, and rejects others', () => {
    expect(parseAdvisoryTitle('Brazil - Level 2: Exercise Increased Caution')).toEqual({
      country: 'Brazil',
      level: 2,
      label: 'Exercise Increased Caution',
    });
    expect(parseAdvisoryTitle('Iran - Level 4: Do Not Travel')?.level).toBe(4);
    expect(parseAdvisoryTitle('Guinea-Bissau - Level 3: Reconsider Travel')?.country).toBe(
      'Guinea-Bissau',
    );
    expect(parseAdvisoryTitle('Brazil - Level 5: Nope')).toBeNull();
    expect(parseAdvisoryTitle('Global Health Advisory')).toBeNull();
  });

  it('turns the HTML summary into plain text', () => {
    const text = htmlToText(brazilHtml);
    expect(text).toContain(
      'Exercise increased caution in Brazil due to crime, terrorism & health.',
    );
    expect(text).not.toMatch(/[<>]|&amp;|&nbsp;/);
    expect(htmlToText('A&#39;B &#x41; &rsquo;C &unknown; D')).toBe("A'B A ’C &unknown; D");
    expect(htmlToText('')).toBe('');
  });

  it('truncates at a word boundary with an ellipsis, and leaves short text alone', () => {
    expect(truncate('short text', 50)).toBe('short text');
    const cut = truncate('alpha beta gamma delta epsilon zeta', 20);
    expect(cut.endsWith('…')).toBe(true);
    expect(cut.length).toBeLessThanOrEqual(21);
    expect(cut).not.toMatch(/\s…$/);
    expect(truncate('x'.repeat(30), 10)).toBe('xxxxxxxxxx…');
  });

  it('extracts risk terms from bold text, without the country, long sentences or duplicates', () => {
    expect(extractCategories(brazilHtml, 'Brazil')).toEqual([
      'crime',
      'terrorism',
      'health',
      'kidnapping',
    ]);
    expect(
      extractCategories('<b>terrorism, crime, and kidnapping</b> <b>Do not travel to</b>', 'X'),
    ).toEqual(['terrorism', 'crime', 'kidnapping']);
    expect(extractCategories('<b>armed conflict;</b><b>U.S. citizens</b>', 'X')).toEqual([
      'armed conflict',
    ]);
    expect(extractCategories('<b>a</b><b>b</b><b>c</b>', 'X', 2)).toEqual(['a', 'b']);
    expect(extractCategories('<b>Level 4</b><b></b><b>crime</b><b>Crime</b>', 'X')).toEqual([
      'crime',
    ]);
    expect(extractCategories('plain text', 'X')).toEqual([]);
  });

  it('indexes a feed by country, skipping malformed entries', () => {
    const parsed = parseFeed(feed);
    expect([...parsed.keys()].sort()).toEqual(['bahamas', 'brazil', 'mexico', 'turkiye']);
    expect(parsed.get('brazil')).toMatchObject({
      level: 2,
      link: 'https://travel.state.gov/brazil.html',
    });
    expect(parsed.get('mexico')?.country).toBe('Mexico');
  });

  it('rejects a feed that is not a usable list', () => {
    expect(() => parseFeed({})).toThrow(/Unexpected advisory feed/);
    expect(() => parseFeed([])).toThrow(/Unexpected advisory feed/);
    expect(() => parseFeed([{ Title: 'nope' }])).toThrow(/Unexpected advisory feed/);
  });

  it('builds the API advisory with source, date, link, summary and categories', () => {
    const entry = parseFeed(feed).get('brazil') as FeedAdvisory;
    const advisory = toLiveAdvisory('rio-de-janeiro', entry);
    expect(advisory).toMatchObject({
      destinationSlug: 'rio-de-janeiro',
      level: 2,
      label: 'Exercise Increased Caution',
      kind: 'live',
      sourceUrl: 'https://travel.state.gov/brazil.html',
      updatedAt: '2026-10-23T00:00:00.000Z',
      categories: ['crime', 'terrorism', 'health', 'kidnapping'],
    });
    expect(advisory.sourceLabel).toBe(
      'U.S. Department of State travel advisory for Brazil. Updated 2026-10-22.',
    );
    expect(advisory.summary.length).toBeLessThanOrEqual(401);
    expect(advisory.summary).not.toContain('<');
  });

  it('keeps only the headline paragraph of the summary', () => {
    expect(
      leadSummary('Exercise caution in X. Read the entire Travel Advisory. Crime Details...'),
    ).toBe('Exercise caution in X.');
    expect(leadSummary('No marker here.')).toBe('No marker here.');
    expect(leadSummary('Read the entire Travel Advisory first')).toBe(
      'Read the entire Travel Advisory first',
    );
    const advisory = toLiveAdvisory('rio', parseFeed(feed).get('brazil') as FeedAdvisory);
    expect(advisory.summary).not.toMatch(/Read the entire/);
  });

  it('copes with a missing link or an unreadable date', () => {
    const advisory = toLiveAdvisory('x', {
      country: 'X',
      level: 1,
      label: 'Exercise Normal Precautions',
      summaryHtml: '',
      link: '',
      updated: 'not a date',
    });
    expect(advisory.sourceUrl).toBeNull();
    expect(advisory.updatedAt).toBeNull();
    expect(advisory.sourceLabel).toBe('U.S. Department of State travel advisory for X.');
  });
});

describe('SCRUM-15: advisory service (fake fetch + timers)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-22T12:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('asks the State Department feed once and finds countries by name', async () => {
    const fetch = okFetch();
    const service = createAdvisoryService({ fetch });
    const found = await service.lookup('Brazil');
    expect(found.status).toBe('found');
    expect((await service.lookup('Mexico')).status).toBe('found');
    expect(await service.lookup('United States')).toEqual({ status: 'not_issued' });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe(ADVISORY_FEED_URL);
    expect(vi.mocked(fetch).mock.calls[0]?.[1]?.headers).toEqual({ Accept: 'application/json' });
  });

  it('shares one request between simultaneous lookups', async () => {
    const fetch = okFetch();
    const service = createAdvisoryService({ fetch });
    await Promise.all([
      service.lookup('Brazil'),
      service.lookup('Mexico'),
      service.lookup('Spain'),
    ]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('caches for the TTL, then refreshes', async () => {
    const fetch = okFetch();
    const service = createAdvisoryService({ fetch, ttlMs: 60_000 });
    await service.lookup('Brazil');
    vi.advanceTimersByTime(59_000);
    await service.lookup('Brazil');
    expect(fetch).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2_000);
    await service.lookup('Brazil');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('keeps serving the last good copy when a refresh fails', async () => {
    const fetch = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => feed })
      .mockRejectedValue(new Error('down'));
    const service = createAdvisoryService({ fetch, ttlMs: 1_000 });
    expect((await service.lookup('Brazil')).status).toBe('found');
    vi.advanceTimersByTime(5_000);
    expect((await service.lookup('Brazil')).status).toBe('found'); // stale, not lost
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['network error', vi.fn<FetchLike>().mockRejectedValue(new Error('down'))],
    [
      'non-OK status',
      vi.fn<FetchLike>(async () => ({ ok: false, status: 503, json: async () => ({}) })),
    ],
    ['malformed body', okFetch({ nope: true })],
  ])(
    'reports unavailable on a %s with nothing cached, and tries again next time',
    async (_name, fetch) => {
      const service = createAdvisoryService({ fetch });
      expect(await service.lookup('Brazil')).toEqual({ status: 'unavailable' });
      expect(await service.lookup('Brazil')).toEqual({ status: 'unavailable' });
      expect(fetch).toHaveBeenCalledTimes(2);
    },
  );

  it('gives up on a hung request after the timeout', async () => {
    const fetch: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      });
    const service = createAdvisoryService({ fetch, timeoutMs: 10_000 });
    const pending = service.lookup('Brazil');
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await pending).toEqual({ status: 'unavailable' });
  });
});

describe('SCRUM-15: choosing live, none or sample', () => {
  const sampleRow = {
    level: 3,
    summary: 'Sample advisory text',
    categories: ['safety'],
    source_label: 'Illustrative sample data, not official guidance',
  };
  const serviceReturning = (
    result: Awaited<ReturnType<AdvisoryService['lookup']>>,
  ): AdvisoryService => ({
    lookup: async () => result,
  });
  const rio = { slug: 'rio-de-janeiro', country: 'Brazil' };

  it('returns the live advisory with the live disclaimer', async () => {
    const entry = parseFeed(feed).get('brazil') as FeedAdvisory;
    const { db, query } = mockDb();
    const result = await getAdvisory(
      db,
      serviceReturning({ status: 'found', advisory: entry }),
      rio,
    );
    expect(result.advisory).toMatchObject({
      kind: 'live',
      level: 2,
      destinationSlug: 'rio-de-janeiro',
    });
    expect(result.disclaimer).toBe(LIVE_DISCLAIMER);
    expect(query).not.toHaveBeenCalled(); // the database is not needed for a live answer
  });

  it('explains when the State Department issues no advisory for the country', async () => {
    const result = await getAdvisory(mockDb().db, serviceReturning({ status: 'not_issued' }), {
      slug: 'honolulu',
      country: 'United States',
    });
    expect(result.advisory).toBeNull();
    expect(result.note).toBe(
      'The U.S. Department of State does not publish a travel advisory for United States.',
    );
    expect(result.disclaimer).toBe(LIVE_DISCLAIMER);
  });

  it('falls back to the labelled sample when the feed is unavailable', async () => {
    const { db } = mockDb([sampleRow]);
    const result = await getAdvisory(db, serviceReturning({ status: 'unavailable' }), rio);
    expect(result.advisory).toMatchObject({
      kind: 'sample',
      level: 3,
      label: 'Reconsider Travel',
      sourceUrl: null,
    });
    expect(result.advisory?.sourceLabel).toMatch(/not official/i);
    expect(result.disclaimer).toBe(SAMPLE_DISCLAIMER);
    expect(SAMPLE_DISCLAIMER).toMatch(/not official/i);
  });

  it('says so when the feed is unavailable and there is no sample either', async () => {
    const result = await getAdvisory(
      mockDb([]).db,
      serviceReturning({ status: 'unavailable' }),
      rio,
    );
    expect(result.advisory).toBeNull();
    expect(result.note).toMatch(/unavailable/i);
  });

  it('reads one sample row by slug, or null', async () => {
    const found = mockDb([sampleRow]);
    expect(await getSampleAdvisory(found.db, 'paris')).toMatchObject({
      destinationSlug: 'paris',
      kind: 'sample',
    });
    expect((found.query.mock.calls[0] as unknown[])[1]).toEqual(['paris']);
    expect(await getSampleAdvisory(mockDb([]).db, 'nowhere')).toBeNull();
  });
});
