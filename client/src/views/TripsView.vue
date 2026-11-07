<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { endpoints } from '../api/endpoints';
import type { DestinationSummary } from '../api/types';
import { useTripsStore } from '../stores/trips';
import { defaultDates } from '../utils/dates';
import { errorMessage, fieldErrors } from '../utils/errors';
import { formatDate, plural } from '../utils/format';

const route = useRoute();
const router = useRouter();
const trips = useTripsStore();

const destinations = ref<DestinationSummary[]>([]);
const dates = defaultDates(4);
const destinationSlug = ref(
  typeof route.query.destination === 'string' ? route.query.destination : '',
);
const name = ref('');
const startDate = ref(dates.start);
const endDate = ref(dates.end);

const loading = ref(true);
const busy = ref(false);
const error = ref<string | null>(null);
const errors = ref<Record<string, string>>({});

async function load(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    const [destinationResult] = await Promise.all([endpoints.destinations.search(), trips.load()]);
    destinations.value = destinationResult.destinations;
    if (destinationSlug.value && !name.value) {
      const picked = destinations.value.find((d) => d.slug === destinationSlug.value);
      if (picked) name.value = `${picked.name} trip`;
    }
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    loading.value = false;
  }
}

async function create(): Promise<void> {
  busy.value = true;
  error.value = null;
  errors.value = {};
  try {
    const { trip } = await endpoints.trips.create({
      destinationSlug: destinationSlug.value,
      name: name.value,
      startDate: startDate.value,
      endDate: endDate.value,
    });
    await trips.load();
    trips.setActive(trip.id);
    await router.push({ name: 'trip', params: { id: trip.id } });
  } catch (err) {
    errors.value = fieldErrors(err);
    error.value = errorMessage(err);
  } finally {
    busy.value = false;
  }
}

async function remove(id: number, tripName: string): Promise<void> {
  if (!window.confirm(`Delete "${tripName}" and its itinerary?`)) return;
  try {
    await endpoints.trips.remove(id);
    await trips.load();
  } catch (err) {
    error.value = errorMessage(err);
  }
}

const upcoming = computed(() => trips.trips.filter((t) => !t.isPast));
const past = computed(() => trips.trips.filter((t) => t.isPast));
const groups = computed(() => [
  {
    key: 'upcoming',
    title: `Upcoming trips (${upcoming.value.length})`,
    trips: upcoming.value,
    empty: 'No upcoming trips.',
  },
  {
    key: 'past',
    title: `Past trips (${past.value.length})`,
    trips: past.value,
    empty: 'No past trips yet.',
  },
]);

onMounted(load);
</script>

<template>
  <h1>My trips</h1>

  <form class="card" aria-label="Create a trip" @submit.prevent="create">
    <h2>Plan a new trip</h2>
    <div v-if="error" class="alert alert--error" role="alert">{{ error }}</div>
    <div class="form-grid">
      <div class="field">
        <label for="trip-destination">Destination</label>
        <select id="trip-destination" v-model="destinationSlug" required>
          <option value="">Choose a destination…</option>
          <option v-for="d in destinations" :key="d.slug" :value="d.slug">
            {{ d.name }}, {{ d.country }}
          </option>
        </select>
      </div>
      <div class="field" :class="{ 'field--error': errors.name }">
        <label for="trip-name">Trip name</label>
        <input id="trip-name" v-model="name" type="text" required />
      </div>
      <div class="field" :class="{ 'field--error': errors.startDate }">
        <label for="trip-start">Start date</label>
        <input id="trip-start" v-model="startDate" type="date" required />
      </div>
      <div class="field" :class="{ 'field--error': errors.endDate }">
        <label for="trip-end">End date</label>
        <input id="trip-end" v-model="endDate" type="date" :min="startDate" required />
        <p v-if="errors.endDate" class="field__error">{{ errors.endDate }}</p>
      </div>
    </div>
    <button type="submit" class="primary" :disabled="busy">
      {{ busy ? 'Creating…' : 'Create trip' }}
    </button>
  </form>

  <p v-if="loading" class="status" style="margin-top: 1.5rem">Loading your trips…</p>
  <p v-else-if="trips.trips.length === 0" class="status" data-testid="no-trips">
    You have no trips yet. Create one above to start building an itinerary.
  </p>
  <template v-else>
    <section v-for="group in groups" :key="group.key" :data-testid="`${group.key}-section`">
      <h2 style="margin-top: 1.5rem">{{ group.title }}</h2>
      <p v-if="group.trips.length === 0" class="status" :data-testid="`no-${group.key}-trips`">
        {{ group.empty }}
      </p>
      <div v-else class="grid">
        <article v-for="trip in group.trips" :key="trip.id" class="card" data-testid="trip-card">
          <h3>
            <RouterLink :to="{ name: 'trip', params: { id: trip.id } }">{{ trip.name }}</RouterLink>
          </h3>
          <p class="muted small">
            {{ trip.destination.name }} · {{ formatDate(trip.startDate) }} to
            {{ formatDate(trip.endDate) }}
          </p>
          <p class="small">
            {{ plural(trip.itemCount, 'item') }} planned
            <span v-if="trip.isPast" class="kind" data-testid="trip-past">Past</span>
            <span v-if="trip.paid" class="kind kind--booked" data-testid="trip-paid">Paid</span>
          </p>
          <div class="row">
            <RouterLink class="button button--small" :to="{ name: 'trip', params: { id: trip.id } }"
              >Open</RouterLink
            >
            <button
              v-if="!trip.paid"
              type="button"
              class="button--small button--danger"
              @click="remove(trip.id, trip.name)"
            >
              Delete
            </button>
          </div>
        </article>
      </div>
    </section>
  </template>
</template>
