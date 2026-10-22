import { isIsoDate, nightsBetween, todayIso } from './dates.js';
import type { Queryable } from './db.js';
import { badRequest } from './errors.js';
import { hotelPrice, type PriceBreakdown } from './pricing.js';

export type HotelSort = 'price' | 'rating';
export const MAX_NIGHTS = 30;
export const MAX_GUESTS_PER_ROOM = 8;

export interface HotelSearchParams {
  destination?: string | undefined;
  checkIn: string;
  checkOut: string;
  guests?: number | undefined;
  minPrice?: number | undefined;
  maxPrice?: number | undefined;
  minRating?: number | undefined;
  amenities?: string[] | undefined;
  sort?: HotelSort | undefined;
}

export interface RoomOption {
  id: number;
  name: string;
  capacity: number;
  nightlyPrice: number;
  price: PriceBreakdown;
}

export interface HotelResult {
  id: number;
  name: string;
  destinationSlug: string;
  destinationName: string;
  rating: number;
  amenities: string[];
  address: string;
  imageUrl: string;
  nights: number;
  fromNightly: number;
  fromTotal: number;
  rooms: RoomOption[];
}

export interface HotelRoomRow {
  hotel_id: number;
  hotel_name: string;
  rating: number;
  amenities: string[];
  address: string;
  image_url: string;
  destination_slug: string;
  destination_name: string;
  room_type_id: number;
  room_name: string;
  capacity: number;
  nightly_price: number;
}

/** Throws a 422 AppError when the stay dates or guest count are not valid. */
export function validateStay(
  checkIn: string,
  checkOut: string,
  guests: number | undefined,
  today: string = todayIso(),
): number {
  const details: Record<string, string> = {};
  let nights = 0;
  if (!isIsoDate(checkIn)) details.checkIn = 'Enter a check-in date (YYYY-MM-DD)';
  else if (checkIn < today) details.checkIn = 'Check-in cannot be in the past';
  if (!isIsoDate(checkOut)) details.checkOut = 'Enter a check-out date (YYYY-MM-DD)';
  if (!details.checkIn && !details.checkOut) {
    nights = nightsBetween(checkIn, checkOut);
    if (nights < 1) details.checkOut = 'Check-out must be after check-in';
    else if (nights > MAX_NIGHTS) details.checkOut = `Stays are limited to ${MAX_NIGHTS} nights`;
  }
  if (
    guests !== undefined &&
    (!Number.isInteger(guests) || guests < 1 || guests > MAX_GUESTS_PER_ROOM)
  ) {
    details.guests = `Guests must be between 1 and ${MAX_GUESTS_PER_ROOM}`;
  }
  if (Object.keys(details).length > 0) throw badRequest('Invalid hotel search', details);
  return nights;
}

export function buildHotelQuery(params: HotelSearchParams): { text: string; values: unknown[] } {
  const values: unknown[] = [];
  const where: string[] = [];
  const param = (value: unknown): string => {
    values.push(value);
    return `$${values.length}`;
  };

  if (params.destination) where.push(`d.slug = ${param(params.destination)}`);
  if (params.guests !== undefined) where.push(`r.capacity >= ${param(params.guests)}`);
  if (params.minPrice !== undefined) where.push(`r.nightly_price >= ${param(params.minPrice)}`);
  if (params.maxPrice !== undefined) where.push(`r.nightly_price <= ${param(params.maxPrice)}`);
  if (params.minRating !== undefined) where.push(`h.rating >= ${param(params.minRating)}`);
  if (params.amenities?.length) {
    where.push(`h.amenities @> ${param(params.amenities.map((a) => a.toLowerCase()))}::text[]`);
  }

  const text =
    `select h.id as hotel_id, h.name as hotel_name, h.rating, h.amenities, h.address, h.image_url,
            d.slug as destination_slug, d.name as destination_name,
            r.id as room_type_id, r.name as room_name, r.capacity, r.nightly_price
     from hotels h
     join destinations d on d.id = h.destination_id
     join room_types r on r.hotel_id = h.id` +
    (where.length ? ` where ${where.join(' and ')}` : '') +
    ' order by h.id, r.nightly_price';
  return { text, values };
}

/** Groups room rows into hotels and prices each room for the stay (sample prices). */
export function groupHotelRows(
  rows: HotelRoomRow[],
  nights: number,
  sort: HotelSort = 'price',
): HotelResult[] {
  const byHotel = new Map<number, HotelResult>();
  for (const row of rows) {
    let hotel = byHotel.get(row.hotel_id);
    if (!hotel) {
      hotel = {
        id: row.hotel_id,
        name: row.hotel_name,
        destinationSlug: row.destination_slug,
        destinationName: row.destination_name,
        rating: row.rating,
        amenities: row.amenities,
        address: row.address,
        imageUrl: row.image_url,
        nights,
        fromNightly: row.nightly_price,
        fromTotal: 0,
        rooms: [],
      };
      byHotel.set(row.hotel_id, hotel);
    }
    hotel.rooms.push({
      id: row.room_type_id,
      name: row.room_name,
      capacity: row.capacity,
      nightlyPrice: row.nightly_price,
      price: hotelPrice(row.nightly_price, nights),
    });
  }
  const hotels = [...byHotel.values()];
  for (const hotel of hotels) {
    hotel.fromNightly = Math.min(...hotel.rooms.map((r) => r.nightlyPrice));
    hotel.fromTotal = Math.min(...hotel.rooms.map((r) => r.price.total));
  }
  return hotels.sort((a, b) =>
    sort === 'rating'
      ? b.rating - a.rating || a.fromNightly - b.fromNightly
      : a.fromNightly - b.fromNightly,
  );
}

export async function searchHotels(
  db: Queryable,
  params: HotelSearchParams,
  today: string = todayIso(),
): Promise<HotelResult[]> {
  const nights = validateStay(params.checkIn, params.checkOut, params.guests, today);
  const { text, values } = buildHotelQuery(params);
  const { rows } = await db.query<HotelRoomRow>(text, values);
  return groupHotelRows(rows, nights, params.sort);
}
