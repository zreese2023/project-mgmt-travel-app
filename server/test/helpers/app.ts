import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';
import { loadConfig } from '../../src/lib/config.js';
import { addDays, todayIso } from '../../src/lib/dates.js';
import type { FetchLike } from '../../src/lib/weather.js';

export const weatherPayload = {
  current: { temperature_2m: 72.4, weather_code: 61, wind_speed_10m: 9.9 },
  daily: {
    time: ['2026-10-21', '2026-10-22'],
    weather_code: [61, 0],
    temperature_2m_max: [75, 70],
    temperature_2m_min: [60, 58],
  },
};

/** Stub for the Open-Meteo API: tests must never hit the network. */
export const okWeatherFetch: FetchLike = async () => ({
  ok: true,
  status: 200,
  json: async () => weatherPayload,
});

export const failingWeatherFetch: FetchLike = async () => {
  throw new Error('network down');
};

/**
 * Open-Meteo stub whose 5-day forecast starts today (UTC), so alert tests can place trips on
 * known days. Default codes: thunderstorm, clear, heavy rain, clear, snow.
 */
export function severeWeatherFetch(codes: number[] = [95, 0, 65, 0, 75]): FetchLike {
  return async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      current: { temperature_2m: 60, weather_code: 0, wind_speed_10m: 5 },
      daily: {
        time: codes.map((_, i) => addDays(todayIso(), i)),
        weather_code: codes,
        temperature_2m_max: codes.map(() => 70),
        temperature_2m_min: codes.map(() => 50),
      },
    }),
  });
}

/** Entries shaped like the State Department feed; the United States is deliberately absent. */
const FEED_COUNTRIES: Array<[string, number, string]> = [
  ['Japan', 1, 'Exercise Normal Precautions'],
  ['France', 2, 'Exercise Increased Caution'],
  ['United Kingdom', 2, 'Exercise Increased Caution'],
  ['Italy', 2, 'Exercise Increased Caution'],
  ['Spain', 2, 'Exercise Increased Caution'],
  ['Iceland', 1, 'Exercise Normal Precautions'],
  ['Thailand', 1, 'Exercise Normal Precautions'],
  ['Australia', 1, 'Exercise Normal Precautions'],
  ['South Africa', 2, 'Exercise Increased Caution'],
  ['Brazil', 2, 'Exercise Increased Caution'],
  ['United Arab Emirates', 3, 'Reconsider Travel'],
  ['Mexico Travel Advisory', 2, 'Exercise Increased Caution'],
  ['Morocco', 2, 'Exercise Increased Caution'],
];

export const advisoryFeed = FEED_COUNTRIES.map(([country, level, label]) => ({
  Title: `${country} - Level ${level}: ${label}`,
  Link: `https://travel.state.gov/content/travel/en/traveladvisories/${country.toLowerCase().replace(/[^a-z]+/g, '-')}.html`,
  Summary: `${label}<p>in <b>${country.replace(' Travel Advisory', '')} </b>due to <b>crime</b> and <b>terrorism</b>. Read the entire Travel Advisory.</p>`,
  Category: ['XX'],
  Updated: '2026-10-22T20:00:00-04:00',
  Published: '2026-10-22T20:00:00-04:00',
  id: country,
}));

/** Stub for the State Department feed: tests must never hit the network. */
export const okAdvisoryFetch: FetchLike = async () => ({
  ok: true,
  status: 200,
  json: async () => advisoryFeed,
});

export const failingAdvisoryFetch: FetchLike = async () => {
  throw new Error('network down');
};

export async function createTestApp(
  weatherFetch: FetchLike = okWeatherFetch,
  advisoryFetch: FetchLike = okAdvisoryFetch,
): Promise<FastifyInstance> {
  const config = loadConfig();
  const app = await buildApp({
    databaseUrl: config.testDatabaseUrl,
    jwtSecret: config.jwtSecret,
    weatherFetch,
    advisoryFetch,
  });
  await app.ready();
  return app;
}

export interface TestUser {
  id: number;
  email: string;
  password: string;
  cookie: string;
}

function cookieFrom(res: { cookies: Array<{ name: string; value: string }> }): string {
  const session = res.cookies.find((c) => c.name === 'wf_token');
  if (!session) throw new Error('no session cookie in response');
  return `wf_token=${session.value}`;
}

/** Registers a user with a unique email so tests never collide with leftover rows. */
export async function registerUser(
  app: FastifyInstance,
  name = 'Test Traveler',
): Promise<TestUser> {
  const email = `user-${randomUUID()}@test.local`;
  const password = 'test-password-1';
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { email, name, password },
  });
  if (res.statusCode !== 201) throw new Error(`register failed: ${res.body}`);
  return { id: res.json().user.id, email, password, cookie: cookieFrom(res) };
}

export async function loginAs(
  app: FastifyInstance,
  email: string,
  password: string,
): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email, password },
  });
  if (res.statusCode !== 200) throw new Error(`login failed: ${res.body}`);
  return cookieFrom(res);
}

/** A date `days` from today as YYYY-MM-DD (flights are seeded for the next 90 days). */
export const daysFromNow = (days: number): string => addDays(todayIso(), days);

export const auth = (user: TestUser) => ({ cookie: user.cookie });

export interface FlightResult {
  id: number;
  flightNo: string;
  price: number;
}

export async function findFlights(
  app: FastifyInstance,
  origin: string,
  destination: string,
  depart: string,
  returnDate?: string,
): Promise<{ outbound: FlightResult[]; return: FlightResult[] | null }> {
  const query = new URLSearchParams({
    origin,
    destination,
    depart,
    ...(returnDate ? { return: returnDate } : {}),
  });
  const res = await app.inject({ method: 'GET', url: `/api/flights?${query.toString()}` });
  if (res.statusCode !== 200) throw new Error(`flight search failed: ${res.body}`);
  return res.json();
}

export interface RoomResult {
  id: number;
  nightlyPrice: number;
  price: { total: number };
}

export async function findHotelRoom(
  app: FastifyInstance,
  destination: string,
  checkIn: string,
  checkOut: string,
): Promise<{ hotelId: number; room: RoomResult }> {
  const query = new URLSearchParams({ destination, checkIn, checkOut });
  const res = await app.inject({ method: 'GET', url: `/api/hotels?${query.toString()}` });
  const hotels = res.json().hotels as Array<{ id: number; rooms: RoomResult[] }>;
  const hotel = hotels[0];
  const room = hotel?.rooms[0];
  if (!hotel || !room) throw new Error('no hotel room available');
  return { hotelId: hotel.id, room };
}
