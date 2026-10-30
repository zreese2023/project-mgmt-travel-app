import type { Queryable } from './db.js';
import type { FetchLike } from './weather.js';

export const ADVISORY_FEED_URL = 'https://cadataapi.state.gov/api/TravelAdvisories';
export const ADVISORY_TTL_MS = 6 * 60 * 60 * 1000;
export const ADVISORY_TIMEOUT_MS = 10_000;

/** The four levels used by the U.S. Department of State. */
export const ADVISORY_LEVEL_LABELS: Record<number, string> = {
  1: 'Exercise Normal Precautions',
  2: 'Exercise Increased Caution',
  3: 'Reconsider Travel',
  4: 'Do Not Travel',
};

export const LIVE_DISCLAIMER =
  'Published by the U.S. Department of State for U.S. citizens and shown here for reference. Wayfarer is a class prototype, not an official source: check travel.state.gov before you travel.';

export const SAMPLE_DISCLAIMER =
  'Illustrative sample data, not official guidance. The U.S. Department of State service could not be reached, so a made-up example is shown. Check your government travel advisory before you travel.';

export interface Advisory {
  destinationSlug: string;
  level: number;
  label: string;
  summary: string;
  categories: string[];
  /** 'live' = U.S. Department of State feed; 'sample' = made-up fallback from the seed data. */
  kind: 'live' | 'sample';
  sourceLabel: string;
  sourceUrl: string | null;
  updatedAt: string | null;
}

export interface AdvisoryResponse {
  advisory: Advisory | null;
  disclaimer: string;
  /** Explains an empty result, e.g. no advisory is issued for the destination's country. */
  note?: string;
}

export interface FeedAdvisory {
  country: string;
  level: number;
  label: string;
  summaryHtml: string;
  link: string;
  updated: string;
}

export function levelLabel(level: number): string {
  return ADVISORY_LEVEL_LABELS[level] ?? 'Unknown';
}

/** Lower-case, accent-free country key so "Türkiye", "The Bahamas" and "Mexico Travel Advisory" match. */
export function normalizeCountryName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\btravel advisory\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/^the /, '');
}

/** "Brazil - Level 2: Exercise Increased Caution" -> { country, level, label }. */
export function parseAdvisoryTitle(
  title: string,
): { country: string; level: number; label: string } | null {
  const match = /^(.+?)\s+-\s+Level\s+([1-4])\s*:\s*(.+)$/.exec(title.trim());
  if (!match) return null;
  return {
    country: (match[1] as string).trim(),
    level: Number(match[2]),
    label: (match[3] as string).trim(),
  };
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
  ndash: '–',
  mdash: '—',
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body: string) => {
    if (body.startsWith('#x') || body.startsWith('#X')) {
      return String.fromCodePoint(parseInt(body.slice(2), 16));
    }
    if (body.startsWith('#')) return String.fromCodePoint(Number(body.slice(1)));
    return ENTITIES[body.toLowerCase()] ?? whole;
  });
}

