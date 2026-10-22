import type { Queryable } from './db.js';

export interface DestinationFilters {
  q?: string | undefined;
  regions?: string[] | undefined;
  budgets?: number[] | undefined;
  interests?: string[] | undefined;
}

export interface DestinationSummary {
  id: number;
  slug: string;
  name: string;
  country: string;
  region: string;
  description: string;
  imageUrl: string;
  avgDailyCost: number;
  budgetTier: number;
  interests: string[];
}

export interface Activity {
  id: number;
  name: string;
  category: string;
  description: string;
  durationMin: number;
}

export interface DestinationDetail extends DestinationSummary {
  latitude: number;
  longitude: number;
  airportCode: string;
  activities: Activity[];
}

interface DestinationRow {
  id: number;
  slug: string;
  name: string;
  country: string;
  region: string;
  description: string;
  image_url: string;
  avg_daily_cost: number;
  budget_tier: number;
  interests: string[];
}

interface DetailRow extends DestinationRow {
  latitude: number;
  longitude: number;
  airport_code: string;
}

export const BUDGET_TIERS = [
  { tier: 1, label: '$', description: 'Budget: under $100 a day' },
  { tier: 2, label: '$$', description: 'Moderate: $100 to $179 a day' },
  { tier: 3, label: '$$$', description: 'Comfortable: $180 to $259 a day' },
  { tier: 4, label: '$$$$', description: 'Premium: $260+ a day' },
] as const;

/** Escapes LIKE wildcards so user text is matched literally. */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/** Accepts a repeated query param or a comma-separated string; trims and drops blanks. */
export function parseList(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  const parts = Array.isArray(value) ? value : [value];
  return parts
    .flatMap((part) => part.split(','))
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

export function buildDestinationQuery(filters: DestinationFilters): {
  text: string;
  values: unknown[];
} {
  const where: string[] = [];
  const values: unknown[] = [];
  const param = (value: unknown): string => {
    values.push(value);
    return `$${values.length}`;
  };

  const q = filters.q?.trim();
  if (q) {
    const p = param(`%${escapeLike(q)}%`);
    where.push(
      `(name ilike ${p} or country ilike ${p} or region ilike ${p}` +
        ` or exists (select 1 from unnest(interests) i where i ilike ${p}))`,
    );
  }
  if (filters.regions?.length) {
    where.push(
      `lower(region) = any(${param(filters.regions.map((r) => r.toLowerCase()))}::text[])`,
    );
  }
  if (filters.budgets?.length) {
    where.push(`budget_tier = any(${param(filters.budgets)}::int[])`);
  }
  if (filters.interests?.length) {
    where.push(`interests && ${param(filters.interests.map((i) => i.toLowerCase()))}::text[]`);
  }

  const text =
    'select id, slug, name, country, region, description, image_url, avg_daily_cost, budget_tier, interests' +
    ' from destinations' +
    (where.length ? ` where ${where.join(' and ')}` : '') +
    ' order by name';
  return { text, values };
}

export function toSummary(row: DestinationRow): DestinationSummary {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    country: row.country,
    region: row.region,
    description: row.description,
    imageUrl: row.image_url,
    avgDailyCost: row.avg_daily_cost,
    budgetTier: row.budget_tier,
    interests: row.interests,
  };
}

export async function searchDestinations(
  db: Queryable,
  filters: DestinationFilters,
): Promise<DestinationSummary[]> {
  const { text, values } = buildDestinationQuery(filters);
  const { rows } = await db.query<DestinationRow>(text, values);
  return rows.map(toSummary);
}

export async function getDestinationBySlug(
  db: Queryable,
  slug: string,
): Promise<DestinationDetail | null> {
  const { rows } = await db.query<DetailRow>(
    `select id, slug, name, country, region, description, image_url, avg_daily_cost, budget_tier,
            interests, latitude, longitude, airport_code
     from destinations where slug = $1`,
    [slug],
  );
  const row = rows[0];
  if (!row) return null;
  const { rows: activityRows } = await db.query<{
    id: number;
    name: string;
    category: string;
    description: string;
    duration_min: number;
  }>(
    'select id, name, category, description, duration_min from activities where destination_id = $1 order by id',
    [row.id],
  );
  return {
    ...toSummary(row),
    latitude: row.latitude,
    longitude: row.longitude,
    airportCode: row.airport_code,
    activities: activityRows.map((a) => ({
      id: a.id,
      name: a.name,
      category: a.category,
      description: a.description,
      durationMin: a.duration_min,
    })),
  };
}

export async function listDestinationFilters(db: Queryable): Promise<{
  regions: string[];
  interests: string[];
  budgets: typeof BUDGET_TIERS;
}> {
  const { rows: regionRows } = await db.query<{ region: string }>(
    'select distinct region from destinations order by region',
  );
  const { rows: interestRows } = await db.query<{ interest: string }>(
    'select distinct unnest(interests) as interest from destinations order by interest',
  );
  return {
    regions: regionRows.map((r) => r.region),
    interests: interestRows.map((r) => r.interest),
    budgets: BUDGET_TIERS,
  };
}
