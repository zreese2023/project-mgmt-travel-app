import { applyRate, fromCents, toCents } from './money.js';

export const HOTEL_TAX_RATE = 0.12;

export interface PriceBreakdown {
  subtotal: number;
  taxes: number;
  total: number;
}

function assertPositiveInt(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(`${name} must be a positive integer`);
  }
}

/** Sample hotel total shown in search: nightly rate x nights x rooms plus 12% tax. */
export function hotelPrice(nightlyPrice: number, nights: number, rooms = 1): PriceBreakdown {
  assertPositiveInt(nights, 'nights');
  assertPositiveInt(rooms, 'rooms');
  const subtotalCents = toCents(nightlyPrice) * nights * rooms;
  const taxCents = applyRate(subtotalCents, HOTEL_TAX_RATE);
  return {
    subtotal: fromCents(subtotalCents),
    taxes: fromCents(taxCents),
    total: fromCents(subtotalCents + taxCents),
  };
}
