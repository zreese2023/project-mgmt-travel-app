import { describe, expect, it } from 'vitest';
import { AppError } from '../../src/lib/errors.js';
import {
  buildFlightQuery,
  searchFlights,
  searchWindow,
  toFlight,
  validateFlightSearch,
  type FlightRow,
} from '../../src/lib/flights.js';
import {
  buildHotelQuery,
  groupHotelRows,
  searchHotels,
  validateStay,
  type HotelRoomRow,
} from '../../src/lib/hotels.js';
import { mockDb } from '../helpers/mockDb.js';

const TODAY = '2026-10-21';

function details(fn: () => void): Record<string, string> | undefined {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).statusCode).toBe(422);
    return (err as AppError).details;
  }
  return undefined;
}

describe('SCRUM-21: flight search validation', () => {
  const ok = { origin: 'JFK', destination: 'NRT', depart: '2026-11-05' };

  it('accepts one-way and round-trip searches', () => {
    expect(details(() => validateFlightSearch(ok, TODAY))).toBeUndefined();
    expect(
      details(() => validateFlightSearch({ ...ok, returnDate: '2026-11-12' }, TODAY)),
    ).toBeUndefined();
    expect(
      details(() => validateFlightSearch({ ...ok, returnDate: '2026-11-05' }, TODAY)),
    ).toBeUndefined();
  });

  it('rejects missing airports, same airport and bad dates', () => {
    expect(details(() => validateFlightSearch({ ...ok, origin: '' }, TODAY))).toHaveProperty(
      'origin',
    );
    expect(
      details(() => validateFlightSearch({ ...ok, destination: 'tokyo' }, TODAY)),
    ).toHaveProperty('destination');
    expect(
      details(() => validateFlightSearch({ ...ok, destination: 'JFK' }, TODAY)),
    ).toHaveProperty('destination');
    expect(details(() => validateFlightSearch({ ...ok, depart: 'soon' }, TODAY))).toHaveProperty(
      'depart',
    );
    expect(
      details(() => validateFlightSearch({ ...ok, depart: '2026-10-20' }, TODAY)),
    ).toHaveProperty('depart');
  });

  it('rejects a return before departure or a malformed return date', () => {
    expect(
      details(() => validateFlightSearch({ ...ok, returnDate: '2026-11-04' }, TODAY)),
    ).toHaveProperty('returnDate');
    expect(details(() => validateFlightSearch({ ...ok, returnDate: 'x' }, TODAY))).toHaveProperty(
      'returnDate',
    );
  });
});

describe('SCRUM-21: flight query and mapping', () => {
  it('filters by route, UTC departure date, seats and cancelled status, with parameters', () => {
    const { text, values } = buildFlightQuery('JFK', 'NRT', '2026-11-05', { passengers: 2 });
    expect(values).toEqual(['JFK', 'NRT', '2026-11-05', 2]);
    expect(text).toContain("status <> 'cancelled'");
    expect(text).toContain('seats_available >= $4');
    expect(text).toContain('order by depart_at asc');
  });

  it('adds a price cap and the requested sort', () => {
    const q = buildFlightQuery('JFK', 'NRT', '2026-11-05', { maxPrice: 900, sort: 'price' });
    expect(q.values).toEqual(['JFK', 'NRT', '2026-11-05', 1, 900]);
    expect(q.text).toContain('price <= $5');
    expect(q.text).toContain('order by price asc');
    expect(buildFlightQuery('A', 'B', 'c', { sort: 'duration' }).text).toContain(
      'arrive_at - depart_at',
    );
  });

  it('maps a row, computing the duration in minutes', () => {
    const row: FlightRow = {
      id: 1,
      flight_no: 'SK100',
      airline: 'Skyline Air',
      origin_code: 'JFK',
      dest_code: 'NRT',
      depart_at: new Date('2026-11-05T08:15:00Z'),
      arrive_at: new Date('2026-11-05T22:15:00Z'),
      price: 900,
      seats_available: 10,
      stops: 0,
      status: 'on_time',
    };
    expect(toFlight(row)).toMatchObject({
      flightNo: 'SK100',
      durationMin: 840,
      departAt: '2026-11-05T08:15:00.000Z',
    });
  });

  it('searches the reverse route for a return date (mocked DB)', async () => {
    const { db, query } = mockDb([], []);
    const result = await searchFlights(
      db,
      { origin: 'JFK', destination: 'NRT', depart: '2026-11-05', returnDate: '2026-11-12' },
      TODAY,
    );
    expect(result).toEqual({ outbound: [], return: [] });
    expect(query.mock.calls.map((c) => (c as unknown[])[1])).toEqual([
      ['JFK', 'NRT', '2026-11-05', 1],
      ['NRT', 'JFK', '2026-11-12', 1],
    ]);
  });

  it('does not search a return leg for a one-way trip', async () => {
    const { db, query } = mockDb([]);
    const result = await searchFlights(
      db,
      { origin: 'JFK', destination: 'NRT', depart: '2026-11-05' },
      TODAY,
    );
    expect(result.return).toBeNull();
    expect(query).toHaveBeenCalledOnce();
  });

  it('reports the date window flights are seeded for', () => {
    expect(searchWindow(TODAY)).toEqual({ from: '2026-10-22', to: '2027-01-19' });
  });
});

