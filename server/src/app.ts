import fastifyPostgres from '@fastify/postgres';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerTypeParsers } from './lib/pgTypes.js';
import { createAdvisoryService } from './lib/advisory.js';
import { createWeatherService, type FetchLike } from './lib/weather.js';
import { registerAuth } from './plugins/auth.js';
import { registerErrorHandling } from './plugins/errors.js';
import { alertRoutes } from './routes/alerts.js';
import { authRoutes } from './routes/auth.js';
import { bookingRoutes } from './routes/bookings.js';
import { checkoutRoutes } from './routes/checkout.js';
import { destinationRoutes } from './routes/destinations.js';
import { travelRoutes } from './routes/travel.js';
import { tripRoutes } from './routes/trips.js';

export interface AppOptions {
  databaseUrl: string;
  jwtSecret: string;
  cookieSecure?: boolean;
  logger?: boolean;
  /** Override the HTTP client used for the weather API (tests pass a stub). */
  weatherFetch?: FetchLike;
  /** Override the HTTP client used for the U.S. State Department advisory feed (tests pass a stub). */
  advisoryFetch?: FetchLike;
}

export async function buildApp(options: AppOptions): Promise<FastifyInstance> {
  registerTypeParsers();
  const app = Fastify({
    logger: options.logger
      ? { redact: ['req.headers.cookie', 'req.body.card', 'req.body.password'] }
      : false,
  });
  registerErrorHandling(app);
  await app.register(fastifyPostgres, { connectionString: options.databaseUrl });
  await registerAuth(app, {
    jwtSecret: options.jwtSecret,
    cookieSecure: options.cookieSecure ?? false,
  });

  const advisories = createAdvisoryService({
    fetch: options.advisoryFetch ?? ((url, init) => fetch(url, init)),
  });
  const weather = createWeatherService({
    fetch: options.weatherFetch ?? ((url, init) => fetch(url, init)),
  });

  await app.register(
    async (api) => {
      api.get('/health', async () => {
        const { rows } = await api.pg.query<{ ok: number }>('select 1 as ok');
        return { status: 'ok', db: rows[0]?.ok === 1 ? 'up' : 'down' };
      });
      await api.register(authRoutes);
      await api.register(destinationRoutes, { weather, advisories });
      await api.register(travelRoutes);
      await api.register(bookingRoutes);
      await api.register(checkoutRoutes);
      await api.register(alertRoutes, { weather, advisories });
      await api.register(tripRoutes);
    },
    { prefix: '/api' },
  );

  return app;
}
