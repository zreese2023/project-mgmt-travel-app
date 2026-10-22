import { ref, watch, type Ref } from 'vue';
import { endpoints } from '../api/endpoints';
import type { TempUnit, Weather } from '../api/types';

/** Loads weather for a destination; any failure becomes the same graceful "unavailable" state. */
export function useWeather(slug: Ref<string>, unit: Ref<TempUnit>) {
  const weather = ref<Weather | null>(null);
  const loading = ref(false);
  let latest = 0;

  async function reload(): Promise<void> {
    const ticket = ++latest;
    loading.value = true;
    try {
      const result = await endpoints.destinations.weather(slug.value, unit.value);
      if (ticket === latest) weather.value = result;
    } catch {
      if (ticket === latest) weather.value = { available: false, reason: 'unreachable' };
    } finally {
      if (ticket === latest) loading.value = false;
    }
  }

  watch([slug, unit], () => void reload(), { immediate: true });

  return { weather, loading, reload };
}