/** Plain text from the feed's HTML summary: tags removed, entities decoded, spaces collapsed. */
export function htmlToText(html: string): string {
  const withBreaks = html.replace(/<\/?(p|li|ul|ol|div|br)\b[^>]*>/gi, ' ');
  return decodeEntities(withBreaks.replace(/<[^>]+>/g, ''))
    .replace(/\s+/g, ' ')
    .trim();
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:.]+$/, '')}…`;
}

const NOT_A_RISK_TERM = /^(do not|reconsider|exercise|level|u\.s\.|read |review )/;

/** The risk terms the State Department puts in bold ("terrorism", "unrest"), minus the country. */
export function extractCategories(html: string, country: string, limit = 5): string[] {
  const own = normalizeCountryName(country);
  const seen: string[] = [];
  for (const match of html.matchAll(/<b>([\s\S]*?)<\/b>/gi)) {
    // One bold run can hold a list ("terrorism, crime, and kidnapping").
    for (const part of htmlToText(match[1] as string).split(/,|;|\band\b/i)) {
      const term = part.toLowerCase().replace(/^[\s.,;:]+|[\s.,;:]+$/g, '');
      if (!term || term.length > 30 || NOT_A_RISK_TERM.test(term)) continue;
      if (normalizeCountryName(term) === own || seen.includes(term)) continue;
      seen.push(term);
      if (seen.length >= limit) return seen;
    }
  }
  return seen;
}

/** Validates and indexes the feed by normalised country name; throws if nothing usable is in it. */
export function parseFeed(raw: unknown): Map<string, FeedAdvisory> {
  if (!Array.isArray(raw)) throw new Error('Unexpected advisory feed');
  const byCountry = new Map<string, FeedAdvisory>();
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) continue;
    const record = entry as Record<string, unknown>;
    if (typeof record.Title !== 'string') continue;
    const title = parseAdvisoryTitle(record.Title);
    if (!title) continue;
    byCountry.set(normalizeCountryName(title.country), {
      country: title.country.replace(/\s+Travel Advisory$/i, ''),
      level: title.level,
      label: title.label,
      summaryHtml: typeof record.Summary === 'string' ? record.Summary : '',
      link: typeof record.Link === 'string' ? record.Link : '',
      updated: typeof record.Updated === 'string' ? record.Updated : '',
    });
  }
  if (byCountry.size === 0) throw new Error('Unexpected advisory feed');
  return byCountry;
}

/** Keeps the headline paragraph and drops the long detail sections that follow it. */
export function leadSummary(text: string): string {
  const cut = text.search(/\s*Read the entire Travel Advisory/i);
  return cut > 0 ? text.slice(0, cut).trim() : text;
}

export function toLiveAdvisory(destinationSlug: string, entry: FeedAdvisory): Advisory {
  const parsed = entry.updated ? new Date(entry.updated) : null;
  const updatedIso = parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : null;
  // Show the State Department's own calendar date, not the UTC-shifted one.
  const day = /^\d{4}-\d{2}-\d{2}/.exec(entry.updated)?.[0];
  const date = updatedIso && day ? ` Updated ${day}.` : '';
  return {
    destinationSlug,
    level: entry.level,
    label: entry.label,
    summary: truncate(leadSummary(htmlToText(entry.summaryHtml)), 400),
    categories: extractCategories(entry.summaryHtml, entry.country),
    kind: 'live',
    sourceLabel: `U.S. Department of State travel advisory for ${entry.country}.${date}`,
    sourceUrl: entry.link || null,
    updatedAt: updatedIso,
  };
}

export type LiveLookup =
  | { status: 'found'; advisory: FeedAdvisory }
  | { status: 'not_issued' }
  | { status: 'unavailable' };

export interface AdvisoryService {
  lookup(countryName: string): Promise<LiveLookup>;
}

export interface AdvisoryServiceOptions {
  fetch: FetchLike;
  now?: () => number;
  ttlMs?: number;
  timeoutMs?: number;
}

/**
 * Fetches the State Department feed (one request covers every country), keeps it in memory for
 * a few hours, and serves the last good copy if a refresh fails. It never throws: when nothing
 * is available it reports `unavailable` so the caller can use the sample fallback.
 */
export function createAdvisoryService(options: AdvisoryServiceOptions): AdvisoryService {
  const now = options.now ?? Date.now;
  const ttlMs = options.ttlMs ?? ADVISORY_TTL_MS;
  const timeoutMs = options.timeoutMs ?? ADVISORY_TIMEOUT_MS;
  let cache: { expires: number; feed: Map<string, FeedAdvisory> } | null = null;
  let inFlight: Promise<Map<string, FeedAdvisory> | null> | null = null;

  async function download(): Promise<Map<string, FeedAdvisory> | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await options.fetch(ADVISORY_FEED_URL, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) return null;
      return parseFeed(await response.json());
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  async function load(): Promise<Map<string, FeedAdvisory> | null> {
    if (cache && cache.expires > now()) return cache.feed;
    inFlight ??= download().finally(() => {
      inFlight = null;
    });
    const feed = await inFlight;
    if (feed) {
      cache = { expires: now() + ttlMs, feed };
      return feed;
    }
    return cache ? cache.feed : null; // stale copy beats nothing
  }

  return {
    async lookup(countryName) {
      const feed = await load();
      if (!feed) return { status: 'unavailable' };
      const advisory = feed.get(normalizeCountryName(countryName));
      return advisory ? { status: 'found', advisory } : { status: 'not_issued' };
    },
  };
}

interface SampleRow {
  level: number;
  summary: string;
  categories: string[];
  source_label: string;
}

/** The made-up fallback advisory from the seed data. */
export async function getSampleAdvisory(db: Queryable, slug: string): Promise<Advisory | null> {
  const { rows } = await db.query<SampleRow>(
    `select a.level, a.summary, a.categories, a.source_label
     from destinations d join advisories a on a.destination_id = d.id
     where d.slug = $1`,
    [slug],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    destinationSlug: slug,
    level: row.level,
    label: levelLabel(row.level),
    summary: row.summary,
    categories: row.categories,
    kind: 'sample',
    sourceLabel: row.source_label,
    sourceUrl: null,
    updatedAt: null,
  };
}

/**
 * Live U.S. State Department advisory for the destination's country; a note when the State
 * Department issues none for it (e.g. the United States); or the labelled sample when the feed
 * cannot be reached.
 */
export async function getAdvisory(
  db: Queryable,
  service: AdvisoryService,
  destination: { slug: string; country: string },
): Promise<AdvisoryResponse> {
  const lookup = await service.lookup(destination.country);
  if (lookup.status === 'found') {
    return {
      advisory: toLiveAdvisory(destination.slug, lookup.advisory),
      disclaimer: LIVE_DISCLAIMER,
    };
  }
  if (lookup.status === 'not_issued') {
    return {
      advisory: null,
      disclaimer: LIVE_DISCLAIMER,
      note: `The U.S. Department of State does not publish a travel advisory for ${destination.country}.`,
    };
  }
  const sample = await getSampleAdvisory(db, destination.slug);
  return sample
    ? { advisory: sample, disclaimer: SAMPLE_DISCLAIMER }
    : {
        advisory: null,
        disclaimer: SAMPLE_DISCLAIMER,
        note: 'Travel advisories are unavailable right now.',
      };
}
