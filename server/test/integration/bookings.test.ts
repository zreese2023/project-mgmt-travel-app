import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  auth,
  createTestApp,
  daysFromNow,
  findFlights,
  findHotelRoom,
  registerUser,
  type TestUser,
} from '../helpers/app.js';

interface BookingJson {
  id: number;
  tripId: number;
  tripName: string;
  kind: 'flight' | 'hotel';
  title: string;
  startDate: string;
  endDate: string;
  nights: number | null;
  amount: number;
  status: 'planned' | 'confirmed';
  paidAt: string | null;
  isPast: boolean;
  canRemove: boolean;
  canChangeDates: boolean;
}

describe('SCRUM-26: manage bookings (real Postgres)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
  });

  const call = (
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    url: string,
    who: TestUser | null,
    payload?: object,
  ) =>
    app.inject({
      method,
      url: `/api${url}`,
      ...(who ? { headers: auth(who) } : {}),
      ...(payload ? { payload } : {}),
    });

  const newTrip = async (who: TestUser, name: string, startOffset: number, endOffset: number) => {
    const res = await call('POST', '/trips', who, {
      destinationSlug: 'tokyo',
      name,
      startDate: daysFromNow(startOffset),
      endDate: daysFromNow(endOffset),
    });
    expect(res.statusCode).toBe(201);
    return res.json().trip.id as number;
  };

  /** Adds the first JFK to NRT flight on `daysOut` to the trip; returns its fare. */
  const addFlight = async (who: TestUser, tripId: number, daysOut: number) => {
    const { outbound } = await findFlights(app, 'JFK', 'NRT', daysFromNow(daysOut));
    const flight = outbound[0] as { id: number; price: number };
    const res = await call('POST', `/trips/${tripId}/items`, who, {
      kind: 'flight',
      flightId: flight.id,
    });
    expect(res.statusCode).toBe(201);
    return { itemId: res.json().item.id as number, fare: flight.price };
  };

  /** Adds a hotel stay (cheapest room price is what the booking is priced at). */
  const addHotel = async (who: TestUser, tripId: number, inOffset: number, outOffset: number) => {
    const { hotelId, room } = await findHotelRoom(app, 'tokyo', daysFromNow(20), daysFromNow(22));
    const res = await call('POST', `/trips/${tripId}/items`, who, {
      kind: 'hotel',
      hotelId,
      checkIn: daysFromNow(inOffset),
      checkOut: daysFromNow(outOffset),
    });
    expect(res.statusCode).toBe(201);
    return { itemId: res.json().item.id as number, nightly: room.nightlyPrice };
  };

  const list = async (who: TestUser, query = ''): Promise<BookingJson[]> => {
    const res = await call('GET', `/bookings${query}`, who);
    expect(res.statusCode).toBe(200);
    return res.json().bookings;
  };

  const withTotal = (nightly: number, nights: number) => nightly * nights * 1.12;

  describe('view the list', () => {
    it('lists the flights and hotels of every trip with price and status, but not activities or notes', async () => {
      const who = await registerUser(app);
      const a = await newTrip(who, 'Alpha', 29, 36);
      const b = await newTrip(who, 'Bravo', 50, 55);
      const flight = await addFlight(who, a, 30);
      const hotel = await addHotel(who, b, 51, 54);
      await call('POST', `/trips/${a}/items`, who, {
        kind: 'note',
        title: 'Pack',
        day: daysFromNow(30),
      });

      const bookings = await list(who);
      expect(bookings).toHaveLength(2);
      const [first, second] = bookings as [BookingJson, BookingJson];
      expect(first).toMatchObject({
        id: flight.itemId,
        tripName: 'Alpha',
        kind: 'flight',
        status: 'planned',
        paidAt: null,
        isPast: false,
        canRemove: true,
        canChangeDates: false,
        nights: null,
      });
      expect(first.amount).toBeCloseTo(flight.fare, 2);
      expect(second).toMatchObject({
        id: hotel.itemId,
        tripName: 'Bravo',
        kind: 'hotel',
        nights: 3,
        startDate: daysFromNow(51),
        endDate: daysFromNow(54),
        canChangeDates: true,
      });
      expect(second.amount).toBeCloseTo(withTotal(hotel.nightly, 3), 1);
    });

    it('is empty for a user with no bookings', async () => {
      expect(await list(await registerUser(app))).toEqual([]);
    });

    it('sorts by date, price, trip, type and status in either direction', async () => {
      const who = await registerUser(app);
      const early = await newTrip(who, 'Zulu', 29, 33);
      const late = await newTrip(who, 'Alpha', 60, 65);
      await addFlight(who, early, 30);
      await addHotel(who, late, 61, 64);

      const ids = async (query: string) =>
        (await list(who, query)).map((b) => `${b.tripName}:${b.kind}`);
      expect(await ids('?sort=date')).toEqual(['Zulu:flight', 'Alpha:hotel']);
      expect(await ids('?sort=date&order=desc')).toEqual(['Alpha:hotel', 'Zulu:flight']);
      expect(await ids('?sort=trip')).toEqual(['Alpha:hotel', 'Zulu:flight']);
      expect(await ids('?sort=type')).toEqual(['Zulu:flight', 'Alpha:hotel']);
      const byPrice = (await list(who, '?sort=price')).map((b) => b.amount);
      expect(byPrice).toEqual([...byPrice].sort((x, y) => x - y));
      const byPriceDesc = (await list(who, '?sort=price&order=desc')).map((b) => b.amount);
      expect(byPriceDesc).toEqual([...byPriceDesc].sort((x, y) => y - x));
      expect((await list(who, '?sort=status')).length).toBe(2);
    });

    it('rejects an unknown sort, order or scope', async () => {
      const who = await registerUser(app);
      for (const query of ['?sort=colour', '?order=sideways', '?scope=ancient']) {
        expect((await call('GET', `/bookings${query}`, who)).statusCode, query).toBe(400);
      }
    });

    it('separates past bookings from upcoming ones', async () => {
      const who = await registerUser(app);
      const old = await newTrip(who, 'Old trip', -20, -15);
      const upcoming = await newTrip(who, 'New trip', 29, 36);
      await addHotel(who, old, -19, -17);
      await addFlight(who, upcoming, 30);

      expect((await list(who, '?scope=past')).map((b) => b.tripName)).toEqual(['Old trip']);
      expect((await list(who, '?scope=upcoming')).map((b) => b.tripName)).toEqual(['New trip']);
      expect((await list(who)).map((b) => b.tripName)).toEqual(['Old trip', 'New trip']);
      const [past] = await list(who, '?scope=past');
      expect(past).toMatchObject({ isPast: true, canChangeDates: false, canRemove: true });
    });

    it("never shows another user's bookings, and requires sign-in", async () => {
      const owner = await registerUser(app);
      const other = await registerUser(app);
      await addFlight(owner, await newTrip(owner, 'Private', 29, 36), 30);
      expect(await list(other)).toEqual([]);
      expect((await call('GET', '/bookings', null)).statusCode).toBe(401);
    });
  });

  describe('modify: change hotel dates', () => {
    it('changes the stay and reprices it for the new number of nights', async () => {
      const who = await registerUser(app);
      const tripId = await newTrip(who, 'Stay', 29, 40);
      const hotel = await addHotel(who, tripId, 31, 33); // 2 nights
      const before = (await list(who))[0] as BookingJson;
      expect(before.amount).toBeCloseTo(withTotal(hotel.nightly, 2), 1);

      const res = await call('PATCH', `/bookings/${hotel.itemId}`, who, {
        checkIn: daysFromNow(32),
        checkOut: daysFromNow(37), // 5 nights
      });
      expect(res.statusCode).toBe(200);
      const { booking } = res.json() as { booking: BookingJson };
      expect(booking).toMatchObject({
        id: hotel.itemId,
        startDate: daysFromNow(32),
        endDate: daysFromNow(37),
        nights: 5,
        status: 'planned',
      });
      expect(booking.amount).toBeCloseTo(withTotal(hotel.nightly, 5), 1);
      expect((await list(who))[0]).toMatchObject({ nights: 5 });
    });

    it('rejects bad dates: check-out not after check-in, in the past, too long, or outside the trip', async () => {
      const who = await registerUser(app);
      const tripId = await newTrip(who, 'Strict', 29, 40);
      const { itemId } = await addHotel(who, tripId, 31, 33);
      const patch = (checkIn: number, checkOut: number) =>
        call('PATCH', `/bookings/${itemId}`, who, {
          checkIn: daysFromNow(checkIn),
          checkOut: daysFromNow(checkOut),
        });
      expect((await patch(33, 33)).statusCode).toBe(422);
      expect((await patch(34, 33)).statusCode).toBe(422);
      expect((await patch(-3, 2)).statusCode).toBe(422); // check-in in the past
      expect((await patch(31, 70)).statusCode).toBe(422); // more than 30 nights
      expect((await patch(50, 52)).statusCode).toBe(422); // check-in outside the trip dates
      expect(
        (await call('PATCH', `/bookings/${itemId}`, who, { checkIn: 'x', checkOut: 'y' }))
          .statusCode,
      ).toBe(422);
      expect(
        (await call('PATCH', `/bookings/${itemId}`, who, { checkIn: daysFromNow(31) })).statusCode,
      ).toBe(400);
      expect((await list(who))[0]).toMatchObject({
        startDate: daysFromNow(31),
        endDate: daysFromNow(33),
      });
    });

    it('does not let a flight be re-dated (remove it and add another instead)', async () => {
      const who = await registerUser(app);
      const flight = await addFlight(who, await newTrip(who, 'Fly', 29, 36), 30);
      const res = await call('PATCH', `/bookings/${flight.itemId}`, who, {
        checkIn: daysFromNow(31),
        checkOut: daysFromNow(32),
      });
      expect(res.statusCode).toBe(422);
      expect(res.json().error.message).toMatch(/Only hotel stays/);
    });

    it("hides other users' bookings (404) and unknown ids, and needs sign-in", async () => {
      const owner = await registerUser(app);
      const other = await registerUser(app);
      const { itemId } = await addHotel(owner, await newTrip(owner, 'Mine', 29, 40), 31, 33);
      const dates = { checkIn: daysFromNow(32), checkOut: daysFromNow(34) };
      expect((await call('PATCH', `/bookings/${itemId}`, other, dates)).statusCode).toBe(404);
      expect((await call('PATCH', '/bookings/999999999', owner, dates)).statusCode).toBe(404);
      expect((await call('PATCH', `/bookings/${itemId}`, null, dates)).statusCode).toBe(401);
    });
  });

  describe('remove a planned booking', () => {
    it('removes it from the list and from the trip itinerary', async () => {
      const who = await registerUser(app);
      const tripId = await newTrip(who, 'Trim', 29, 36);
      const flight = await addFlight(who, tripId, 30);
      expect((await call('DELETE', `/bookings/${flight.itemId}`, who)).statusCode).toBe(204);
      expect(await list(who)).toEqual([]);
      const detail = (await call('GET', `/trips/${tripId}`, who)).json();
      const items = detail.days.flatMap((d: { items: unknown[] }) => d.items);
      expect(items).toEqual([]);
      expect((await call('DELETE', `/bookings/${flight.itemId}`, who)).statusCode).toBe(404);
    });

    it("cannot remove someone else's booking", async () => {
      const owner = await registerUser(app);
      const other = await registerUser(app);
      const flight = await addFlight(owner, await newTrip(owner, 'Keep', 29, 36), 30);
      expect((await call('DELETE', `/bookings/${flight.itemId}`, other)).statusCode).toBe(404);
      expect(await list(owner)).toHaveLength(1);
    });
  });

  describe('paid trips are confirmed and locked', () => {
    it('shows paid bookings as confirmed and refuses to change or remove them', async () => {
      const who = await registerUser(app);
      const tripId = await newTrip(who, 'Paid', 29, 40);
      const hotel = await addHotel(who, tripId, 31, 33);
      const pay = await call('POST', `/trips/${tripId}/payment`, who, { method: 'credit_card' });
      expect(pay.statusCode).toBe(201);

      const [booking] = await list(who);
      expect(booking).toMatchObject({
        status: 'confirmed',
        canRemove: false,
        canChangeDates: false,
      });
      expect(booking?.paidAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

      const change = await call('PATCH', `/bookings/${hotel.itemId}`, who, {
        checkIn: daysFromNow(32),
        checkOut: daysFromNow(35),
      });
      expect(change.statusCode).toBe(409);
      expect(change.json().error.code).toBe('trip_paid');
      expect((await call('DELETE', `/bookings/${hotel.itemId}`, who)).statusCode).toBe(409);
      expect((await list(who))[0]).toMatchObject({ endDate: daysFromNow(33) }); // unchanged
    });
  });
});
