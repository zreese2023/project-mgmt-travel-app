import fastifyCookie from '@fastify/cookie';
import fastifyJwt from '@fastify/jwt';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from '../lib/errors.js';
import type { Role } from '../lib/users.js';

export const SESSION_COOKIE = 'wf_token';
const SESSION_SECONDS = 7 * 24 * 60 * 60;

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { id: number; role: Role };
    user: { id: number; role: Role };
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest) => Promise<void>;
    startSession: (reply: FastifyReply, user: { id: number; role: Role }) => void;
    endSession: (reply: FastifyReply) => void;
  }
}

export interface AuthOptions {
  jwtSecret: string;
  cookieSecure: boolean;
}

/** Registers cookie sessions (signed JWT in an httpOnly cookie) and the auth guards. */
export async function registerAuth(app: FastifyInstance, options: AuthOptions): Promise<void> {
  await app.register(fastifyCookie);
  await app.register(fastifyJwt, {
    secret: options.jwtSecret,
    cookie: { cookieName: SESSION_COOKIE, signed: false },
    sign: { expiresIn: SESSION_SECONDS },
  });

  app.decorate('authenticate', async (request: FastifyRequest) => {
    try {
      await request.jwtVerify({ onlyCookie: true });
    } catch {
      throw new AppError(401, 'unauthenticated', 'Please sign in to continue');
    }
  });

  app.decorate('startSession', (reply: FastifyReply, user: { id: number; role: Role }) => {
    const token = app.jwt.sign({ id: user.id, role: user.role });
    reply.setCookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: options.cookieSecure,
      path: '/',
      maxAge: SESSION_SECONDS,
    });
  });

  app.decorate('endSession', (reply: FastifyReply) => {
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
  });
}
