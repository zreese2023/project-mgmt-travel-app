import type { FastifyInstance } from 'fastify';
import { getAdvisory, type AdvisoryService } from '../lib/advisory.js';
import {
  getDestinationBySlug,
  listDestinationFilters,
  parseList,
  searchDestinations,
} from '../lib/destinations.js';
import { badRequest, notFound } from '../lib/errors.js';
import type { TempUnit, WeatherService } from '../lib/weather.js';

interface Deps {
  weather: WeatherService;
  advisories: AdvisoryService;
}

export async function destinationRoutes(app: FastifyInstance, deps: Deps): Promise<void> {
  // SCRUM-11, SCRUM-12
  app.get<{ Querystring: { q?: string; region?: string; budget?: string; interest?: string } }>(
    '/destinations',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            q: { type: 'string', maxLength: 100 },
            region: { type: 'string', maxLength: 200 },
            budget: { type: 'string', maxLength: 20 },
            interest: { type: 'string', maxLength: 200 },
          },
        },
      },
    },
    async (request) => {
      const { q, region, budget, interest } = request.query;
      const budgets = parseList(budget).map(Number);
      if (budgets.some((b) => !Number.isInteger(b) || b < 1 || b > 4)) {
        throw badRequest('Budget must be 1 to 4', { budget: 'Use tiers 1 to 4' });
      }
      const destinations = await searchDestinations(app.pg.pool, {
        q,
        regions: parseList(region),
        budgets,
        interests: parseList(interest),
      });
      return { destinations };
    },
  );

  app.get('/destinations/filters', async () => listDestinationFilters(app.pg.pool));

  // SCRUM-13
  app.get<{ Params: { slug: string } }>('/destinations/:slug', async (request) => {
    const destination = await getDestinationBySlug(app.pg.pool, request.params.slug);
    if (!destination) throw notFound('Destination');
    return { destination };
  });

  // SCRUM-14: always HTTP 200; `available: false` is the graceful "weather unavailable" state.
  app.get<{ Params: { slug: string }; Querystring: { unit?: TempUnit } }>(
    '/destinations/:slug/weather',
    {
      schema: {
        querystring: { type: 'object', properties: { unit: { type: 'string', enum: ['F', 'C'] } } },
      },
    },
    async (request) => {
      const destination = await getDestinationBySlug(app.pg.pool, request.params.slug);
      if (!destination) throw notFound('Destination');
      return deps.weather.getWeather(
        destination.latitude,
        destination.longitude,
        request.query.unit ?? 'F',
      );
    },
  );

  // SCRUM-15: U.S. Department of State advisory for the destination's country, with a
  // labelled sample fallback when that service cannot be reached.
  app.get<{ Params: { slug: string } }>('/destinations/:slug/advisory', async (request) => {
    const destination = await getDestinationBySlug(app.pg.pool, request.params.slug);
    if (!destination) throw notFound('Destination');
    return getAdvisory(app.pg.pool, deps.advisories, destination);
  });
}
