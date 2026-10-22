import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildWeatherUrl,
  createWeatherService,
  describeWeatherCode,
  shapeWeather,
  type FetchLike,
} from '../../src/lib/weather.js';

const payload = {
  current: { temperature_2m: 71.6, weather_code: 61, wind_speed_10m: 12.4 },
  daily: {
    time: ['2026-10-21', '2026-10-22'],
    weather_code: [3, 95],
    temperature_2m_max: [75.2, 68.4],
    temperature_2m_min: [60.1, 55.5],
  },
};

const okResponse = (body: unknown = payload) => ({ ok: true, status: 200, json: async () => body });

describe('SCRUM-14: weather code mapping', () => {
  it.each([
    [0, 'Clear sky', 'clear'],
    [1, 'Mainly clear', 'clear'],
    [2, 'Partly cloudy', 'partly-cloudy'],
    [3, 'Overcast', 'cloudy'],
    [45, 'Fog', 'fog'],
    [53, 'Drizzle', 'drizzle'],
    [61, 'Light rain', 'rain'],
    [63, 'Rain', 'rain'],
    [65, 'Heavy rain', 'rain'],
    [67, 'Freezing rain', 'rain'],
    [73, 'Snow', 'snow'],
    [95, 'Thunderstorm', 'thunder'],
    [99, 'Thunderstorm with hail', 'thunder'],
    [1234, 'Unknown', 'cloudy'],
  ])('maps code %i to %s', (code, condition, icon) => {
    expect(describeWeatherCode(code)).toEqual({ condition, icon });
  });
});

describe('SCRUM-14: request URL and response shaping', () => {
  it('asks Open-Meteo for the right unit and a 5-day forecast', () => {
    const f = new URL(buildWeatherUrl(35.6895, 139.6917, 'F'));
    expect(f.hostname).toBe('api.open-meteo.com');
    expect(f.searchParams.get('temperature_unit')).toBe('fahrenheit');
    expect(f.searchParams.get('forecast_days')).toBe('5');
    expect(f.searchParams.get('latitude')).toBe('35.6895');
    expect(new URL(buildWeatherUrl(1, 2, 'C')).searchParams.get('temperature_unit')).toBe(
      'celsius',
    );
  });

  it('rounds temperatures and describes current and forecast conditions', () => {
    const result = shapeWeather(payload, 'F', new Date('2026-10-21T12:00:00Z'));
    expect(result.current).toEqual({
      temperature: 72,
      condition: 'Light rain',
      icon: 'rain',
      windKmh: 12,
    });
    expect(result.forecast).toEqual([
      { date: '2026-10-21', condition: 'Overcast', icon: 'cloudy', high: 75, low: 60 },
      { date: '2026-10-22', condition: 'Thunderstorm', icon: 'thunder', high: 68, low: 56 },
    ]);
    expect(result.fetchedAt).toBe('2026-10-21T12:00:00.000Z');
  });

  it.each([
    null,
    {},
    { current: {}, daily: {} },
    { current: { temperature_2m: 1, weather_code: 1, wind_speed_10m: 1 }, daily: { time: [1] } },
    {
      current: { temperature_2m: 1, weather_code: 1, wind_speed_10m: 1 },
      daily: { time: [], weather_code: 'x' },
    },
  ])('throws on an unexpected payload %#', (bad) => {
    expect(() => shapeWeather(bad, 'F', new Date())).toThrow(/Unexpected weather response/);
  });
});

describe('SCRUM-14: weather service cache, errors and timeout (fake fetch + timers)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-21T12:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('serves repeat requests from the cache until the TTL passes', async () => {
    const fetch = vi.fn<FetchLike>(async () => okResponse());
    const service = createWeatherService({ fetch, ttlMs: 10 * 60 * 1000 });

    const first = await service.getWeather(35.7, 139.7, 'F');
    const second = await service.getWeather(35.7, 139.7, 'F');
    expect(first.available && second.available).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(9 * 60 * 1000);
    await service.getWeather(35.7, 139.7, 'F');
    expect(fetch).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(2 * 60 * 1000);
    await service.getWeather(35.7, 139.7, 'F');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('caches per location and unit', async () => {
    const fetch = vi.fn<FetchLike>(async () => okResponse());
    const service = createWeatherService({ fetch });
    await service.getWeather(35.7, 139.7, 'F');
    await service.getWeather(35.7, 139.7, 'C');
    await service.getWeather(48.8, 2.3, 'F');
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('returns unavailable (not an exception) when the network fails, and does not cache it', async () => {
    const fetch = vi
      .fn<FetchLike>()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(okResponse());
    const service = createWeatherService({ fetch });
    expect(await service.getWeather(1, 2, 'F')).toEqual({
      available: false,
      reason: 'unreachable',
    });
    expect((await service.getWeather(1, 2, 'F')).available).toBe(true);
  });

  it('returns unavailable on a non-OK HTTP status', async () => {
    const fetch = vi.fn<FetchLike>(async () => ({
      ok: false,
      status: 503,
      json: async () => ({}),
    }));
    const service = createWeatherService({ fetch });
    expect(await service.getWeather(1, 2, 'F')).toEqual({
      available: false,
      reason: 'unreachable',
    });
  });

  it('returns unavailable on a malformed body', async () => {
    const fetch = vi.fn<FetchLike>(async () => okResponse({ nope: true }));
    const service = createWeatherService({ fetch });
    expect(await service.getWeather(1, 2, 'F')).toEqual({
      available: false,
      reason: 'bad_response',
    });
  });

  it('times out a hung request after the configured time', async () => {
    const fetch: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      });
    const service = createWeatherService({ fetch, timeoutMs: 5000 });
    const pending = service.getWeather(1, 2, 'F');
    await vi.advanceTimersByTimeAsync(5000);
    expect(await pending).toEqual({ available: false, reason: 'timeout' });
  });
});
