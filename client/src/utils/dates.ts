/** Date helpers on 'YYYY-MM-DD' strings, computed in UTC so DST never shifts a day. */
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 24 * 60 * 60 * 1000;

function toUtcMs(iso: string): number {
  const match = ISO_DATE.exec(iso);
  if (!match) throw new RangeError(`Not an ISO date: ${iso}`);
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

export function isIsoDate(value: string): boolean {
  return ISO_DATE.test(value) && new Date(toUtcMs(value)).toISOString().slice(0, 10) === value;
}

export function todayIso(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  return new Date(toUtcMs(iso) + days * DAY_MS).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / DAY_MS);
}

export function nightsBetween(checkIn: string, checkOut: string): number {
  return daysBetween(checkIn, checkOut);
}

/** Sensible defaults for search forms: a week from now, for `length` days. */
export function defaultDates(
  length: number,
  now: Date = new Date(),
): { start: string; end: string } {
  const start = addDays(todayIso(now), 14);
  return { start, end: addDays(start, length) };
}

/** The UTC date part of an ISO timestamp, e.g. a flight departure. */
export function utcDay(timestamp: string): string {
  return timestamp.slice(0, 10);
}
