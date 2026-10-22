import { describe, expect, it } from 'vitest';
import { applyRate, fromCents, toCents } from '../../src/lib/money.js';
import { hotelPrice } from '../../src/lib/pricing.js';

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
