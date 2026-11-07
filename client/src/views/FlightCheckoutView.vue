<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { endpoints } from '../api/endpoints';
import type { Flight, FlightQuote, Passenger } from '../api/types';
import CheckoutPayment from '../components/CheckoutPayment.vue';
import CheckoutSteps from '../components/CheckoutSteps.vue';
import CheckoutTripSelect from '../components/CheckoutTripSelect.vue';
import SampleDataNotice from '../components/SampleDataNotice.vue';
import { useTripsStore } from '../stores/trips';
import { BAG_OPTIONS, SEAT_LABELS, blankPassenger, passengerErrors } from '../utils/checkout';
import { todayIso, utcDay } from '../utils/dates';
import { errorMessage, fieldErrors } from '../utils/errors';
import {
  formatDate,
  formatDuration,
  formatMoney,
  formatTimeUtc,
  plural,
  stopsLabel,
} from '../utils/format';

/** SCRUM-15: choose flights → passengers → review fare → pay (through the trip). */
const STEPS = ['Flights', 'Passengers', 'Review fare', 'Payment'] as const;
const MAX_PASSENGERS = 9;

const route = useRoute();
const trips = useTripsStore();

const queryId = (key: string): number | null => {
  const id = Number(route.query[key]);
  return Number.isInteger(id) && id > 0 ? id : null;
};

const step = ref(0);
const loading = ref(true);
const loadError = ref<string | null>(null);
const legs = ref<Flight[]>([]);
const tripId = ref<number | null>(null);
const passengerCount = ref(
  Math.min(MAX_PASSENGERS, Math.max(1, Number(route.query.passengers) || 1)),
);
const passengers = ref<Passenger[]>(Array.from({ length: passengerCount.value }, blankPassenger));
const errors = ref<Record<string, string>>({});
const message = ref<string | null>(null);
const busy = ref(false);
const quote = ref<FlightQuote | null>(null);

const departureDays = computed(() => legs.value.map((f) => utcDay(f.departAt)));
const today = todayIso();
const flightIds = computed(() => legs.value.map((f) => f.id));
const searchAgain = computed(() => {
  const first = legs.value[0];
  return {
    label: 'Find more flights',
    to: first ? `/flights?origin=${first.origin}&destination=${first.destination}` : '/flights',
  };
});

function setPassengerCount(count: number): void {
  const n = Math.min(MAX_PASSENGERS, Math.max(1, Math.floor(count) || 1));
  passengerCount.value = n;
  passengers.value = Array.from({ length: n }, (_, i) => passengers.value[i] ?? blankPassenger());
}

function fail(err: unknown): void {
  errors.value = fieldErrors(err);
  message.value =
    Object.keys(errors.value).length > 0 ? 'Check the highlighted details.' : errorMessage(err);
}

function toPassengers(): void {
  message.value = null;
  errors.value = {};
  if (tripId.value === null) {
    errors.value = { tripId: 'Choose the trip these flights are for' };
    return;
  }
  step.value = 1;
}

async function toReview(): Promise<void> {
  message.value = null;
  errors.value = passengerErrors(passengers.value, departureDays.value[0] ?? today, today);
  if (Object.keys(errors.value).length > 0) {
    message.value = 'Check the highlighted details.';
    return;
  }
  busy.value = true;
  try {
    quote.value = (
      await endpoints.checkout.quoteFlights({
        flightIds: flightIds.value,
        passengers: passengers.value,
      })
    ).quote;
    step.value = 2;
  } catch (err) {
    fail(err);
  } finally {
    busy.value = false;
  }
}

async function confirm(): Promise<void> {
  if (tripId.value === null) return;
  message.value = null;
  busy.value = true;
  try {
    quote.value = (
      await endpoints.checkout.bookFlights(tripId.value, {
        flightIds: flightIds.value,
        passengers: passengers.value,
      })
    ).quote;
    trips.setActive(tripId.value);
    step.value = 3;
  } catch (err) {
    fail(err);
  } finally {
    busy.value = false;
  }
}

function back(): void {
  message.value = null;
  errors.value = {};
  step.value -= 1;
}

