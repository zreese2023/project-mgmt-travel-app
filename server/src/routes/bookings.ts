import type { FastifyInstance } from 'fastify';
import {
  changeHotelStay,
  listBookings,
  removeBooking,
  type BookingScope,
  type BookingSort,
  type SortOrder,
} from '../lib/bookings.js';

const itemParam = { type: 'object', properties: { itemId: { type: 'integer' } } } as const;

export async function bookingRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', app.authenticate);

  // SCRUM-26: a sortable list of the user's flights and hotels across all trips
  app.get<{ Querystring: { sort?: BookingSort; order?: SortOrder; scope?: BookingScope } }>(
    '/bookings',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            sort: { type: 'string', enum: ['date', 'price', 'trip', 'type', 'status'] },
            order: { type: 'string', enum: ['asc', 'desc'] },
            scope: { type: 'string', enum: ['all', 'upcoming', 'past'] },
          },
        },
      },
    },
    async (request) => ({
      bookings: await listBookings(app.pg.pool, request.user.id, request.query),
    }),
  );

  // Modify: change the dates of a planned hotel stay (repriced automatically)
  app.patch<{ Params: { itemId: number }; Body: { checkIn: string; checkOut: string } }>(
    '/bookings/:itemId',
    {
      schema: {
        params: itemParam,
        body: {
          type: 'object',
          required: ['checkIn', 'checkOut'],
          additionalProperties: false,
          properties: {
            checkIn: { type: 'string', maxLength: 10 },
            checkOut: { type: 'string', maxLength: 10 },
          },
        },
      },
    },
    async (request) => ({
      booking: await changeHotelStay(
        app.pg.pool,
        request.user.id,
        request.params.itemId,
        request.body,
      ),
    }),
  );

  app.delete<{ Params: { itemId: number } }>(
    '/bookings/:itemId',
    { schema: { params: itemParam } },
    async (request, reply) => {
      await removeBooking(app.pg.pool, request.user.id, request.params.itemId);
      return reply.status(204).send();
    },
  );
}
