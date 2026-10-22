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

export async function createTestApp(
  weatherFetch: FetchLike = okWeatherFetch,
): Promise<FastifyInstance> {
  const config = loadConfig();
  const app = await buildApp({
    databaseUrl: config.testDatabaseUrl,
    jwtSecret: config.jwtSecret,
    weatherFetch,
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
