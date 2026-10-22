<script setup lang="ts">
import type { Weather } from '../api/types';
import { formatDate } from '../utils/format';
import { formatTemperature, weatherEmoji, weatherProblem } from '../utils/presentation';

defineProps<{
  weather: Weather | null;
  loading: boolean;
}>();

defineEmits<{ retry: [] }>();
</script>

<template>
  <section aria-label="Weather" aria-live="polite" data-testid="weather-panel">
    <p v-if="loading" class="status" data-testid="weather-loading">Loading weather…</p>

    <div
      v-else-if="weather === null || !weather.available"
      class="alert alert--error"
      data-testid="weather-error"
    >
      <p>
        {{
          weather === null ? 'Weather is unavailable right now.' : weatherProblem(weather.reason)
        }}
      </p>
      <p class="small">
        The rest of the page still works. Weather comes from the free Open-Meteo service.
      </p>
      <button type="button" class="button--small" @click="$emit('retry')">Try again</button>
    </div>

    <div v-else data-testid="weather-success">
      <p class="weather-now">
        <span aria-hidden="true">{{ weatherEmoji(weather.current.icon) }}</span>
        {{ formatTemperature(weather.current.temperature, weather.unit) }},
        {{ weather.current.condition }}
      </p>
      <p class="muted small">
        Wind {{ weather.current.windKmh }} km/h · as of {{ weather.fetchedAt.slice(11, 16) }} UTC
        (cached up to 10 minutes)
      </p>
      <div class="forecast">
        <div v-for="day in weather.forecast" :key="day.date" class="forecast__day">
          <strong>{{ formatDate(day.date) }}</strong>
          <div aria-hidden="true">{{ weatherEmoji(day.icon) }}</div>
          <div>{{ day.condition }}</div>
          <div>
            {{ formatTemperature(day.high, weather.unit) }} /
            {{ formatTemperature(day.low, weather.unit) }}
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
