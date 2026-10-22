import { describe, expect, it } from 'vitest';
import {
  addDays,
  daysBetween,
  eachDay,
  isIsoDate,
  isoDateOf,
  nightsBetween,
  todayIso,
} from '../../src/lib/dates.js';

describe('SCRUM-23: date and night calculations', () => {
  it('validates ISO dates including real calendar days', () => {
    expect(isIsoDate('2026-02-28')).toBe(true);
    expect(isIsoDate('2028-02-29')).toBe(true);
    expect(isIsoDate('2026-02-29')).toBe(false);
    expect(isIsoDate('2026-13-01')).toBe(false);
    expect(isIsoDate('26-01-01')).toBe(false);
    expect(isIsoDate('')).toBe(false);
  });

  it('counts nights across month ends and DST changes', () => {
    expect(nightsBetween('2026-11-05', '2026-11-08')).toBe(3);
    expect(nightsBetween('2026-01-30', '2026-02-02')).toBe(3);
    expect(nightsBetween('2026-03-07', '2026-03-09')).toBe(2); // US DST starts 2026-03-08
    expect(nightsBetween('2026-11-05', '2026-11-05')).toBe(0);
    expect(daysBetween('2026-11-08', '2026-11-05')).toBe(-3);
  });

  it('adds days and lists every day inclusively', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(eachDay('2026-11-05', '2026-11-07')).toEqual(['2026-11-05', '2026-11-06', '2026-11-07']);
    expect(eachDay('2026-11-05', '2026-11-05')).toEqual(['2026-11-05']);
    expect(eachDay('2026-11-07', '2026-11-05')).toEqual([]);
  });

  it('formats today in UTC', () => {
    expect(todayIso(new Date('2026-10-21T23:59:59Z'))).toBe('2026-10-21');
    expect(isoDateOf(new Date('2026-10-22T00:00:00Z'))).toBe('2026-10-22');
    expect(todayIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('throws on a malformed date', () => {
    expect(() => addDays('nope', 1)).toThrow(RangeError);
  });
});
