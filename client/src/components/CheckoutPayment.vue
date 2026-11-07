<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { endpoints } from '../api/endpoints';
import type { TripDetail } from '../api/types';
import { useTripsStore } from '../stores/trips';
import { errorMessage } from '../utils/errors';
import TripPayment from './TripPayment.vue';

/**
 * Last step of flight and hotel checkout: the booking is on the trip, and the trip's new total is
 * handed to the trip payment form. Paying is optional; the booking stays planned until then.
 */
const props = defineProps<{
  tripId: number;
  /** What was just booked, e.g. "2 flights". */
  booked: string;
  /** Where "keep looking" goes, e.g. the flight search. */
  searchAgain: { label: string; to: string };
}>();

const trips = useTripsStore();
const detail = ref<TripDetail | null>(null);
const error = ref<string | null>(null);

async function load(): Promise<void> {
  try {
    detail.value = await endpoints.trips.get(props.tripId);
  } catch (err) {
    error.value = errorMessage(err);
  }
}

async function onPaid(): Promise<void> {
  await load();
  await trips.load().catch(() => undefined);
}

onMounted(load);
</script>

<template>
  <div class="alert alert--success" role="status" data-testid="booked">
    Booked {{ booked }} onto <strong>{{ detail?.trip.name ?? 'your trip' }}</strong
    >.
    <template v-if="!detail?.payment">
      It is planned until the trip is paid for: pay now, or keep planning and pay later.
    </template>
  </div>
  <div v-if="error" class="alert alert--error" role="alert">{{ error }}</div>
  <TripPayment
    v-if="detail"
    :trip-id="tripId"
    :cost="detail.cost"
    :payment="detail.payment"
    @paid="onPaid"
  />
  <div class="row checkout-nav">
    <RouterLink class="button" :to="{ name: 'trip', params: { id: tripId } }">
      {{ detail?.payment ? 'View trip' : 'Pay later, view trip' }}
    </RouterLink>
    <RouterLink v-if="!detail?.payment" class="button" :to="searchAgain.to">
      {{ searchAgain.label }}
    </RouterLink>
  </div>
</template>
