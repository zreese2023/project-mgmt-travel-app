<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { ApiError } from '../api/client';
import { endpoints } from '../api/endpoints';
import type { DestinationDetail, TempUnit } from '../api/types';
import WeatherBadge from '../components/WeatherBadge.vue';
import WeatherPanel from '../components/WeatherPanel.vue';
import { useWeather } from '../composables/useWeather';
import { errorMessage } from '../utils/errors';
import { formatDuration, formatMoney, titleCase } from '../utils/format';

const route = useRoute();

const slug = computed(() => String(route.params.slug));
const unit = ref<TempUnit>('F');
const destination = ref<DestinationDetail | null>(null);
const loading = ref(true);
const notFound = ref(false);
const error = ref<string | null>(null);

const { weather, loading: weatherLoading, reload: reloadWeather } = useWeather(slug, unit);

async function load(): Promise<void> {
  loading.value = true;
  notFound.value = false;
  error.value = null;
  destination.value = null;
  try {
    destination.value = (await endpoints.destinations.get(slug.value)).destination;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound.value = true;
    else error.value = errorMessage(err);
  } finally {
    loading.value = false;
  }
}

watch(slug, load, { immediate: true });
</script>

<template>
  <p v-if="loading" class="status">Loading destination…</p>

  <div v-else-if="notFound" class="card" data-testid="destination-not-found">
    <h1>Destination not found</h1>
    <p><RouterLink :to="{ name: 'destinations' }">Back to all destinations</RouterLink></p>
  </div>

  <div v-else-if="error" class="alert alert--error" role="alert">
    {{ error }} <button type="button" class="button--small" @click="load">Try again</button>
  </div>

  <article v-else-if="destination" class="stack">
    <div class="dest-hero">
      <img :src="destination.imageUrl" :alt="`${destination.name}, sample illustration`" />
    </div>

    <div class="row row--between">
      <div>
        <h1>{{ destination.name }}</h1>
        <p class="muted">{{ destination.country }} · {{ destination.region }}</p>
      </div>
      <WeatherBadge
        :weather="weather"
        :loading="weatherLoading"
        :place-name="destination.name"
        @retry="reloadWeather"
      />
    </div>

    <section class="card">
      <h2>About {{ destination.name }}</h2>
      <p data-testid="destination-description">{{ destination.description }}</p>
      <p>
        <span v-for="interest in destination.interests" :key="interest" class="chip">{{
          titleCase(interest)
        }}</span>
        <span class="muted small">
          About {{ formatMoney(destination.avgDailyCost) }} a day (sample estimate).</span
        >
      </p>
    </section>

    <section class="card">
      <div class="row row--between">
        <h2>Weather</h2>
        <label class="small" style="margin: 0"
          >Units
          <select
            v-model="unit"
            style="width: auto; display: inline-block"
            data-testid="unit-select"
          >
            <option value="F">°F</option>
            <option value="C">°C</option>
          </select>
        </label>
      </div>
      <WeatherPanel :weather="weather" :loading="weatherLoading" @retry="reloadWeather" />
    </section>

    <section class="card">
      <h2>Things to do</h2>
      <ul data-testid="activity-list">
        <li v-for="activity in destination.activities" :key="activity.id">
          <strong>{{ activity.name }}</strong>
          <span class="muted small">
            · {{ titleCase(activity.category) }} · {{ formatDuration(activity.durationMin) }}</span
          >
          <div class="small">{{ activity.description }}</div>
        </li>
      </ul>
    </section>

    <section class="card">
      <h2>Plan your trip</h2>
      <div class="row">
        <RouterLink
          class="button button--primary"
          :to="{ name: 'flights', query: { destination: destination.airportCode } }"
        >
          Find flights
        </RouterLink>
        <RouterLink
          class="button"
          :to="{ name: 'hotels', query: { destination: destination.slug } }"
        >
          Find hotels
        </RouterLink>
        <RouterLink
          class="button"
          :to="{ name: 'trips', query: { destination: destination.slug } }"
        >
          Plan an itinerary
        </RouterLink>
      </div>
    </section>
  </article>
</template>
