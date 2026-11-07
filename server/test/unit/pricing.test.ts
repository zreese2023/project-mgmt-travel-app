import { describe, expect, it } from 'vitest';
import { applyRate, fromCents, toCents } from '../../src/lib/money.js';
import { baggageFee, flightLegPrice, hotelBill, hotelPrice } from '../../src/lib/pricing.js';

describe('money helpers', () => {
  it('converts to and from cents without float drift', () => {
    expect(toCents(19.99)).toBe(1999);
    expect(toCents(0.1 + 0.2)).toBe(30);
    expect(fromCents(1999)).toBe(19.99);
  });

  it('rounds rates half up, even when float noise sits just under .5', () => {
    expect(applyRate(1000, 0.075)).toBe(75);
    expect(applyRate(1001, 0.075)).toBe(75);
    expect(applyRate(1007, 0.075)).toBe(76);
    expect(applyRate(150100, 0.075)).toBe(11258); // 11257.5 exactly
  });
});

describe('SCRUM-23: hotel price for a stay (sample data)', () => {
  it('is nightly rate x nights x rooms plus 12% tax', () => {
    expect(hotelPrice(100, 3)).toEqual({ subtotal: 300, taxes: 36, total: 336 });
    expect(hotelPrice(99.99, 2, 2)).toEqual({ subtotal: 399.96, taxes: 48, total: 447.96 });
  });

  it('rejects zero nights or rooms', () => {
    expect(() => hotelPrice(100, 0)).toThrow(RangeError);
    expect(() => hotelPrice(100, 1, 0)).toThrow(RangeError);
    expect(() => hotelPrice(100, 1.5)).toThrow(RangeError);
  });
});

describe('SCRUM-15: flight fare summary and baggage fees', () => {
  const pax = (...bags: number[]) => bags.map((checkedBags) => ({ checkedBags }));

  it('charges $35 for the first checked bag and $45 for the second; carry-on is free', () => {
    expect(baggageFee(0)).toBe(0);
    expect(baggageFee(1)).toBe(35);
    expect(baggageFee(2)).toBe(80);
    expect(() => baggageFee(3)).toThrow(RangeError);
    expect(() => baggageFee(-1)).toThrow(RangeError);
  });

  it('is fare x passengers plus 7.5% taxes on the fare, plus bags (untaxed)', () => {
    expect(flightLegPrice(500, pax(1, 2))).toEqual({
      passengers: 2,
      fare: 1000,
      taxes: 75,
      checkedBags: 3,
      baggage: 115,
      total: 1190,
    });
  });

  it('rounds taxes to the cent', () => {
    // 3 x 333.33 = 999.99; 7.5% = 74.99925 -> 75.00
    expect(flightLegPrice(333.33, pax(0, 0, 0))).toMatchObject({ taxes: 75, total: 1074.99 });
  });

  it('needs at least one passenger', () => {
    expect(() => flightLegPrice(500, [])).toThrow(RangeError);
  });
});

describe('SCRUM-16: hotel bill with rooms and special requests', () => {
  it('matches the search price when there are no paid requests', () => {
    const bill = hotelBill(100, 3, 1, ['high_floor', 'crib']);
    expect(bill).toMatchObject({ subtotal: 300, taxes: 36, total: 336, fees: [] });
    expect(bill.total).toBe(hotelPrice(100, 3).total);
  });

  it('charges an extra bed per room per night and late check-out once, all taxed at 12%', () => {
    const bill = hotelBill(100, 3, 2, ['extra_bed', 'late_check_out', 'extra_bed']);
    expect(bill.roomSubtotal).toBe(600);
    expect(bill.fees).toEqual([
      { request: 'extra_bed', amount: 150 }, // 25 x 3 nights x 2 rooms, counted once
      { request: 'late_check_out', amount: 40 },
    ]);
    expect(bill).toMatchObject({ subtotal: 790, taxes: 94.8, total: 884.8 });
  });
});
