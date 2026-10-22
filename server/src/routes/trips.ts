import type { FastifyInstance } from 'fastify';
import {
  addItem,
  createTrip,
  deleteTrip,
  getTripDetail,
  listTrips,
  parseNewItem,
  removeItem,
  type NewItemBody,
} from '../lib/trips.js';

const idParam = { type: 'integer' } as const;

export async function tripRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', app.authenticate);

  // SCRUM-31
  app.get('/trips', async (request) => ({ trips: await listTrips(app.pg.pool, request.user.id) }));

  app.post<{ Body: { destinationSlug: string; name: string; startDate: string; endDate: string } }>(
    '/trips',
    {
      schema: {
        body: {
          type: 'object',
          required: ['destinationSlug', 'name', 'startDate', 'endDate'],
          additionalProperties: false,
          properties: {
            destinationSlug: { type: 'string', maxLength: 80 },
            name: { type: 'string', maxLength: 100 },
            startDate: { type: 'string', maxLength: 10 },
            endDate: { type: 'string', maxLength: 10 },
          },
        },
      },
    },
    async (request, reply) => {
      const trip = await createTrip(app.pg.pool, request.user.id, request.body);
      return reply.status(201).send({ trip });
    },
  );

  app.get<{ Params: { id: number } }>(
    '/trips/:id',
    { schema: { params: { type: 'object', properties: { id: idParam } } } },
    async (request) => getTripDetail(app.pg.pool, request.user.id, request.params.id),
  );

  app.delete<{ Params: { id: number } }>(
    '/trips/:id',
    { schema: { params: { type: 'object', properties: { id: idParam } } } },
    async (request, reply) => {
      await deleteTrip(app.pg.pool, request.user.id, request.params.id);
      return reply.status(204).send();
    },
  );

  // SCRUM-31/32: add and remove itinerary items
  app.post<{ Params: { id: number }; Body: NewItemBody }>(
    '/trips/:id/items',
    {
      schema: {
        params: { type: 'object', properties: { id: idParam } },
        body: {
          type: 'object',
          required: ['kind'],
          additionalProperties: false,
          properties: {
            kind: { type: 'string', enum: ['flight', 'hotel', 'activity', 'note'] },
            activityId: { type: 'integer' },
            title: { type: 'string', maxLength: 200 },
            day: { type: 'string', maxLength: 10 },
            startTime: { type: 'string', maxLength: 5 },
            notes: { type: 'string', maxLength: 1000 },
            flightId: { type: 'integer' },
            hotelId: { type: 'integer' },
            checkIn: { type: 'string', maxLength: 10 },
            checkOut: { type: 'string', maxLength: 10 },
          },
        },
      },
    },
    async (request, reply) => {
      const item = await addItem(
        app.pg.pool,
        request.user.id,
        request.params.id,
        parseNewItem(request.body),
      );
      return reply.status(201).send({ item });
    },
  );

  app.delete<{ Params: { id: number; itemId: number } }>(
    '/trips/:id/items/:itemId',
    { schema: { params: { type: 'object', properties: { id: idParam, itemId: idParam } } } },
    async (request, reply) => {
      await removeItem(app.pg.pool, request.user.id, request.params.id, request.params.itemId);
      return reply.status(204).send();
    },
  );
}
