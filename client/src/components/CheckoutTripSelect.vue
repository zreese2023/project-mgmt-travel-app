<script setup lang="ts">
import { computed, watchEffect } from 'vue';
import { useTripsStore } from '../stores/trips';
import { formatDate } from '../utils/format';

/** Chooses the trip a checkout books onto. Only open trips whose dates cover `days` qualify. */
const props = defineProps<{
  /** Days that must fall within the trip (each flight's departure, or the check-in). */
  days: readonly string[];
  error?: string | undefined;
}>();

const tripId = defineModel<number | null>({ required: true });
const trips = useTripsStore();

const options = computed(() =>
  trips.openTrips.map((trip) => ({
    trip,
    fits: props.days.every((day) => day >= trip.startDate && day <= trip.endDate),
  })),
);
const fitting = computed(() => options.value.filter((o) => o.fits));

// Default to the active trip when it fits, otherwise the only trip that fits.
watchEffect(() => {
  if (tripId.value !== null && fitting.value.some((o) => o.trip.id === tripId.value)) return;
  const active = fitting.value.find((o) => o.trip.id === trips.activeTripId);
  const only = fitting.value.length === 1 ? fitting.value[0] : undefined;
  tripId.value = (active ?? only)?.trip.id ?? null;
});
</script>

<template>
  <div class="field" :class="{ 'field--error': error }" data-testid="checkout-trip">
    <label for="checkout-trip">Book onto trip</label>
    <select id="checkout-trip" v-model="tripId" :disabled="fitting.length === 0">
      <option :value="null" disabled>Choose a trip…</option>
      <option v-for="o in options" :key="o.trip.id" :value="o.trip.id" :disabled="!o.fits">
        {{ o.trip.name }} ({{ formatDate(o.trip.startDate) }} to {{ formatDate(o.trip.endDate) }}){{
          o.fits ? '' : ': dates do not match'
        }}
      </option>
    </select>
    <p v-if="error" class="field__error">{{ error }}</p>
    <p v-else-if="fitting.length === 0" class="small" data-testid="no-fitting-trip">
      None of your open trips cover {{ days.map(formatDate).join(' and ') }}.
      <RouterLink :to="{ name: 'trips' }">Create a trip</RouterLink> for these dates, then come back
      to book.
    </p>
  </div>
</template>