describe('SCRUM-23: stay validation', () => {
  it('returns the number of nights for a valid stay', () => {
    expect(validateStay('2026-11-05', '2026-11-08', 2, TODAY)).toBe(3);
  });

  it('rejects bad dates, check-out not after check-in, long stays and bad guest counts', () => {
    expect(details(() => validateStay('x', '2026-11-08', 1, TODAY))).toHaveProperty('checkIn');
    expect(details(() => validateStay('2026-10-01', '2026-11-08', 1, TODAY))).toHaveProperty(
      'checkIn',
    );
    expect(details(() => validateStay('2026-11-05', 'x', 1, TODAY))).toHaveProperty('checkOut');
    expect(details(() => validateStay('2026-11-05', '2026-11-05', 1, TODAY))).toHaveProperty(
      'checkOut',
    );
    expect(details(() => validateStay('2026-11-05', '2026-11-04', 1, TODAY))).toHaveProperty(
      'checkOut',
    );
    expect(details(() => validateStay('2026-11-05', '2026-12-30', 1, TODAY))).toHaveProperty(
      'checkOut',
    );
    expect(details(() => validateStay('2026-11-05', '2026-11-08', 0, TODAY))).toHaveProperty(
      'guests',
    );
    expect(details(() => validateStay('2026-11-05', '2026-11-08', 9, TODAY))).toHaveProperty(
      'guests',
    );
  });
});

const roomRow = (overrides: Partial<HotelRoomRow>): HotelRoomRow => ({
  hotel_id: 1,
  hotel_name: 'Tokyo Grand Hotel',
  rating: 4.6,
  amenities: ['wifi', 'pool'],
  address: '1 Central Plaza, Tokyo',
  image_url: '/img/destinations/tokyo.svg',
  destination_slug: 'tokyo',
  destination_name: 'Tokyo',
  room_type_id: 10,
  room_name: 'Standard Room',
  capacity: 2,
  nightly_price: 100,
  ...overrides,
});

describe('SCRUM-23: hotel query and grouping', () => {
  it('builds a parameterised query with every filter', () => {
    const { text, values } = buildHotelQuery({
      destination: 'tokyo',
      checkIn: '2026-11-05',
      checkOut: '2026-11-08',
      guests: 2,
      minPrice: 50,
      maxPrice: 300,
      minRating: 4,
      amenities: ['Pool', 'wifi'],
    });
    expect(values).toEqual(['tokyo', 2, 50, 300, 4, ['pool', 'wifi']]);
    expect(text).toContain('d.slug = $1');
    expect(text).toContain('r.capacity >= $2');
    expect(text).toContain('r.nightly_price >= $3');
    expect(text).toContain('r.nightly_price <= $4');
    expect(text).toContain('h.rating >= $5');
    expect(text).toContain('h.amenities @> $6::text[]');
  });

  it('adds no where clause or parameters when nothing is filtered', () => {
    const { text, values } = buildHotelQuery({ checkIn: 'a', checkOut: 'b' });
    expect(text).not.toContain(' where ');
    expect(values).toEqual([]);
  });

  it('groups rooms by hotel and prices each room for the stay', () => {
    const rows = [
      roomRow({ room_type_id: 10, nightly_price: 100 }),
      roomRow({ room_type_id: 11, room_name: 'Suite', nightly_price: 210 }),
    ];
    const [hotel] = groupHotelRows(rows, 3);
    expect(hotel?.rooms.map((r) => r.name)).toEqual(['Standard Room', 'Suite']);
    expect(hotel?.rooms[0]).not.toHaveProperty('roomsAvailable');
    expect(hotel?.fromNightly).toBe(100);
    expect(hotel?.fromTotal).toBe(336); // 100 x 3 nights + 12% tax
    expect(hotel?.rooms[1]?.price.total).toBe(705.6);
  });

  it('sorts hotels by price or by rating', () => {
    const rows = [
      roomRow({ hotel_id: 1, hotel_name: 'A', rating: 3.4, nightly_price: 50 }),
      roomRow({ hotel_id: 2, hotel_name: 'B', rating: 4.8, nightly_price: 200, room_type_id: 20 }),
    ];
    expect(groupHotelRows(rows, 1, 'price').map((h) => h.name)).toEqual(['A', 'B']);
    expect(groupHotelRows(rows, 1, 'rating').map((h) => h.name)).toEqual(['B', 'A']);
  });

  it('validates before querying (mocked DB)', async () => {
    const { db, query } = mockDb([roomRow({})]);
    const result = await searchHotels(
      db,
      { destination: 'tokyo', checkIn: '2026-11-05', checkOut: '2026-11-06' },
      TODAY,
    );
    expect(result).toHaveLength(1);
    await expect(
      searchHotels(db, { checkIn: '2026-11-06', checkOut: '2026-11-05' }, TODAY),
    ).rejects.toBeInstanceOf(AppError);
    expect(query).toHaveBeenCalledOnce();
  });
});
