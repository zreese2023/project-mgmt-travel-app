import { describe, expect, it } from 'vitest';
import {
  compareItems,
  groupByDay,
  insertAt,
  insertionIndex,
  isHourMinute,
  summarizeTrip,
  toHourMinute,
  type ItineraryItem,
} from '../../src/lib/itinerary.js';
import { parseNewItem } from '../../src/lib/trips.js';
import { AppError } from '../../src/lib/errors.js';

function item(overrides: Partial<ItineraryItem> & { id: number }): ItineraryItem {
  return {
    tripId: 1,
    kind: 'activity',
    title: `Item ${overrides.id}`,
    day: '2026-11-05',
    startTime: null,
    position: 0,
    notes: null,
    activityId: null,
    flightId: null,
    hotelId: null,
    ...overrides,
  };
}

describe('SCRUM-31: itinerary ordering', () => {
  it('sorts by day, then position, then id', () => {
    const items = [
      item({ id: 3, day: '2026-11-06', position: 0 }),
      item({ id: 2, position: 1 }),
      item({ id: 1, position: 1 }),
      item({ id: 4, position: 0 }),
    ];
    expect(items.sort(compareItems).map((i) => i.id)).toEqual([4, 1, 2, 3]);
  });

  it('places a timed item before the first later-timed item, otherwise at the end', () => {
    const day = [{ startTime: '09:00' }, { startTime: null }, { startTime: '15:00' }];
    expect(insertionIndex(day, '08:00')).toBe(0);
    expect(insertionIndex(day, '13:00')).toBe(2);
    expect(insertionIndex(day, '16:00')).toBe(3);
    expect(insertionIndex(day, null)).toBe(3);
    expect(insertionIndex([], '10:00')).toBe(0);
  });

  it('inserts an id at an index without mutating the input and clamps out-of-range indexes', () => {
    const ids = [1, 2, 3];
    expect(insertAt(ids, 9, 1)).toEqual([1, 9, 2, 3]);
    expect(insertAt(ids, 9, 99)).toEqual([1, 2, 3, 9]);
    expect(insertAt(ids, 9, -5)).toEqual([9, 1, 2, 3]);
    expect(ids).toEqual([1, 2, 3]);
  });
});

describe('SCRUM-31: daily timeline', () => {
  const items = [
    item({ id: 1, day: '2026-11-06', position: 1 }),
    item({ id: 2, day: '2026-11-06', position: 0 }),
    item({ id: 3, day: '2026-11-04', kind: 'flight' }),
  ];

  it('lists every day of the trip, in order, including empty days', () => {
    const days = groupByDay('2026-11-05', '2026-11-07', items);
    expect(days.map((d) => [d.day, d.dayNumber, d.items.map((i) => i.id)])).toEqual([
      ['2026-11-04', null, [3]],
      ['2026-11-05', 1, []],
      ['2026-11-06', 2, [2, 1]],
      ['2026-11-07', 3, []],
    ]);
  });

  it('summarises counts by kind', () => {
    expect(summarizeTrip('2026-11-05', '2026-11-07', items)).toEqual({
      days: 3,
      items: 3,
      byKind: { flight: 1, hotel: 0, activity: 2, note: 0 },
    });
  });

  it('normalises and validates times', () => {
    expect(toHourMinute('13:00:00')).toBe('13:00');
    expect(toHourMinute(null)).toBeNull();
    expect(isHourMinute('23:59')).toBe(true);
    expect(isHourMinute('24:00')).toBe(false);
    expect(isHourMinute('9:00')).toBe(false);
  });
});

describe('SCRUM-32: parsing an add-item request', () => {
  it('accepts an activity from the destination, a custom activity, a note, a flight and a hotel', () => {
    expect(parseNewItem({ kind: 'activity', activityId: 4, day: '2026-11-05' })).toMatchObject({
      kind: 'activity',
      activityId: 4,
    });
    expect(
      parseNewItem({
        kind: 'activity',
        title: 'Visit Shibuya',
        day: '2026-11-05',
        startTime: '13:00',
      }),
    ).toMatchObject({ kind: 'activity', title: 'Visit Shibuya', startTime: '13:00' });
    expect(parseNewItem({ kind: 'note', title: 'Pack', day: '2026-11-05' })).toMatchObject({
      kind: 'note',
    });
    expect(parseNewItem({ kind: 'flight', flightId: 3 })).toEqual({ kind: 'flight', flightId: 3 });
    expect(
      parseNewItem({ kind: 'hotel', hotelId: 2, checkIn: '2026-11-05', checkOut: '2026-11-07' }),
    ).toEqual({
      kind: 'hotel',
      hotelId: 2,
      checkIn: '2026-11-05',
      checkOut: '2026-11-07',
    });
  });

  it.each([
    [{ kind: 'flight' as const }, 'flightId'],
    [{ kind: 'hotel' as const, hotelId: 1 }, 'checkIn'],
    [{ kind: 'note' as const, title: 'x' }, 'day'],
    [{ kind: 'note' as const, day: '2026-11-05' }, 'title'],
  ])('rejects a request missing a field %#', (body, field) => {
    try {
      parseNewItem(body);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).statusCode).toBe(422);
      expect((err as AppError).details).toHaveProperty(field);
    }
  });
});
