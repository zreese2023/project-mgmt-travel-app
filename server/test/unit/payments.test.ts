import { describe, expect, it } from 'vitest';
import { hotelStayNote, parseCheckOut } from '../../src/lib/itinerary.js';
import { priceTrip, type CostRow } from '../../src/lib/payments.js';

const row = (overrides: Partial<CostRow>): CostRow => ({
  item_id: 1,
  kind: 'flight',
  title: 'Flight',
  day: '2026-11-05',
  notes: null,
  flight_price: null,
  nightly_price: null,
  ...overrides,
});

describe('hotel check-out note', () => {
  it('round-trips the check-out date and ignores other notes', () => {
    expect(parseCheckOut(hotelStayNote('2026-11-08'))).toBe('2026-11-08');
    expect(parseCheckOut('Bring Suica')).toBeNull();
    expect(parseCheckOut(null)).toBeNull();
  });
});

describe('SCRUM-25: trip price', () => {
  it('charges each flight for one passenger and each stay at the cheapest room plus tax', () => {
    const cost = priceTrip([
      row({ item_id: 1, title: 'Out', flight_price: 512.4 }),
      row({
        item_id: 2,
        kind: 'hotel',
        title: 'Stay',
        notes: hotelStayNote('2026-11-08'),
        nightly_price: 100,
      }),
      row({ item_id: 3, title: 'Back', flight_price: 0.2 }),
    ]);
    expect(cost.lines).toEqual([
      { itemId: 1, kind: 'flight', title: 'Out', amount: 512.4 },
      { itemId: 2, kind: 'hotel', title: 'Stay', amount: 336 }, // 3 nights x 100 + 12%
      { itemId: 3, kind: 'flight', title: 'Back', amount: 0.2 },
    ]);
    expect(cost.total).toBe(848.6);
  });

  it('prices a stay with an unreadable check-out as one night', () => {
    const cost = priceTrip([row({ kind: 'hotel', notes: 'edited', nightly_price: 100 })]);
    expect(cost.total).toBe(112);
  });

  it('is zero for a trip with nothing priced', () => {
    expect(priceTrip([])).toEqual({ lines: [], total: 0 });
  });
});

describe('SCRUM-15/16: trip price for items booked through checkout', () => {
  it('prices a flight for its passengers with taxes and bags', () => {
    const cost = priceTrip([
      row({ flight_price: 500, passengers: [{ checkedBags: 1 }, { checkedBags: 0 }] }),
    ]);
    expect(cost.lines[0]).toMatchObject({ amount: 1110, detail: '2 passengers · 1 checked bag' });
  });

  it('says carry-on only when nobody checks a bag', () => {
    const cost = priceTrip([row({ flight_price: 500, passengers: [{ checkedBags: 0 }] })]);
    expect(cost.lines[0]).toMatchObject({ amount: 537.5, detail: '1 passenger · carry-on only' });
  });

  it('prices a stay in the booked room, for every room, with paid requests', () => {
    const cost = priceTrip([
      row({
        kind: 'hotel',
        notes: hotelStayNote('2026-11-07'),
        nightly_price: 200,
        rooms: 2,
        room_name: 'Suite',
        room_requests: ['late_check_out', 'not-a-request'],
      }),
    ]);
    // 2 nights x 2 rooms x 200 = 800, + 40 late check-out = 840, + 12% = 940.80
    expect(cost.lines[0]).toMatchObject({ amount: 940.8, detail: 'Suite × 2 · 2 nights' });
  });

  it('leaves quick-added items without a detail', () => {
    expect(priceTrip([row({ flight_price: 100 })]).lines[0]).not.toHaveProperty('detail');
  });
});
