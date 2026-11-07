import { describe, expect, it } from 'vitest';
import {
  filterByScope,
  sortBookings,
  toBookings,
  type Booking,
  type BookingRow,
} from '../../src/lib/bookings.js';

const TODAY = '2026-11-10';

function row(overrides: Partial<BookingRow> & { item_id: number }): BookingRow {
  return {
    kind: 'flight',
    title: `Item ${overrides.item_id}`,
    day: '2026-12-01',
    notes: null,
    flight_price: 500,
    nightly_price: null,
    trip_id: 1,
    trip_name: 'Tokyo trip',
    destination_name: 'Tokyo',
    paid_at: null,
    ...overrides,
  };
}

describe('SCRUM-26: shaping bookings from database rows', () => {
  it('prices a flight at its fare and a hotel at nightly rate x nights + 12% tax', () => {
    const [flight, hotel] = toBookings(
      [
        row({ item_id: 1, kind: 'flight', flight_price: 812.5 }),
        row({
          item_id: 2,
          kind: 'hotel',
          flight_price: null,
          nightly_price: 100,
          day: '2026-12-01',
          notes: 'Check-out 2026-12-04',
        }),
      ],
      TODAY,
    ) as [Booking, Booking];
    expect(flight).toMatchObject({ amount: 812.5, nights: null, endDate: '2026-12-01' });
    expect(hotel).toMatchObject({
      amount: 336,
      nights: 3,
      startDate: '2026-12-01',
      endDate: '2026-12-04',
    });
  });

  it('is planned until the trip is paid, then confirmed with the payment time', () => {
    const [planned, confirmed] = toBookings(
      [row({ item_id: 1 }), row({ item_id: 2, paid_at: new Date('2026-11-01T10:00:00Z') })],
      TODAY,
    ) as [Booking, Booking];
    expect(planned).toMatchObject({ status: 'planned', paidAt: null, canRemove: true });
    expect(confirmed).toMatchObject({
      status: 'confirmed',
      paidAt: '2026-11-01T10:00:00.000Z',
      canRemove: false,
      canChangeDates: false,
    });
  });

  it('marks a booking past only once its last day is before today', () => {
    const hotel = (id: number, day: string, out: string) =>
      row({
        item_id: id,
        kind: 'hotel',
        flight_price: null,
        nightly_price: 80,
        day,
        notes: `Check-out ${out}`,
      });
    const result = toBookings(
      [
        hotel(1, '2026-11-01', '2026-11-05'), // over
        hotel(2, '2026-11-08', '2026-11-10'), // checks out today: still current
        hotel(3, '2026-11-20', '2026-11-22'),
        row({ item_id: 4, day: '2026-11-09' }), // flight yesterday
      ],
      TODAY,
    );
    expect(result.map((b) => b.isPast)).toEqual([true, false, false, true]);
  });

  it('allows changing dates only for upcoming planned hotel stays', () => {
    const hotel = (id: number, day: string, paid: Date | null) =>
      row({
        item_id: id,
        kind: 'hotel',
        flight_price: null,
        nightly_price: 80,
        day,
        notes: 'Check-out 2026-12-05',
        paid_at: paid,
      });
    const [ok, paid, past, flight] = toBookings(
      [
        hotel(1, '2026-12-01', null),
        hotel(2, '2026-12-01', new Date()),
        row({
          item_id: 3,
          kind: 'hotel',
          flight_price: null,
          nightly_price: 80,
          day: '2026-10-01',
          notes: 'Check-out 2026-10-05',
        }),
        row({ item_id: 4 }),
      ],
      TODAY,
    ) as [Booking, Booking, Booking, Booking];
    expect([
      ok.canChangeDates,
      paid.canChangeDates,
      past.canChangeDates,
      flight.canChangeDates,
    ]).toEqual([true, false, false, false]);
    expect(past.canRemove).toBe(true); // a past planned booking can still be removed
  });

  it('copes with a hotel with no stored check-out and an item with no price', () => {
    const [hotel, unpriced] = toBookings(
      [
        row({
          item_id: 1,
          kind: 'hotel',
          flight_price: null,
          nightly_price: 100,
          day: '2026-12-01',
          notes: 'free text',
        }),
        row({ item_id: 2, flight_price: null }),
      ],
      TODAY,
    ) as [Booking, Booking];
    expect(hotel).toMatchObject({ nights: 1, endDate: '2026-12-01', amount: 112 });
    expect(unpriced.amount).toBe(0);
  });
});

describe('SCRUM-26: sorting and filtering', () => {
  const bookings = toBookings(
    [
      row({ item_id: 1, kind: 'flight', flight_price: 900, day: '2026-12-10', trip_name: 'Beta' }),
      row({
        item_id: 2,
        kind: 'hotel',
        flight_price: null,
        nightly_price: 100,
        day: '2026-12-01',
        notes: 'Check-out 2026-12-03',
        trip_name: 'Alpha',
      }),
      row({
        item_id: 3,
        kind: 'flight',
        flight_price: 300,
        day: '2026-12-05',
        trip_name: 'Alpha',
        paid_at: new Date(),
      }),
      row({ item_id: 4, kind: 'flight', flight_price: 300, day: '2026-11-01', trip_name: 'Gamma' }),
    ],
    TODAY,
  );
  const ids = (list: Booking[]) => list.map((b) => b.id);

  it('sorts by date by default, soonest first', () => {
    expect(ids(sortBookings(bookings))).toEqual([4, 2, 3, 1]);
  });

  it('sorts by price in either direction, breaking ties by date', () => {
    // hotel = 100 x 2 nights + 12% = 224; flights 300, 300 (tie, earlier date first), 900
    expect(ids(sortBookings(bookings, 'price', 'asc'))).toEqual([2, 4, 3, 1]);
    expect(ids(sortBookings(bookings, 'price', 'desc'))).toEqual([1, 4, 3, 2]);
  });

  it('sorts by trip name, type and status', () => {
    expect(ids(sortBookings(bookings, 'trip'))).toEqual([2, 3, 1, 4]);
    expect(ids(sortBookings(bookings, 'type'))).toEqual([4, 3, 1, 2]);
    expect(ids(sortBookings(bookings, 'status'))).toEqual([4, 2, 1, 3]); // planned first
    expect(ids(sortBookings(bookings, 'status', 'desc'))[0]).toBe(3); // confirmed first
  });

  it('does not mutate its input', () => {
    const before = ids(bookings);
    sortBookings(bookings, 'price', 'desc');
    expect(ids(bookings)).toEqual(before);
  });

  it('filters to upcoming or past bookings', () => {
    expect(ids(filterByScope(bookings, 'past'))).toEqual([4]);
    expect(ids(filterByScope(bookings, 'upcoming'))).toEqual([1, 2, 3]);
    expect(ids(filterByScope(bookings, 'all'))).toEqual([1, 2, 3, 4]);
  });
});
