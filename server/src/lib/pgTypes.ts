import pg from 'pg';

/** Postgres type OIDs we override (see pg-types). */
export const OID = { int8: 20, date: 1082, numeric: 1700 } as const;

type ParserRegistry = Pick<typeof pg.types, 'setTypeParser'>;

/** numeric/int8 arrive as strings from `pg`; money and counts should be plain numbers. */
export function parseNumber(value: string): number {
  return Number(value);
}

/** Keep `date` as the raw 'YYYY-MM-DD' text so there is no timezone shift via JS Date. */
export function parseDate(value: string): string {
  return value;
}

export function registerTypeParsers(types: ParserRegistry = pg.types): void {
  types.setTypeParser(OID.numeric, parseNumber);
  types.setTypeParser(OID.int8, parseNumber);
  types.setTypeParser(OID.date, parseDate);
}
