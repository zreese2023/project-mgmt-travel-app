import type { FastifyInstance } from 'fastify';
import { parseList } from '../lib/destinations.js';
import { searchFlights, searchWindow, type FlightSort } from '../lib/flights.js';
import { searchHotels, type HotelSort } from '../lib/hotels.js';

interface FlightQuery {
  origin: string;
  destination: string;
  depart: string;
  return?: string;
  maxPrice?: number;
  passengers?: number;
  sort?: FlightSort;
}

interface HotelQuery {
  destination?: string;
  checkIn: string;
  checkOut: string;
  guests?: number;
  minPrice?: number;
  maxPrice?: number;
  minRating?: number;
  amenity?: string;
  sort?: HotelSort;
}

export async function travelRoutes(app: FastifyInstance): Promise<void> {
  app.get('/airports', async () => {
    const { rows } = await app.pg.query<{
      code: string;
      name: string;
      city: string;
      country: string;
      is_origin: boolean;
    }>('select code, name, city, country, is_origin from airports order by city');
    return {
      airports: rows.map((r) => ({
        code: r.code,
        name: r.name,
        city: r.city,
        country: r.country,
        isOrigin: r.is_origin,
      })),
      searchWindow: searchWindow(),
    };
  });

  // SCRUM-21
  app.get<{ Querystring: FlightQuery }>(
    '/flights',
    {
      schema: {
        querystring: {
          type: 'object',
          required: ['origin', 'destination', 'depart'],
          properties: {
            origin: { type: 'string', maxLength: 3 },
            destination: { type: 'string', maxLength: 3 },
            depart: { type: 'string', maxLength: 10 },
            return: { type: 'string', maxLength: 10 },
            maxPrice: { type: 'number', minimum: 0 },
            passengers: { type: 'integer', minimum: 1, maximum: 9 },
            sort: { type: 'string', enum: ['price', 'duration', 'departure'] },
          },
        },
      },
    },
    async (request) => {
      const q = request.query;
      const result = await searchFlights(app.pg.pool, {
        origin: q.origin.toUpperCase(),
        destination: q.destination.toUpperCase(),
        depart: q.depart,
        returnDate: q.return,
        maxPrice: q.maxPrice,
        passengers: q.passengers,
        sort: q.sort,
      });
      return { ...result, note: 'Sample flight data. Times are shown in UTC.' };
    },
  );

  // SCRUM-23
  app.get<{ Querystring: HotelQuery }>(
    '/hotels',
    {
      schema: {
        querystring: {
          type: 'object',
          required: ['destination', 'checkIn', 'checkOut'],
          properties: {
            destination: { type: 'string', maxLength: 80 },
            checkIn: { type: 'string', maxLength: 10 },
            checkOut: { type: 'string', maxLength: 10 },
            guests: { type: 'integer', minimum: 1, maximum: 8 },
            minPrice: { type: 'number', minimum: 0 },
            maxPrice: { type: 'number', minimum: 0 },
            minRating: { type: 'number', minimum: 0, maximum: 5 },
            amenity: { type: 'string', maxLength: 200 },
            sort: { type: 'string', enum: ['price', 'rating'] },
          },
        },
      },
    },
    async (request) => {
      const q = request.query;
      const hotels = await searchHotels(app.pg.pool, {
        destination: q.destination,
        checkIn: q.checkIn,
        checkOut: q.checkOut,
        guests: q.guests,
        minPrice: q.minPrice,
        maxPrice: q.maxPrice,
        minRating: q.minRating,
        amenities: parseList(q.amenity),
        sort: q.sort,
      });
      return { hotels, note: 'Sample hotel data and prices.' };
    },
  );
}
