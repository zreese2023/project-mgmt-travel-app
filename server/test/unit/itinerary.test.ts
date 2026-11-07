import { describe, expect, it } from 'vitest';
import {
  compareItems,
  groupByDay,
  insertAt,
  insertionIndex,
  isHourMinute,
  isPastTrip,
  moveInOrder,
  orderTrips,
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

describe('SCRUM-32: rearranging items (pure)', () => {
  it('moves an item one place up or down', () => {
    expect(moveInOrder([1, 2, 3], 2, 'up')).toEqual([2, 1, 3]);
    expect(moveInOrder([1, 2, 3], 2, 'down')).toEqual([1, 3, 2]);
    expect(moveInOrder([1, 2, 3], 3, 'up')).toEqual([1, 3, 2]);
  });

  it('does nothing at either end, for a single item or for an unknown id', () => {
    expect(moveInOrder([1, 2, 3], 1, 'up')).toEqual([1, 2, 3]);
    expect(moveInOrder([1, 2, 3], 3, 'down')).toEqual([1, 2, 3]);
    expect(moveInOrder([7], 7, 'up')).toEqual([7]);
    expect(moveInOrder([1, 2, 3], 99, 'down')).toEqual([1, 2, 3]);
    expect(moveInOrder([], 1, 'up')).toEqual([]);
  });

  it('never mutates its input', () => {
    const ids = [1, 2, 3];
    moveInOrder(ids, 2, 'up');
    expect(ids).toEqual([1, 2, 3]);
  });
});

describe('SCRUM-35: past trips', () => {
  const today = '2026-11-10';

  it('is past only once the last day is before today', () => {
    expect(isPastTrip('2026-11-09', today)).toBe(true);
    expect(isPastTrip('2026-11-10', today)).toBe(false); // ends today: still current
    expect(isPastTrip('2026-11-11', today)).toBe(false);
    expect(isPastTrip('2025-01-01', today)).toBe(true);
  });

  it('orders upcoming trips soonest first, then past trips most recently ended first', () => {
    const trips = [
      { id: 1, startDate: '2026-01-01', endDate: '2026-01-05' }, // past, older
      { id: 2, startDate: '2026-12-20', endDate: '2026-12-25' }, // upcoming, later
      { id: 3, startDate: '2026-11-01', endDate: '2026-11-10' }, // ends today: upcoming
      { id: 4, startDate: '2026-10-01', endDate: '2026-10-07' }, // past, recent
      { id: 5, startDate: '2026-11-15', endDate: '2026-11-20' }, // upcoming, soon
    ];
    expect(orderTrips(trips, today).map((t) => t.id)).toEqual([3, 5, 2, 4, 1]);
  });

  it('breaks ties by id and does not mutate its input', () => {
    const trips = [
      { id: 2, startDate: '2026-12-01', endDate: '2026-12-02' },
      { id: 1, startDate: '2026-12-01', endDate: '2026-12-02' },
    ];
    expect(orderTrips(trips, today).map((t) => t.id)).toEqual([1, 2]);
    expect(trips.map((t) => t.id)).toEqual([2, 1]);
    expect(orderTrips([], today)).toEqual([]);
  });
});
