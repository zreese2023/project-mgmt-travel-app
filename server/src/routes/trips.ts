import type { FastifyInstance } from 'fastify';
import {
  addItem,
  createTrip,
  deleteTrip,
  getTripDetail,
  listTrips,
  moveItem,
  parseNewItem,
  removeItem,
  updateItem,
  type NewItemBody,
} from '../lib/trips.js';
import { PAYMENT_METHODS, payForTrip, type PaymentMethod } from '../lib/payments.js';

const idParam = { type: 'integer' } as const;

export async function tripRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', app.authenticate);

  // SCRUM-31
  app.get<{ Querystring: { scope?: 'all' | 'upcoming' | 'past' } }>(
    '/trips',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: { scope: { type: 'string', enum: ['all', 'upcoming', 'past'] } },
        },
      },
    },
    // SCRUM-35: scope=past lists previous trips; the default lists all, upcoming first.
    async (request) => ({
      trips: await listTrips(app.pg.pool, request.user.id, { scope: request.query.scope }),
    }),
  );

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

  // SCRUM-31/32: add, edit, rearrange and remove itinerary items
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

  app.patch<{
    Params: { id: number; itemId: number };
    Body: { title?: string; notes?: string | null; day?: string; startTime?: string | null };
  }>(
    '/trips/:id/items/:itemId',
    {
      schema: {
        params: { type: 'object', properties: { id: idParam, itemId: idParam } },
        body: {
          type: 'object',
          additionalProperties: false,
          properties: {
            title: { type: 'string', maxLength: 200 },
            notes: { type: ['string', 'null'], maxLength: 1000 },
            day: { type: 'string', maxLength: 10 },
            startTime: { type: ['string', 'null'], maxLength: 5 },
          },
        },
      },
    },
    async (request) => ({
      item: await updateItem(
        app.pg.pool,
        request.user.id,
        request.params.id,
        request.params.itemId,
        request.body,
      ),
    }),
  );

  app.post<{ Params: { id: number; itemId: number }; Body: { direction: 'up' | 'down' } }>(
    '/trips/:id/items/:itemId/move',
    {
      schema: {
        params: { type: 'object', properties: { id: idParam, itemId: idParam } },
        body: {
          type: 'object',
          required: ['direction'],
          additionalProperties: false,
          properties: { direction: { type: 'string', enum: ['up', 'down'] } },
        },
      },
    },
    async (request) => ({
      item: await moveItem(
        app.pg.pool,
        request.user.id,
        request.params.id,
        request.params.itemId,
        request.body.direction,
      ),
    }),
  );

  // SCRUM-25: fake checkout, one payment per trip
  app.post<{ Params: { id: number }; Body: { method: PaymentMethod } }>(
    '/trips/:id/payment',
    {
      schema: {
        params: { type: 'object', properties: { id: idParam } },
        body: {
          type: 'object',
          required: ['method'],
          additionalProperties: false,
          properties: { method: { type: 'string', enum: [...PAYMENT_METHODS] } },
        },
      },
    },
    async (request, reply) => {
      const payment = await payForTrip(
        app.pg.pool,
        request.user.id,
        request.params.id,
        request.body.method,
      );
      return reply.status(201).send({ payment });
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