onMounted(async () => {
  const ids = [queryId('outbound'), queryId('return')].filter((id): id is number => id !== null);
  if (queryId('outbound') === null) {
    loadError.value = 'Choose a flight to book first.';
    loading.value = false;
    return;
  }
  try {
    const [results] = await Promise.all([
      Promise.all(ids.map((id) => endpoints.travel.flight(id))),
      trips.loaded ? Promise.resolve() : trips.load(),
    ]);
    legs.value = results.map((r) => r.flight);
  } catch (err) {
    loadError.value = errorMessage(err);
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <h1>Book flights</h1>
  <SampleDataNotice what="Flights, fares and fees" />

  <p v-if="loading" class="status">Loading your flights…</p>
  <div v-else-if="loadError" class="card">
    <p class="alert alert--error" role="alert">{{ loadError }}</p>
    <RouterLink class="button" :to="{ name: 'flights' }">Search flights</RouterLink>
  </div>

  <template v-else>
    <CheckoutSteps :steps="STEPS" :current="step" />
    <div v-if="message" class="alert alert--error" role="alert">{{ message }}</div>

    <!-- 1. Flights and trip -->
    <section v-if="step === 0" class="card" aria-label="Flights">
      <h2>Your flights</h2>
      <ul class="checkout-legs">
        <li v-for="(flight, i) in legs" :key="flight.id" data-testid="checkout-leg">
          <span class="kind">{{ i === 0 ? 'Outbound' : 'Return' }}</span>
          <strong>{{ flight.origin }} → {{ flight.destination }}</strong>
          <span class="muted"> · {{ flight.airline }} {{ flight.flightNo }}</span>
          <div class="small">
            {{ formatDate(utcDay(flight.departAt)) }}, {{ formatTimeUtc(flight.departAt) }} →
            {{ formatTimeUtc(flight.arriveAt) }} · {{ formatDuration(flight.durationMin) }} ·
            {{ stopsLabel(flight.stops) }}
          </div>
          <div class="small">
            {{ formatMoney(flight.price) }} per passenger · {{ flight.seatsAvailable }} seats left
          </div>
        </li>
      </ul>
      <div class="form-grid">
        <div class="field">
          <label for="checkout-passengers">Passengers</label>
          <input
            id="checkout-passengers"
            type="number"
            min="1"
            :max="MAX_PASSENGERS"
            :value="passengerCount"
            @change="setPassengerCount(Number(($event.target as HTMLInputElement).value))"
          />
        </div>
        <CheckoutTripSelect v-model="tripId" :days="departureDays" :error="errors.tripId" />
      </div>
      <div class="row checkout-nav">
        <RouterLink class="button" :to="{ name: 'flights' }">Back to search</RouterLink>
        <button type="button" class="primary" data-testid="next" @click="toPassengers">
          Continue to passengers
        </button>
      </div>
    </section>

    <!-- 2. Passenger details -->
    <form
      v-else-if="step === 1"
      class="card"
      aria-label="Passenger details"
      novalidate
      @submit.prevent="toReview"
    >
      <h2>Passenger details</h2>
      <p class="muted small">
        Enter names exactly as on each passport. Carry-on and a personal item are included; checked
        bags are charged per passenger on each flight.
      </p>
      <p v-if="errors.passengers" class="field__error" data-testid="passengers-error">
        {{ errors.passengers }}
      </p>
      <fieldset
        v-for="(p, i) in passengers"
        :key="i"
        class="checkout-passenger"
        data-testid="passenger"
      >
        <legend>Passenger {{ i + 1 }}</legend>
        <div class="form-grid">
          <div class="field" :class="{ 'field--error': errors[`passengers.${i}.fullName`] }">
            <label :for="`p${i}-name`">Full name</label>
            <input :id="`p${i}-name`" v-model="p.fullName" type="text" autocomplete="name" />
            <p v-if="errors[`passengers.${i}.fullName`]" class="field__error">
              {{ errors[`passengers.${i}.fullName`] }}
            </p>
          </div>
          <div class="field" :class="{ 'field--error': errors[`passengers.${i}.dateOfBirth`] }">
            <label :for="`p${i}-dob`">Date of birth</label>
            <input :id="`p${i}-dob`" v-model="p.dateOfBirth" type="date" :max="today" />
            <p v-if="errors[`passengers.${i}.dateOfBirth`]" class="field__error">
              {{ errors[`passengers.${i}.dateOfBirth`] }}
            </p>
          </div>
          <div class="field">
            <label :for="`p${i}-seat`">Seat preference</label>
            <select :id="`p${i}-seat`" v-model="p.seat">
              <option v-for="(label, value) in SEAT_LABELS" :key="value" :value="value">
                {{ label }}
              </option>
            </select>
          </div>
          <div class="field">
            <label :for="`p${i}-bags`">Baggage</label>
            <select :id="`p${i}-bags`" v-model.number="p.checkedBags">
              <option v-for="o in BAG_OPTIONS" :key="o.value" :value="o.value">
                {{ o.label }}
              </option>
            </select>
          </div>
        </div>
      </fieldset>
      <div class="row checkout-nav">
        <button type="button" @click="back">Back</button>
        <button type="submit" class="primary" :disabled="busy" data-testid="next">
          {{ busy ? 'Pricing…' : 'Review fare' }}
        </button>
      </div>
    </form>

    <!-- 3. Fare summary -->
    <section v-else-if="step === 2 && quote" class="card" aria-label="Fare summary">
      <h2>Fare summary</h2>
      <div v-for="(leg, i) in quote.legs" :key="leg.flight.id" class="checkout-review">
        <h3>
          {{ i === 0 ? 'Outbound' : 'Return' }}: {{ leg.flight.origin }} →
          {{ leg.flight.destination }}
          <span class="muted small">
            {{ leg.flight.airline }} {{ leg.flight.flightNo }} ·
            {{ formatDate(utcDay(leg.flight.departAt)) }}
          </span>
        </h3>
        <table class="line-items" data-testid="fare-lines">
          <tbody>
            <tr>
              <td>
                Fare: {{ plural(leg.price.passengers, 'passenger') }} ×
                {{ formatMoney(leg.flight.price) }}
              </td>
              <td>{{ formatMoney(leg.price.fare) }}</td>
            </tr>
            <tr>
              <td>Taxes and fees (7.5%)</td>
              <td>{{ formatMoney(leg.price.taxes) }}</td>
            </tr>
            <tr>
              <td>
                Baggage:
                {{
                  leg.price.checkedBags > 0
                    ? plural(leg.price.checkedBags, 'checked bag')
                    : 'carry-on only'
                }}
              </td>
              <td>{{ formatMoney(leg.price.baggage) }}</td>
            </tr>
            <tr class="total">
              <td>Flight total</td>
              <td>{{ formatMoney(leg.price.total) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <h3>Passengers</h3>
      <ul class="checkout-list">
        <li v-for="(p, i) in quote.passengers" :key="i">
          <strong>{{ p.fullName }}</strong>
          <span class="muted small">
            · born {{ p.dateOfBirth }} · {{ SEAT_LABELS[p.seat] }} seat ·
            {{ p.checkedBags > 0 ? plural(p.checkedBags, 'checked bag') : 'carry-on only' }}
          </span>
        </li>
      </ul>
      <p class="checkout-total" data-testid="quote-total">Total {{ formatMoney(quote.total) }}</p>
      <div class="row checkout-nav">
        <button type="button" :disabled="busy" @click="back">Back</button>
        <button
          type="button"
          class="primary"
          :disabled="busy"
          data-testid="confirm"
          @click="confirm"
        >
          {{ busy ? 'Booking…' : 'Confirm and continue to payment' }}
        </button>
      </div>
      <p class="muted small">
        Seat preferences are passed to the airline and are not guaranteed. Seats are held when the
        trip is paid for.
      </p>
    </section>

    <!-- 4. Payment, through the trip -->
    <CheckoutPayment
      v-else-if="step === 3 && tripId !== null"
      :trip-id="tripId"
      :booked="plural(legs.length, 'flight')"
      :search-again="searchAgain"
    />
  </template>
</template>
