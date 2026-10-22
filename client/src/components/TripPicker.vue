<script setup lang="ts">
import { computed } from 'vue';
import { useTripsStore } from '../stores/trips';
import { useAuthStore } from '../stores/auth';
import { formatDate } from '../utils/format';

const auth = useAuthStore();
const trips = useTripsStore();

const selected = computed({
  get: () => trips.activeTripId ?? '',
  set: (value: number | '') => trips.setActive(value === '' ? null : Number(value)),
});
</script>

<template>
  <div class="card" data-testid="trip-picker">
    <template v-if="auth.isAuthenticated">
      <div v-if="trips.trips.length > 0" class="row">
        <label for="trip-select" style="margin: 0">Add selections to trip:</label>
        <select id="trip-select" v-model="selected" style="max-width: 320px">
          <option value="">Choose a trip…</option>
          <option v-for="trip in trips.trips" :key="trip.id" :value="trip.id">
            {{ trip.name }} ({{ formatDate(trip.startDate) }} to {{ formatDate(trip.endDate) }})
          </option>
        </select>
      </div>
      <p v-else class="small">
        You have no trips yet. <RouterLink :to="{ name: 'trips' }">Create one</RouterLink> to add
        flights and hotels to an itinerary.
      </p>
    </template>
    <p v-else class="small">
      <RouterLink :to="{ name: 'login' }">Sign in</RouterLink> to add selections to a trip.
    </p>
  </div>
</template>
