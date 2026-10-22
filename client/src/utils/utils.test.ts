import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addDays,
  daysBetween,
  defaultDates,
  isIsoDate,
  nightsBetween,
  todayIso,
  utcDay,
} from './dates';
import { debounce } from './debounce';
import {
  formatClock,
  formatDate,
  formatDuration,
  formatMoney,
  formatTimeUtc,
  plural,
  stopsLabel,
  titleCase,
} from './format';
import { formatTemperature, weatherEmoji, weatherProblem } from './presentation';

describe('SCRUM-11: debounce', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('calls once, after the quiet period, with the latest arguments', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 300);
    debounced('t');
    debounced('to');
    debounced('tok');
    vi.advanceTimersByTime(299);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('tok');
  });

  it('restarts the wait on each call and can be cancelled', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);
    debounced();
    vi.advanceTimersByTime(80);
    debounced();
    vi.advanceTimersByTime(80);
    expect(fn).not.toHaveBeenCalled();
    debounced.cancel();
    vi.advanceTimersByTime(500);
    expect(fn).not.toHaveBeenCalled();
    debounced.cancel(); // safe when nothing is pending
  });
});

describe('date utils', () => {
  it('validates, adds and compares dates', () => {
    expect(isIsoDate('2026-02-29')).toBe(false);
    expect(isIsoDate('2026-11-05')).toBe(true);
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(daysBetween('2026-11-05', '2026-11-08')).toBe(3);
    expect(nightsBetween('2026-03-07', '2026-03-09')).toBe(2);
    expect(utcDay('2026-11-05T23:30:00.000Z')).toBe('2026-11-05');
    expect(() => addDays('bad', 1)).toThrow(RangeError);
  });

  it('gives search defaults two weeks out', () => {
    const now = new Date('2026-10-21T12:00:00Z');
    expect(todayIso(now)).toBe('2026-10-21');
    expect(defaultDates(7, now)).toEqual({ start: '2026-11-04', end: '2026-11-11' });
  });
});

describe('formatting', () => {
  it('formats money, dates and clock times', () => {
    expect(formatMoney(1234.5)).toBe('$1,234.50');
    expect(formatDate('2026-11-05')).toBe('Thu, Nov 5');
    expect(formatDate('garbage')).toBe('garbage');
    expect(formatClock('13:00')).toBe('1:00 PM');
    expect(formatClock('00:05')).toBe('12:05 AM');
    expect(formatClock('12:00')).toBe('12:00 PM');
    expect(formatClock(null)).toBe('');
    expect(formatTimeUtc('2026-11-05T08:15:00.000Z')).toBe('08:15 UTC');
  });

  it('formats durations, counts and labels', () => {
    expect(formatDuration(840)).toBe('14h');
    expect(formatDuration(875)).toBe('14h 35m');
    expect(formatDuration(45)).toBe('45m');
    expect(plural(1, 'night')).toBe('1 night');
    expect(plural(3, 'night')).toBe('3 nights');
    expect(plural(2, 'person', 'people')).toBe('2 people');
    expect(stopsLabel(0)).toBe('Nonstop');
    expect(stopsLabel(2)).toBe('2 stops');
    expect(titleCase('food')).toBe('Food');
  });
});

describe('SCRUM-14: weather presentation helpers', () => {
  it('formats weather for display', () => {
    expect(formatTemperature(72, 'F')).toBe('72°F');
    expect(weatherEmoji('rain')).toBe('🌧️');
    expect(weatherEmoji('nope' as never)).toBe('☁️');
    expect(weatherProblem('timeout')).toMatch(/too long/);
    expect(weatherProblem('unreachable')).toMatch(/unavailable/);
  });
});
