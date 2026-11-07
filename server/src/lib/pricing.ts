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

// SCRUM-15: flight fares. Taxes and fees apply to the fare; baggage fees are charged as is.
export const FLIGHT_TAX_RATE = 0.075;
export const MAX_CHECKED_BAGS = 2;
/** Fee for the 1st and 2nd checked bag, per passenger per flight. Carry-on is included. */
export const CHECKED_BAG_FEES = [35, 45] as const;

export interface FlightLegPrice {
  passengers: number;
  fare: number;
  taxes: number;
  checkedBags: number;
  baggage: number;
  total: number;
}

export function baggageFee(checkedBags: number): number {
  if (!Number.isInteger(checkedBags) || checkedBags < 0 || checkedBags > MAX_CHECKED_BAGS) {
    throw new RangeError(`checkedBags must be an integer from 0 to ${MAX_CHECKED_BAGS}`);
  }
  return CHECKED_BAG_FEES.slice(0, checkedBags).reduce((sum, fee) => sum + fee, 0);
}

/** One flight for everyone on the booking: fare x passengers, 7.5% taxes and fees, plus bags. */
export function flightLegPrice(
  farePerPassenger: number,
  passengers: readonly { checkedBags: number }[],
): FlightLegPrice {
  assertPositiveInt(passengers.length, 'passengers');
  const fareCents = toCents(farePerPassenger) * passengers.length;
  const taxCents = applyRate(fareCents, FLIGHT_TAX_RATE);
  const baggageCents = passengers.reduce((sum, p) => sum + toCents(baggageFee(p.checkedBags)), 0);
  return {
    passengers: passengers.length,
    fare: fromCents(fareCents),
    taxes: fromCents(taxCents),
    checkedBags: passengers.reduce((sum, p) => sum + p.checkedBags, 0),
    baggage: fromCents(baggageCents),
    total: fromCents(fareCents + taxCents + baggageCents),
  };
}

// SCRUM-16: hotel special requests. Most are free and subject to availability.
export const ROOM_REQUESTS = [
  'early_check_in',
  'late_check_out',
  'high_floor',
  'quiet_room',
  'accessible_room',
  'extra_bed',
  'crib',
] as const;
export type RoomRequest = (typeof ROOM_REQUESTS)[number];

/** Requests with a fee: `perNight` fees are charged per room per night, others once per stay. */
export const ROOM_REQUEST_FEES: Partial<
  Record<RoomRequest, { amount: number; perNight: boolean }>
> = {
  extra_bed: { amount: 25, perNight: true },
  late_check_out: { amount: 40, perNight: false },
};

export interface HotelBill {
  nights: number;
  rooms: number;
  nightlyPrice: number;
  roomSubtotal: number;
  fees: Array<{ request: RoomRequest; amount: number }>;
  subtotal: number;
  taxes: number;
  total: number;
}

/** The room, any paid requests, and 12% tax on both. */
export function hotelBill(
  nightlyPrice: number,
  nights: number,
  rooms: number,
  requests: readonly RoomRequest[] = [],
): HotelBill {
  const room = hotelPrice(nightlyPrice, nights, rooms);
  const fees: HotelBill['fees'] = [];
  for (const request of new Set(requests)) {
    const fee = ROOM_REQUEST_FEES[request];
    if (fee) {
      const cents = toCents(fee.amount) * (fee.perNight ? nights * rooms : 1);
      fees.push({ request, amount: fromCents(cents) });
    }
  }
  const subtotalCents =
    toCents(room.subtotal) + fees.reduce((sum, f) => sum + toCents(f.amount), 0);
  const taxCents = applyRate(subtotalCents, HOTEL_TAX_RATE);
  return {
    nights,
    rooms,
    nightlyPrice,
    roomSubtotal: room.subtotal,
    fees,
    subtotal: fromCents(subtotalCents),
    taxes: fromCents(taxCents),
    total: fromCents(subtotalCents + taxCents),
  };
}
