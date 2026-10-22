import type { FastifyInstance } from 'fastify';
import { AppError, badRequest } from '../lib/errors.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { createUser, findUserById, findUserWithHash, validateRegistration } from '../lib/users.js';

const INVALID_LOGIN = new AppError(401, 'invalid_credentials', 'Incorrect email or password');

export async function authRoutes(app: FastifyInstance): Promise<void> {
  // SCRUM-34: register and sign in (profile management is not part of Sprint 1)
  app.post<{ Body: { email: string; name: string; password: string } }>(
    '/auth/register',
    {
      schema: {
        body: {
          type: 'object',
          required: ['email', 'name', 'password'],
          additionalProperties: false,
          properties: {
            email: { type: 'string', maxLength: 200 },
            name: { type: 'string', maxLength: 100 },
            password: { type: 'string', maxLength: 200 },
          },
        },
      },
    },
    async (request, reply) => {
      const errors = validateRegistration(request.body);
      if (Object.keys(errors).length > 0)
        throw badRequest('Please fix the highlighted fields', errors);
      const user = await createUser(app.pg.pool, {
        email: request.body.email,
        name: request.body.name,
        passwordHash: await hashPassword(request.body.password),
      });
      app.startSession(reply, user);
      return reply.status(201).send({ user });
    },
  );

  app.post<{ Body: { email: string; password: string } }>(
    '/auth/login',
    {
      schema: {
        body: {
          type: 'object',
          required: ['email', 'password'],
          additionalProperties: false,
          properties: {
            email: { type: 'string', maxLength: 200 },
            password: { type: 'string', maxLength: 200 },
          },
        },
      },
    },
    async (request, reply) => {
      const found = await findUserWithHash(app.pg.pool, request.body.email);
      // Same error for unknown email and wrong password so accounts cannot be probed.
      if (!found || !(await verifyPassword(request.body.password, found.passwordHash))) {
        throw INVALID_LOGIN;
      }
      app.startSession(reply, found.user);
      return { user: found.user };
    },
  );

  app.post('/auth/logout', async (_request, reply) => {
    app.endSession(reply);
    return reply.status(204).send();
  });

  app.get('/me', { onRequest: app.authenticate }, async (request) => {
    const user = await findUserById(app.pg.pool, request.user.id);
    if (!user) throw new AppError(401, 'unauthenticated', 'Please sign in to continue');
    return { user };
  });
}
