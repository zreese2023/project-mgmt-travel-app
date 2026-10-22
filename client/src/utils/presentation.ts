import type { TempUnit, WeatherIcon } from '../api/types';

const WEATHER_EMOJI: Record<WeatherIcon, string> = {
  clear: '☀️',
  'partly-cloudy': '⛅',
  cloudy: '☁️',
  fog: '🌫️',
  drizzle: '🌦️',
  rain: '🌧️',
  snow: '❄️',
  thunder: '⛈️',
};

export function weatherEmoji(icon: WeatherIcon): string {
  return WEATHER_EMOJI[icon] ?? '☁️';
}

export function formatTemperature(value: number, unit: TempUnit): string {
  return `${value}°${unit}`;
}

/** Plain-language reason shown when the weather API could not be used. */
export function weatherProblem(reason: 'unreachable' | 'timeout' | 'bad_response'): string {
  return reason === 'timeout'
    ? 'The weather service took too long to respond.'
    : 'Weather is unavailable right now.';
}
