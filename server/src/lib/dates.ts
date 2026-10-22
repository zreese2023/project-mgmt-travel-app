/** Date helpers on 'YYYY-MM-DD' strings. All maths is done in UTC so DST never shifts a day. */
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 24 * 60 * 60 * 1000;

function toUtcMs(iso: string): number {
  const match = ISO_DATE.exec(iso);
  if (!match) throw new RangeError(`Not an ISO date: ${iso}`);
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  return new Date(toUtcMs(value)).toISOString().slice(0, 10) === value;
}

export function isoDateOf(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function todayIso(now: Date = new Date()): string {
  return isoDateOf(now);
}

export function addDays(iso: string, days: number): string {
  return isoDateOf(new Date(toUtcMs(iso) + days * DAY_MS));
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / DAY_MS);
}

/** Number of nights between check-in and check-out. */
export function nightsBetween(checkIn: string, checkOut: string): number {
  return daysBetween(checkIn, checkOut);
}

/** Every date from start to end inclusive; empty if end is before start. */
export function eachDay(start: string, end: string): string[] {
  const count = daysBetween(start, end);
  if (count < 0) return [];
  return Array.from({ length: count + 1 }, (_, i) => addDays(start, i));
}
