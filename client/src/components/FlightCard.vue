<script setup lang="ts">
import type { Flight } from '../api/types';
import {
  formatDate,
  formatDuration,
  formatMoney,
  formatTimeUtc,
  stopsLabel,
} from '../utils/format';
import { utcDay } from '../utils/dates';

defineProps<{
  flight: Flight;
  selected: boolean;
  passengers: number;
}>();

defineEmits<{ select: [flight: Flight] }>();
</script>

<template>
  <article class="card result" :class="{ 'result--selected': selected }" data-testid="flight-card">
    <div>
      <p>
        <strong>{{ flight.origin }} → {{ flight.destination }}</strong>
        <span class="muted"> · {{ flight.airline }} {{ flight.flightNo }}</span>
      </p>
      <p>
        {{ formatDate(utcDay(flight.departAt)) }}, {{ formatTimeUtc(flight.departAt) }} →
        {{ formatTimeUtc(flight.arriveAt) }}
      </p>
      <p class="muted small">
        {{ formatDuration(flight.durationMin) }} · {{ stopsLabel(flight.stops) }} ·
        {{ flight.seatsAvailable }} seats left
        <span v-if="flight.status !== 'on_time'" class="chip">{{
          flight.status.replace('_', ' ')
        }}</span>
      </p>
    </div>
    <div>
      <p class="price">{{ formatMoney(flight.price) }}</p>
      <p class="muted small">
        per passenger{{ passengers > 1 ? ` · ${passengers} travelling` : '' }}
      </p>
      <button
        type="button"
        :class="selected ? 'primary' : ''"
        :aria-pressed="selected"
        @click="$emit('select', flight)"
      >
        {{ selected ? 'Selected' : 'Select' }}
      </button>
    </div>
  </article>
</template>
