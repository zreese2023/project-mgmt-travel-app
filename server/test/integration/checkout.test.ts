import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auth, createTestApp, daysFromNow, registerUser, type TestUser } from '../helpers/app.js';
import { createTestFlight, createTestPool } from '../helpers/db.js';

interface CostLine {
  itemId: number;
  kind: string;
  amount: number;
  detail?: string;
}

describe('Checkout (real Postgres)', () => {
  let app: FastifyInstance;
  let pool: pg.Pool;
  let user: TestUser;
  beforeAll(async () => {
    app = await createTestApp();
    pool = createTestPool();
    user = await registerUser(app);
  });
  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  // Trip to Tokyo, days 20 to 23. Test flights leave at 09:00 UTC, cost $500 and have 20 seats.
  const start = daysFromNow(20);
  const end = daysFromNow(23);

  const call = (method: 'GET' | 'POST', url: string, who: TestUser | null, payload?: object) =>
    app.inject({
      method,
      url: `/api${url}`,
      ...(who ? { headers: auth(who) } : {}),
      ...(payload ? { payload } : {}),
    });

  const newTrip = async (who = user): Promise<number> => {
    const res = await call('POST', '/trips', who, {
      destinationSlug: 'tokyo',
      name: 'Checkout trip',
      startDate: start,
      endDate: end,
    });
    expect(res.statusCode).toBe(201);
    return res.json().trip.id;
  };
  const tripCost = async (id: number): Promise<{ lines: CostLine[]; total: number }> =>
    (await call('GET', `/trips/${id}`, user)).json().cost;
  const seatsLeft = async (flightId: number): Promise<number> =>
    (
      await pool.query<{ seats_available: number }>(
        'select seats_available from flights where id = $1',
        [flightId],
      )
    ).rows[0]?.seats_available ?? -1;

  const roundTrip = async () => ({
    out: (await createTestFlight(pool, { origin: 'JFK', destination: 'NRT', days: 20 })).id,
    back: (await createTestFlight(pool, { origin: 'NRT', destination: 'JFK', days: 23 })).id,
  });
  const passengers = [
    { fullName: 'Ada Lovelace', dateOfBirth: '1990-05-10', seat: 'window', checkedBags: 1 },
    { fullName: 'Byron Lovelace', dateOfBirth: '2016-03-02', seat: 'aisle', checkedBags: 2 },
  ];

  describe('SCRUM-15: book flights', () => {
    it('looks up a single flight for the checkout', async () => {
      const { out } = await roundTrip();
      const res = await call('GET', `/flights/${out}`, null);
      expect(res.statusCode).toBe(200);
      expect(res.json().flight).toMatchObject({ id: out, origin: 'JFK', destination: 'NRT' });
      expect((await call('GET', '/flights/999999999', null)).statusCode).toBe(404);
    });

    it('quotes the fare, taxes and baggage for every leg without storing anything', async () => {
      const { out, back } = await roundTrip();
      const res = await call('POST', '/checkout/flights/quote', user, {
        flightIds: [out, back],
        passengers,
      });
      expect(res.statusCode).toBe(200);
      const { quote } = res.json();
      expect(quote.legs.map((l: { flight: { id: number } }) => l.flight.id)).toEqual([out, back]);
      // per leg: 2 x 500 = 1000 fare, 75 taxes, 35 + 80 bags = 1190
      expect(quote.legs[0].price).toEqual({
        passengers: 2,
        fare: 1000,
        taxes: 75,
        checkedBags: 3,
        baggage: 115,
        total: 1190,
      });
      expect(quote.total).toBe(2380);
      expect(await seatsLeft(out)).toBe(20);
    });

    it('books a round trip onto the trip with its passengers; the trip total includes it', async () => {
      const { out, back } = await roundTrip();
      const tripId = await newTrip();
      const res = await call('POST', '/checkout/flights', user, {
        tripId,
        flightIds: [out, back],
        passengers,
        total: 1, // ignored: prices come from the database
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().items).toHaveLength(2);
      expect(res.json().quote.total).toBe(2380);

      const cost = await tripCost(tripId);
      expect(cost.total).toBe(2380);
      expect(cost.lines.map((l) => l.detail)).toEqual([
        '2 passengers · 3 checked bags',
        '2 passengers · 3 checked bags',
      ]);

      const bookings = (await call('GET', '/bookings', user)).json().bookings as Array<{
        tripId: number;
        detail: string | null;
      }>;
      expect(bookings.filter((b) => b.tripId === tripId).map((b) => b.detail)).toEqual([
        '2 passengers · 3 checked bags',
        '2 passengers · 3 checked bags',
      ]);
    });

    it('takes the seats only when the trip is paid for', async () => {
      const { out, back } = await roundTrip();
      const tripId = await newTrip();
      await call('POST', '/checkout/flights', user, { tripId, flightIds: [out, back], passengers });
      expect(await seatsLeft(out)).toBe(20);

      const paid = await call('POST', `/trips/${tripId}/payment`, user, { method: 'credit_card' });
      expect(paid.statusCode).toBe(201);
      expect(paid.json().payment.amount).toBe(2380);
      expect([await seatsLeft(out), await seatsLeft(back)]).toEqual([18, 18]);
    });

    it('refuses payment if the seats were taken in the meantime, and charges nothing', async () => {
      const { out } = await roundTrip();
      const tripId = await newTrip();
      await call('POST', '/checkout/flights', user, { tripId, flightIds: [out], passengers });
      await pool.query('update flights set seats_available = 1 where id = $1', [out]);

      const res = await call('POST', `/trips/${tripId}/payment`, user, { method: 'paypal' });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('sold_out');
      expect((await call('GET', `/trips/${tripId}`, user)).json().payment).toBeNull();
      expect(await seatsLeft(out)).toBe(1);
    });

    it('rejects flights without enough seats, or cancelled flights', async () => {
      const { out } = await roundTrip();
      await pool.query('update flights set seats_available = 1 where id = $1', [out]);
      const full = await call('POST', '/checkout/flights/quote', user, {
        flightIds: [out],
        passengers,
      });
      expect(full.statusCode).toBe(409);
      expect(full.json().error.code).toBe('sold_out');

      const cancelled = await createTestFlight(pool, {
        origin: 'JFK',
        destination: 'NRT',
        days: 20,
        status: 'cancelled',
      });
      const res = await call('POST', '/checkout/flights/quote', user, {
        flightIds: [cancelled.id],
        passengers,
      });
      expect(res.statusCode).toBe(409);
    });

    it('rejects a return flight that does not fly back after the outbound', async () => {
      const { out } = await roundTrip();
      const elsewhere = await createTestFlight(pool, {
        origin: 'CDG',
        destination: 'JFK',
        days: 23,
      });
      const early = await createTestFlight(pool, { origin: 'NRT', destination: 'JFK', days: 19 });
      for (const back of [elsewhere.id, early.id]) {
        const res = await call('POST', '/checkout/flights/quote', user, {
          flightIds: [out, back],
          passengers,
        });
        expect(res.statusCode).toBe(422);
        expect(res.json().error.details).toHaveProperty('flightIds');
      }
    });

    it('validates passengers, naming the field that is wrong', async () => {
      const { out } = await roundTrip();
      const res = await call('POST', '/checkout/flights/quote', user, {
        flightIds: [out],
        passengers: [{ ...passengers[0], fullName: ' ' }],
      });
      expect(res.statusCode).toBe(422);
      expect(res.json().error.details).toHaveProperty(['passengers.0.fullName']);

      const childOnly = await call('POST', '/checkout/flights/quote', user, {
        flightIds: [out],
        passengers: [passengers[1]],
      });
      expect(childOnly.statusCode).toBe(422);
      expect(childOnly.json().error.details).toHaveProperty('passengers');
    });

    it('rejects flights outside the trip dates, and stores nothing', async () => {
      const late = await createTestFlight(pool, { origin: 'JFK', destination: 'NRT', days: 40 });
      const { back } = await roundTrip();
      const tripId = await newTrip();
      const res = await call('POST', '/checkout/flights', user, {
        tripId,
        flightIds: [late.id, back],
        passengers,
      });
      expect(res.statusCode).toBe(422);
      expect((await tripCost(tripId)).lines).toEqual([]);
    });

    it("cannot book onto a paid trip or another user's trip, and requires sign-in", async () => {
      const { out } = await roundTrip();
      const tripId = await newTrip();
      await call('POST', '/checkout/flights', user, { tripId, flightIds: [out], passengers });
      await call('POST', `/trips/${tripId}/payment`, user, { method: 'credit_card' });

      const { out: other } = await roundTrip();
      const locked = await call('POST', '/checkout/flights', user, {
        tripId,
        flightIds: [other],
        passengers,
      });
      expect(locked.statusCode).toBe(409);
      expect(locked.json().error.code).toBe('trip_paid');

      const stranger = await registerUser(app, 'Stranger');
      const theirs = await call('POST', '/checkout/flights', stranger, {
        tripId,
        flightIds: [other],
        passengers,
      });
      expect(theirs.statusCode).toBe(404);

      const anonymous = await call('POST', '/checkout/flights/quote', null, {
        flightIds: [other],
        passengers,
      });
      expect(anonymous.statusCode).toBe(401);
    });
  });

  describe('SCRUM-16: book hotels', () => {
    const checkIn = daysFromNow(20);
    const checkOut = daysFromNow(22); // 2 nights
    const guest = {
      fullName: 'Grace Hopper',
      email: 'grace@example.com',
      phone: '+1 555 010 2000',
    };

    const tokyoHotel = async () => {
      const res = await call(
        'GET',
        `/hotels?destination=tokyo&checkIn=${checkIn}&checkOut=${checkOut}`,
        null,
      );
      const hotel = res.json().hotels[0] as { id: number };
      const detail = await call(
        'GET',
        `/hotels/${hotel.id}?checkIn=${checkIn}&checkOut=${checkOut}`,
        null,
      );
      expect(detail.statusCode).toBe(200);
      return detail.json().hotel as {
        id: number;
        nights: number;
        rooms: Array<{ id: number; name: string; capacity: number; nightlyPrice: number }>;
      };
    };

    it('lists one hotel with all its room options priced for the stay', async () => {
      const hotel = await tokyoHotel();
      expect(hotel.nights).toBe(2);
      expect(hotel.rooms.map((r) => r.name).sort()).toEqual([
        'Deluxe King',
        'Double Queen',
        'Single King',
        'Suite',
      ]);
      const missing = await call(
        'GET',
        `/hotels/999999?checkIn=${checkIn}&checkOut=${checkOut}`,
        null,
      );
      expect(missing.statusCode).toBe(404);
    });

    it('quotes and books a room with guest details and requests; the trip total includes it', async () => {
      const hotel = await tokyoHotel();
      const suite = hotel.rooms.find((r) => r.name === 'Suite');
      if (!suite) throw new Error('no suite');
      const selection = {
        hotelId: hotel.id,
        roomTypeId: suite.id,
        checkIn,
        checkOut,
        rooms: 1,
        guests: 3,
        requests: ['late_check_out', 'high_floor'],
      };
      const quote = (await call('POST', '/checkout/hotels/quote', user, selection)).json().quote;
      const roomCents = Math.round(suite.nightlyPrice * 100) * 2;
      expect(quote.bill.roomSubtotal).toBe(roomCents / 100);
      expect(quote.bill.fees).toEqual([{ request: 'late_check_out', amount: 40 }]);

      const tripId = await newTrip();
      const res = await call('POST', '/checkout/hotels', user, {
        tripId,
        ...selection,
        guest,
        requestNote: 'Arriving late at night',
      });
      expect(res.statusCode).toBe(201);
      const cost = await tripCost(tripId);
      expect(cost.total).toBe(quote.bill.total);
      expect(cost.lines[0]?.detail).toBe('Suite × 1 · 2 nights');

      const { rows } = await pool.query(
        'select guest_name, guest_email, requests, request_note from hotel_bookings where item_id = $1',
        [res.json().item.id],
      );
      expect(rows[0]).toEqual({
        guest_name: 'Grace Hopper',
        guest_email: 'grace@example.com',
        requests: ['late_check_out', 'high_floor'],
        request_note: 'Arriving late at night',
      });
    });

    it('rejects a room from another hotel or more guests than the rooms sleep', async () => {
      const hotel = await tokyoHotel();
      const room = hotel.rooms.find((r) => r.name === 'Single King');
      if (!room) throw new Error('no single king');
      const base = {
        hotelId: hotel.id,
        roomTypeId: room.id,
        checkIn,
        checkOut,
        rooms: 1,
        guests: 2,
      };

      const wrongHotel = await call('POST', '/checkout/hotels/quote', user, {
        ...base,
        hotelId: hotel.id + 1,
      });
      expect(wrongHotel.statusCode).toBe(422);
      expect(wrongHotel.json().error.details).toHaveProperty('roomTypeId');

      const crowded = await call('POST', '/checkout/hotels/quote', user, { ...base, guests: 3 });
      expect(crowded.statusCode).toBe(422);
      expect(crowded.json().error.details).toHaveProperty('guests');
      const twoRooms = await call('POST', '/checkout/hotels/quote', user, {
        ...base,
        rooms: 2,
        guests: 3,
      });
      expect(twoRooms.statusCode).toBe(200);
    });

    it('validates the guest contact details and stores nothing on error', async () => {
      const hotel = await tokyoHotel();
      const tripId = await newTrip();
      const res = await call('POST', '/checkout/hotels', user, {
        tripId,
        hotelId: hotel.id,
        roomTypeId: hotel.rooms[0]?.id,
        checkIn,
        checkOut,
        rooms: 1,
        guests: 1,
        guest: { ...guest, email: 'not-an-email' },
      });
      expect(res.statusCode).toBe(422);
      expect(res.json().error.details).toHaveProperty('email');
      expect((await tripCost(tripId)).lines).toEqual([]);
    });
  });
});
