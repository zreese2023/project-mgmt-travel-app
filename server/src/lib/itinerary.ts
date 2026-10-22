import { eachDay } from './dates.js';

export type ItemKind = 'flight' | 'hotel' | 'activity' | 'note';

export interface ItineraryItem {
  id: number;
  tripId: number;
  kind: ItemKind;
  title: string;
  /** 'YYYY-MM-DD' */
  day: string;
  /** 'HH:MM' or null when the item has no set time */
  startTime: string | null;
  position: number;
  notes: string | null;
  activityId: number | null;
  flightId: number | null;
  hotelId: number | null;
}

export interface DayPlan {
  day: string;
  /** 1-based index within the trip; null for days outside the trip's date range. */
  dayNumber: number | null;
  items: ItineraryItem[];
}

export interface TripSummary {
  days: number;
  items: number;
  byKind: Record<ItemKind, number>;
}

/** Orders by day, then position, then id (stable). */
export function compareItems(a: ItineraryItem, b: ItineraryItem): number {
  return a.day.localeCompare(b.day) || a.position - b.position || a.id - b.id;
}

/**
 * Where a new item goes within a day that is already ordered: before the first existing item
 * with a later set time, otherwise at the end. Items without a time keep their place.
 */
export function insertionIndex(
  existing: ReadonlyArray<Pick<ItineraryItem, 'startTime'>>,
  startTime: string | null,
): number {
  if (startTime === null) return existing.length;
  const index = existing.findIndex((e) => e.startTime !== null && e.startTime > startTime);
  return index === -1 ? existing.length : index;
}

/** Inserts `id` into an ordered list of ids at `index` (clamped). Pure; returns a new array. */
export function insertAt(ids: readonly number[], id: number, index: number): number[] {
  const at = Math.max(0, Math.min(index, ids.length));
  return [...ids.slice(0, at), id, ...ids.slice(at)];
}

/**
 * Groups items into a daily timeline. Every day in the trip range appears (even when empty),
 * plus any day outside the range that holds an item (e.g. a return flight after the trip end).
 */
export function groupByDay(
  startDate: string,
  endDate: string,
  items: readonly ItineraryItem[],
): DayPlan[] {
  const tripDays = eachDay(startDate, endDate);
  const allDays = new Set<string>([...tripDays, ...items.map((i) => i.day)]);
  return [...allDays].sort().map((day) => {
    const idx = tripDays.indexOf(day);
    return {
      day,
      dayNumber: idx === -1 ? null : idx + 1,
      items: items.filter((i) => i.day === day).sort(compareItems),
    };
  });
}

export function summarizeTrip(
  startDate: string,
  endDate: string,
  items: readonly ItineraryItem[],
): TripSummary {
  const byKind: Record<ItemKind, number> = { flight: 0, hotel: 0, activity: 0, note: 0 };
  for (const item of items) byKind[item.kind] += 1;
  return {
    days: eachDay(startDate, endDate).length,
    items: items.length,
    byKind,
  };
}

/** 'HH:MM:SS' (Postgres time) or 'HH:MM' to 'HH:MM'; null stays null. */
export function toHourMinute(time: string | null): string | null {
  return time === null ? null : time.slice(0, 5);
}

export function isHourMinute(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}
