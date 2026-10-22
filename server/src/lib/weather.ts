export type TempUnit = 'F' | 'C';

export interface ForecastDay {
  date: string;
  condition: string;
  icon: WeatherIcon;
  high: number;
  low: number;
}

export type WeatherIcon =
  'clear' | 'partly-cloudy' | 'cloudy' | 'fog' | 'drizzle' | 'rain' | 'snow' | 'thunder';

export type WeatherResult =
  | {
      available: true;
      unit: TempUnit;
      fetchedAt: string;
      current: { temperature: number; condition: string; icon: WeatherIcon; windKmh: number };
      forecast: ForecastDay[];
    }
  | { available: false; reason: 'unreachable' | 'timeout' | 'bad_response' };

export interface FetchResponseLike {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}
export type FetchLike = (
  url: string,
  init?: { signal?: AbortSignal },
) => Promise<FetchResponseLike>;

export const WEATHER_TTL_MS = 10 * 60 * 1000;
export const WEATHER_TIMEOUT_MS = 5000;

/** WMO weather interpretation codes used by Open-Meteo. */
export function describeWeatherCode(code: number): { condition: string; icon: WeatherIcon } {
  if (code === 0) return { condition: 'Clear sky', icon: 'clear' };
  if (code === 1) return { condition: 'Mainly clear', icon: 'clear' };
  if (code === 2) return { condition: 'Partly cloudy', icon: 'partly-cloudy' };
  if (code === 3) return { condition: 'Overcast', icon: 'cloudy' };
  if (code === 45 || code === 48) return { condition: 'Fog', icon: 'fog' };
  if (code >= 51 && code <= 57) return { condition: 'Drizzle', icon: 'drizzle' };
  if (code === 61 || code === 80) return { condition: 'Light rain', icon: 'rain' };
  if (code === 63 || code === 81) return { condition: 'Rain', icon: 'rain' };
  if (code === 65 || code === 82) return { condition: 'Heavy rain', icon: 'rain' };
  if (code === 66 || code === 67) return { condition: 'Freezing rain', icon: 'rain' };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) {
    return { condition: 'Snow', icon: 'snow' };
  }
  if (code === 95) return { condition: 'Thunderstorm', icon: 'thunder' };
  if (code === 96 || code === 99) return { condition: 'Thunderstorm with hail', icon: 'thunder' };
  return { condition: 'Unknown', icon: 'cloudy' };
}

export function buildWeatherUrl(latitude: number, longitude: number, unit: TempUnit): string {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current: 'temperature_2m,weather_code,wind_speed_10m',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min',
    temperature_unit: unit === 'F' ? 'fahrenheit' : 'celsius',
    wind_speed_unit: 'kmh',
    forecast_days: '5',
    timezone: 'auto',
  });
  return `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function numberArray(value: unknown): number[] {
  if (!Array.isArray(value) || !value.every((v) => typeof v === 'number')) {
    throw new Error('Unexpected weather response');
  }
  return value as number[];
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value) || !value.every((v) => typeof v === 'string')) {
    throw new Error('Unexpected weather response');
  }
  return value as string[];
}

/** Maps an Open-Meteo forecast payload to our shape; throws on an unexpected payload. */
export function shapeWeather(
  raw: unknown,
  unit: TempUnit,
  fetchedAt: Date,
): Extract<WeatherResult, { available: true }> {
  if (!isRecord(raw) || !isRecord(raw.current) || !isRecord(raw.daily)) {
    throw new Error('Unexpected weather response');
  }
  const { temperature_2m, weather_code, wind_speed_10m } = raw.current;
  if (
    typeof temperature_2m !== 'number' ||
    typeof weather_code !== 'number' ||
    typeof wind_speed_10m !== 'number'
  ) {
    throw new Error('Unexpected weather response');
  }
  const dates = stringArray(raw.daily.time);
  const codes = numberArray(raw.daily.weather_code);
  const highs = numberArray(raw.daily.temperature_2m_max);
  const lows = numberArray(raw.daily.temperature_2m_min);

  const now = describeWeatherCode(weather_code);
  return {
    available: true,
    unit,
    fetchedAt: fetchedAt.toISOString(),
    current: {
      temperature: Math.round(temperature_2m),
      condition: now.condition,
      icon: now.icon,
      windKmh: Math.round(wind_speed_10m),
    },
    forecast: dates.map((date, i) => {
      const day = describeWeatherCode(codes[i] ?? -1);
      return {
        date,
        condition: day.condition,
        icon: day.icon,
        high: Math.round(highs[i] ?? 0),
        low: Math.round(lows[i] ?? 0),
      };
    }),
  };
}

export interface WeatherServiceOptions {
  fetch: FetchLike;
  now?: () => number;
  ttlMs?: number;
  timeoutMs?: number;
}

export interface WeatherService {
  getWeather(latitude: number, longitude: number, unit: TempUnit): Promise<WeatherResult>;
}

/**
 * Open-Meteo client with a short in-memory cache. Failures never throw: they return
 * `{ available: false }` so the UI can show a graceful "unavailable" state. Failed
 * lookups are not cached.
 */
export function createWeatherService(options: WeatherServiceOptions): WeatherService {
  const now = options.now ?? Date.now;
  const ttlMs = options.ttlMs ?? WEATHER_TTL_MS;
  const timeoutMs = options.timeoutMs ?? WEATHER_TIMEOUT_MS;
  const cache = new Map<string, { expires: number; value: WeatherResult }>();

  return {
    async getWeather(latitude, longitude, unit) {
      const key = `${latitude.toFixed(3)},${longitude.toFixed(3)},${unit}`;
      const hit = cache.get(key);
      if (hit && hit.expires > now()) return hit.value;

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let response: FetchResponseLike;
      try {
        response = await options.fetch(buildWeatherUrl(latitude, longitude, unit), {
          signal: controller.signal,
        });
      } catch {
        return { available: false, reason: controller.signal.aborted ? 'timeout' : 'unreachable' };
      } finally {
        clearTimeout(timer);
      }

      if (!response.ok) return { available: false, reason: 'unreachable' };
      try {
        const value = shapeWeather(await response.json(), unit, new Date(now()));
        cache.set(key, { expires: now() + ttlMs, value });
        return value;
      } catch {
        return { available: false, reason: 'bad_response' };
      }
    },
  };
}
