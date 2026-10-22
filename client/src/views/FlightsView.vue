<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { endpoints } from '../api/endpoints';
import type { Airport, Flight } from '../api/types';
import FlightCard from '../components/FlightCard.vue';
import SampleDataNotice from '../components/SampleDataNotice.vue';
import TripPicker from '../components/TripPicker.vue';
import { useTripsStore } from '../stores/trips';
import { addDays, defaultDates } from '../utils/dates';
import { errorMessage, fieldErrors } from '../utils/errors';
import { formatMoney, plural } from '../utils/format';

const route = useRoute();
const trips = useTripsStore();

const queryString = (key: string): string =>
  typeof route.query[key] === 'string' ? (route.query[key] as string) : '';

const airports = ref<Airport[]>([]);
const dateWindow = ref<{ from: string; to: string } | null>(null);

const origin = ref(queryString('origin') || 'JFK');
const destination = ref(queryString('destination'));
const depart = ref(queryString('depart') || defaultDates(7).start);
const roundTrip = ref(route.query.return !== undefined || route.query.destination === undefined);
const returnDate = ref(queryString('return') || addDays(depart.value, 7));
const passengers = ref(Number(queryString('passengers')) || 1);
const sort = ref<'price' | 'duration' | 'departure'>('departure');
const maxPrice = ref<number | null>(null);

const outbound = ref<Flight[]>([]);
const inbound = ref<Flight[]>([]);
const note = ref('');
const searched = ref(false);
const loading = ref(false);
const error = ref<string | null>(null);
const errors = ref<Record<string, string>>({});
const message = ref<{ kind: 'success' | 'error'; text: string } | null>(null);

const selectedOutbound = ref<Flight | null>(null);
const selectedReturn = ref<Flight | null>(null);

const destinationOptions = computed(() => airports.value.filter((a) => a.code !== origin.value));
const originOptions = computed(() => airports.value.filter((a) => a.isOrigin));
const canAdd = computed(
  () => selectedOutbound.value !== null && (!roundTrip.value || selectedReturn.value !== null),
);
const estimate = computed(() => {
  const legs = [selectedOutbound.value, roundTrip.value ? selectedReturn.value : null].filter(
    (f): f is Flight => f !== null,
  );
  return legs.reduce((sum, f) => sum + f.price, 0) * passengers.value;
});

async function search(): Promise<void> {
  loading.value = true;
  error.value = null;
  errors.value = {};
  message.value = null;
  selectedOutbound.value = null;
  selectedReturn.value = null;
  try {
    const result = await endpoints.travel.flights({
      origin: origin.value,
      destination: destination.value,
      depart: depart.value,
      ...(roundTrip.value ? { return: returnDate.value } : {}),
      passengers: passengers.value,
      sort: sort.value,
      ...(maxPrice.value ? { maxPrice: maxPrice.value } : {}),
    });
    outbound.value = result.outbound;
    inbound.value = result.return ?? [];
    note.value = result.note;
    searched.value = true;
  } catch (err) {
    errors.value = fieldErrors(err);
    error.value = Object.keys(errors.value).length > 0 ? null : errorMessage(err);
    searched.value = false;
  } finally {
    loading.value = false;
  }
}

async function addToTrip(): Promise<void> {
  message.value = null;
  const tripId = trips.activeTripId;
  if (!tripId || !selectedOutbound.value) {
    message.value = { kind: 'error', text: 'Choose a trip first.' };
    return;
  }
  try {
    const legs = [selectedOutbound.value, roundTrip.value ? selectedReturn.value : null].filter(
      (f): f is Flight => f !== null,
    );
    for (const leg of legs)
      await endpoints.trips.addItem(tripId, { kind: 'flight', flightId: leg.id });
    message.value = {
      kind: 'success',
      text: `Added ${plural(legs.length, 'flight')} to your trip.`,
    };
  } catch (err) {
    message.value = { kind: 'error', text: errorMessage(err) };
  }
}

onMounted(async () => {
  try {
    const result = await endpoints.travel.airports();
    airports.value = result.airports;
    dateWindow.value = result.searchWindow;
  } catch (err) {
    error.value = errorMessage(err);
  }
  if (route.query.destination && route.query.depart) void search();
});
</script>

