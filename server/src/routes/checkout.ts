import type { FastifyInstance } from 'fastify';
import {
  bookFlights,
  bookHotel,
  MAX_PASSENGERS,
  MAX_ROOMS,
  quoteFlights,
  quoteHotel,
  SEAT_PREFERENCES,
  type FlightCheckoutInput,
  type GuestContact,
  type HotelCheckoutInput,
} from '../lib/checkout.js';
import { MAX_CHECKED_BAGS, ROOM_REQUESTS } from '../lib/pricing.js';

const flightProperties = {
  flightIds: {
    type: 'array',
    minItems: 1,
    maxItems: 2,
    items: { type: 'integer' },
  },
  passengers: {
    type: 'array',
    minItems: 1,
    maxItems: MAX_PASSENGERS,
    items: {
      type: 'object',
      required: ['fullName', 'dateOfBirth', 'seat', 'checkedBags'],
      additionalProperties: false,
      properties: {
        fullName: { type: 'string', maxLength: 200 },
        dateOfBirth: { type: 'string', maxLength: 10 },
        seat: { type: 'string', enum: [...SEAT_PREFERENCES] },
        checkedBags: { type: 'integer', minimum: 0, maximum: MAX_CHECKED_BAGS },
      },
    },
  },
} as const;

const hotelProperties = {
  hotelId: { type: 'integer' },
  roomTypeId: { type: 'integer' },
  checkIn: { type: 'string', maxLength: 10 },
  checkOut: { type: 'string', maxLength: 10 },
  rooms: { type: 'integer', minimum: 1, maximum: MAX_ROOMS },
  guests: { type: 'integer', minimum: 1 },
  requests: {
    type: 'array',
    maxItems: ROOM_REQUESTS.length,
    items: { type: 'string', enum: [...ROOM_REQUESTS] },
  },
} as const;
const hotelRequired = ['hotelId', 'roomTypeId', 'checkIn', 'checkOut', 'rooms', 'guests'];

type HotelBookingBody = HotelCheckoutInput & {
  tripId: number;
  guest: GuestContact;
  requestNote?: string;
};

export async function checkoutRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', app.authenticate);

  // SCRUM-15: price the selected flights for the passengers (fare summary and baggage fees)
  app.post<{ Body: FlightCheckoutInput }>(
    '/checkout/flights/quote',
    {
      schema: {
        body: {
          type: 'object',
          required: ['flightIds', 'passengers'],
          additionalProperties: false,
          properties: flightProperties,
        },
      },
    },
    async (request) => ({ quote: await quoteFlights(app.pg.pool, request.body) }),
  );

  // SCRUM-15: book the flights onto a trip; the trip total then goes to payment
  app.post<{ Body: FlightCheckoutInput & { tripId: number } }>(
    '/checkout/flights',
    {
      schema: {
        body: {
          type: 'object',
          required: ['tripId', 'flightIds', 'passengers'],
          additionalProperties: false,
          properties: { tripId: { type: 'integer' }, ...flightProperties },
        },
      },
    },
    async (request, reply) => {
      const { tripId, ...input } = request.body;
      const booked = await bookFlights(app.pg.pool, request.user.id, tripId, input);
      return reply.status(201).send(booked);
    },
  );

  // SCRUM-16: price a room for the stay, with any special requests
  app.post<{ Body: HotelCheckoutInput }>(
    '/checkout/hotels/quote',
    {
      schema: {
        body: {
          type: 'object',
          required: hotelRequired,
          additionalProperties: false,
          properties: hotelProperties,
        },
      },
    },
    async (request) => ({ quote: await quoteHotel(app.pg.pool, request.body) }),
  );

  // SCRUM-16: book the room onto a trip; the trip total then goes to payment
  app.post<{ Body: HotelBookingBody }>(
    '/checkout/hotels',
    {
      schema: {
        body: {
          type: 'object',
          required: ['tripId', 'guest', ...hotelRequired],
          additionalProperties: false,
          properties: {
            tripId: { type: 'integer' },
            ...hotelProperties,
            guest: {
              type: 'object',
              required: ['fullName', 'email', 'phone'],
              additionalProperties: false,
              properties: {
                fullName: { type: 'string', maxLength: 200 },
                email: { type: 'string', maxLength: 254 },
                phone: { type: 'string', maxLength: 30 },
              },
            },
            requestNote: { type: 'string', maxLength: 500 },
          },
        },
      },
    },
    async (request, reply) => {
      const { tripId, ...input } = request.body;
      const booked = await bookHotel(app.pg.pool, request.user.id, tripId, input);
      return reply.status(201).send(booked);
    },
  );
}