<template>
  <h1>Flights</h1>
  <SampleDataNotice what="Flights, schedules and fares" />

  <form class="card" aria-label="Flight search" @submit.prevent="search">
    <div class="form-grid">
      <div class="field" :class="{ 'field--error': errors.origin }">
        <label for="flight-origin">From</label>
        <select id="flight-origin" v-model="origin">
          <option v-for="a in originOptions" :key="a.code" :value="a.code">
            {{ a.city }} ({{ a.code }})
          </option>
        </select>
        <p v-if="errors.origin" class="field__error">{{ errors.origin }}</p>
      </div>
      <div class="field" :class="{ 'field--error': errors.destination }">
        <label for="flight-destination">To</label>
        <select id="flight-destination" v-model="destination">
          <option value="">Choose a destination…</option>
          <option v-for="a in destinationOptions" :key="a.code" :value="a.code">
            {{ a.city }} ({{ a.code }})
          </option>
        </select>
        <p v-if="errors.destination" class="field__error">{{ errors.destination }}</p>
      </div>
      <div class="field" :class="{ 'field--error': errors.depart }">
        <label for="flight-depart">Depart</label>
        <input
          id="flight-depart"
          v-model="depart"
          type="date"
          :min="dateWindow?.from"
          :max="dateWindow?.to"
        />
        <p v-if="errors.depart" class="field__error">{{ errors.depart }}</p>
      </div>
      <div class="field" :class="{ 'field--error': errors.returnDate }">
        <label for="flight-return">Return</label>
        <input
          id="flight-return"
          v-model="returnDate"
          type="date"
          :min="depart"
          :max="dateWindow?.to"
          :disabled="!roundTrip"
        />
        <p v-if="errors.returnDate" class="field__error">{{ errors.returnDate }}</p>
      </div>
      <div class="field">
        <label for="flight-passengers">Passengers</label>
        <input id="flight-passengers" v-model.number="passengers" type="number" min="1" max="9" />
      </div>
      <div class="field">
        <label for="flight-sort">Sort by</label>
        <select id="flight-sort" v-model="sort">
          <option value="departure">Departure time</option>
          <option value="price">Price</option>
          <option value="duration">Duration</option>
        </select>
      </div>
      <div class="field">
        <label for="flight-max">Max price per person</label>
        <input id="flight-max" v-model.number="maxPrice" type="number" min="0" placeholder="Any" />
      </div>
    </div>
    <div class="row">
      <label style="margin: 0"><input v-model="roundTrip" type="checkbox" /> Round trip</label>
      <button type="submit" class="primary" :disabled="loading || !destination">
        {{ loading ? 'Searching…' : 'Search flights' }}
      </button>
    </div>
  </form>

  <div v-if="error" class="alert alert--error" role="alert">{{ error }}</div>
  <div v-if="message" class="alert" :class="`alert--${message.kind}`" role="status">
    {{ message.text }}
  </div>

  <template v-if="searched">
    <p class="muted small">{{ note }}</p>

    <h2>Outbound: {{ origin }} → {{ destination }}</h2>
    <p v-if="outbound.length === 0" class="status" data-testid="no-flights">
      No flights match that date. Try another day or remove the price limit.
    </p>
    <FlightCard
      v-for="flight in outbound"
      :key="flight.id"
      :flight="flight"
      :selected="selectedOutbound?.id === flight.id"
      :passengers="passengers"
      @select="selectedOutbound = $event"
    />

    <template v-if="roundTrip">
      <h2>Return: {{ destination }} → {{ origin }}</h2>
      <p v-if="inbound.length === 0" class="status">No return flights on that date.</p>
      <FlightCard
        v-for="flight in inbound"
        :key="flight.id"
        :flight="flight"
        :selected="selectedReturn?.id === flight.id"
        :passengers="passengers"
        @select="selectedReturn = $event"
      />
    </template>

    <TripPicker />

    <div v-if="selectedOutbound" class="summary-bar card" data-testid="flight-summary">
      <div class="row row--between">
        <div>
          <strong>{{ plural(passengers, 'passenger') }}</strong> · about
          {{ formatMoney(estimate) }} before taxes
          <div class="muted small">
            Sample fares only: nothing is booked or charged. Add your selection to a trip to plan
            around it.
          </div>
        </div>
        <button
          type="button"
          class="primary"
          :disabled="!canAdd || !trips.activeTripId"
          data-testid="add-flight"
          @click="addToTrip"
        >
          Add to trip
        </button>
      </div>
    </div>
  </template>
</template>
