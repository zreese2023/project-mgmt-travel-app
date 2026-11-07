<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { endpoints } from '../api/endpoints';
import type { Hotel, HotelCheckout, HotelQuote, RoomRequest } from '../api/types';
import CheckoutPayment from '../components/CheckoutPayment.vue';
import CheckoutSteps from '../components/CheckoutSteps.vue';
import CheckoutTripSelect from '../components/CheckoutTripSelect.vue';
import SampleDataNotice from '../components/SampleDataNotice.vue';
import { useAuthStore } from '../stores/auth';
import { useTripsStore } from '../stores/trips';
import { MAX_ROOMS, ROOM_REQUEST_OPTIONS, guestErrors, requestLabel } from '../utils/checkout';
import { isIsoDate } from '../utils/dates';
import { errorMessage, fieldErrors } from '../utils/errors';
import { formatDate, formatMoney, plural } from '../utils/format';

/** SCRUM-16: choose a room → guest details and requests → review the bill → pay (through the trip). */
const STEPS = ['Room', 'Guest & requests', 'Review bill', 'Payment'] as const;

const route = useRoute();
const auth = useAuthStore();
const trips = useTripsStore();

const queryString = (key: string): string =>
  typeof route.query[key] === 'string' ? (route.query[key] as string) : '';
const hotelId = Number(route.query.hotel);
const checkIn = queryString('checkIn');
const checkOut = queryString('checkOut');

const step = ref(0);
const loading = ref(true);
const loadError = ref<string | null>(null);
const hotel = ref<Hotel | null>(null);
const tripId = ref<number | null>(null);
const roomTypeId = ref<number | null>(Number(route.query.room) || null);
const rooms = ref(1);
const guests = ref(Math.max(1, Number(route.query.guests) || 2));
const guest = ref({ fullName: auth.user?.name ?? '', email: auth.user?.email ?? '', phone: '' });
const requests = ref<RoomRequest[]>([]);
const requestNote = ref('');
const errors = ref<Record<string, string>>({});
const message = ref<string | null>(null);
const busy = ref(false);
const quote = ref<HotelQuote | null>(null);

const room = computed(() => hotel.value?.rooms.find((r) => r.id === roomTypeId.value) ?? null);
const sleeps = computed(() => (room.value ? room.value.capacity * rooms.value : 0));
const selection = computed<HotelCheckout | null>(() =>
  hotel.value && roomTypeId.value !== null
    ? {
        hotelId: hotel.value.id,
        roomTypeId: roomTypeId.value,
        checkIn,
        checkOut,
        rooms: rooms.value,
        guests: guests.value,
        requests: requests.value,
      }
    : null,
);
const searchAgain = computed(() => ({
  label: 'Find more hotels',
  to: hotel.value
    ? `/hotels?destination=${hotel.value.destinationSlug}&checkIn=${checkIn}&checkOut=${checkOut}`
    : '/hotels',
}));

function fail(err: unknown): void {
  errors.value = fieldErrors(err);
  message.value =
    Object.keys(errors.value).length > 0 ? 'Check the highlighted details.' : errorMessage(err);
}

function toGuest(): void {
  message.value = null;
  const found: Record<string, string> = {};
  if (!room.value) found.roomTypeId = 'Choose a room';
  else if (guests.value > sleeps.value) {
    found.guests = `${plural(rooms.value, 'room')} of this type sleep at most ${sleeps.value}. Add a room or choose a larger one.`;
  }
  if (tripId.value === null) found.tripId = 'Choose the trip this stay is for';
  errors.value = found;
  if (Object.keys(found).length === 0) step.value = 1;
}

async function toReview(): Promise<void> {
  message.value = null;
  errors.value = guestErrors(guest.value);
  if (Object.keys(errors.value).length > 0 || !selection.value) {
    message.value = 'Check the highlighted details.';
    return;
  }
  busy.value = true;
  try {
    quote.value = (await endpoints.checkout.quoteHotel(selection.value)).quote;
    step.value = 2;
  } catch (err) {
    fail(err);
  } finally {
    busy.value = false;
  }
}

async function confirm(): Promise<void> {
  if (tripId.value === null || !selection.value) return;
  message.value = null;
  busy.value = true;
  try {
    quote.value = (
      await endpoints.checkout.bookHotel(tripId.value, {
        ...selection.value,
        guest: guest.value,
        ...(requestNote.value.trim() ? { requestNote: requestNote.value.trim() } : {}),
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
  if (!Number.isInteger(hotelId) || !isIsoDate(checkIn) || !isIsoDate(checkOut)) {
    loadError.value = 'Choose a hotel and dates to book first.';
    loading.value = false;
    return;
  }
  try {
    const [result] = await Promise.all([
      endpoints.travel.hotel(hotelId, { checkIn, checkOut }),
      trips.loaded ? Promise.resolve() : trips.load(),
    ]);
    hotel.value = result.hotel;
    if (!room.value) roomTypeId.value = result.hotel.rooms[0]?.id ?? null;
  } catch (err) {
    loadError.value = errorMessage(err);
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <h1>Book a hotel</h1>
  <SampleDataNotice what="Hotels, rooms and prices" />

  <p v-if="loading" class="status">Loading the hotel…</p>
  <div v-else-if="loadError || !hotel" class="card">
    <p class="alert alert--error" role="alert">{{ loadError ?? 'Hotel not found' }}</p>
    <RouterLink class="button" :to="{ name: 'hotels' }">Search hotels</RouterLink>
  </div>

  <template v-else>
    <CheckoutSteps :steps="STEPS" :current="step" />
    <div v-if="message" class="alert alert--error" role="alert">{{ message }}</div>

    <section class="card checkout-hotel" aria-label="Hotel">
      <img :src="hotel.imageUrl" :alt="`${hotel.destinationName}, sample illustration`" />
      <div>
        <div class="row row--between">
          <h2>{{ hotel.name }}</h2>
          <span class="chip">★ {{ hotel.rating.toFixed(1) }}</span>
        </div>
        <p class="muted small">{{ hotel.address }}</p>
        <p class="small">
          {{ formatDate(checkIn) }} to {{ formatDate(checkOut) }} ·
          {{ plural(hotel.nights, 'night') }}
        </p>
      </div>
    </section>

    <!-- 1. Room -->
    <section v-if="step === 0" class="card" aria-label="Choose a room">
      <h2>Choose a room</h2>
      <fieldset class="checkout-rooms" :class="{ 'field--error': errors.roomTypeId }">
        <legend class="sr-only">Room type</legend>
        <label
          v-for="r in hotel.rooms"
          :key="r.id"
          class="checkout-room"
          :class="{ 'checkout-room--selected': r.id === roomTypeId }"
          data-testid="room-choice"
        >
          <input v-model="roomTypeId" type="radio" name="room" :value="r.id" />
          <span>
            <strong>{{ r.name }}</strong>
            <span class="muted small"> · sleeps {{ r.capacity }}</span>
          </span>
          <span class="small checkout-room__price">
            {{ formatMoney(r.nightlyPrice) }} a night ·
            <strong>{{ formatMoney(r.price.total) }}</strong> for the stay
          </span>
        </label>
      </fieldset>
      <p v-if="errors.roomTypeId" class="field__error">{{ errors.roomTypeId }}</p>
      <div class="form-grid">
        <div class="field">
          <label for="checkout-rooms">Rooms</label>
          <select id="checkout-rooms" v-model.number="rooms">
            <option v-for="n in MAX_ROOMS" :key="n" :value="n">{{ n }}</option>
          </select>
        </div>
        <div class="field" :class="{ 'field--error': errors.guests }">
          <label for="checkout-guests">Guests</label>
          <input id="checkout-guests" v-model.number="guests" type="number" min="1" max="16" />
          <p v-if="errors.guests" class="field__error">{{ errors.guests }}</p>
        </div>
        <CheckoutTripSelect v-model="tripId" :days="[checkIn]" :error="errors.tripId" />
      </div>
      <div class="row checkout-nav">
        <RouterLink class="button" :to="searchAgain.to">Back to search</RouterLink>
        <button type="button" class="primary" data-testid="next" @click="toGuest">
          Continue to guest details
        </button>
      </div>
    </section>

    <!-- 2. Guest contact and special requests -->
    <form
      v-else-if="step === 1"
      class="card"
      aria-label="Guest details"
      novalidate
      @submit.prevent="toReview"
    >
      <h2>Guest details</h2>
      <div class="form-grid">
        <div class="field" :class="{ 'field--error': errors.fullName }">
          <label for="guest-name">Full name</label>
          <input id="guest-name" v-model="guest.fullName" type="text" autocomplete="name" />
          <p v-if="errors.fullName" class="field__error">{{ errors.fullName }}</p>
        </div>
        <div class="field" :class="{ 'field--error': errors.email }">
          <label for="guest-email">Email</label>
          <input id="guest-email" v-model="guest.email" type="email" autocomplete="email" />
          <p v-if="errors.email" class="field__error">{{ errors.email }}</p>
        </div>
        <div class="field" :class="{ 'field--error': errors.phone }">
          <label for="guest-phone">Phone</label>
          <input id="guest-phone" v-model="guest.phone" type="tel" autocomplete="tel" />
          <p v-if="errors.phone" class="field__error">{{ errors.phone }}</p>
        </div>
      </div>
      <fieldset class="field">
        <legend>Special requests</legend>
        <div class="check-row">
          <label v-for="o in ROOM_REQUEST_OPTIONS" :key="o.value">
            <input v-model="requests" type="checkbox" :value="o.value" />
            {{ o.label }}<span v-if="o.fee" class="muted small"> ({{ o.fee }})</span>
          </label>
        </div>
        <p class="muted small">Free requests are passed to the hotel and depend on availability.</p>
      </fieldset>
      <div class="field">
        <label for="guest-note">Anything else the hotel should know? (optional)</label>
        <textarea id="guest-note" v-model="requestNote" rows="2" maxlength="500" />
      </div>
      <div class="row checkout-nav">
        <button type="button" @click="back">Back</button>
        <button type="submit" class="primary" :disabled="busy" data-testid="next">
          {{ busy ? 'Pricing…' : 'Review bill' }}
        </button>
      </div>
    </form>

    <!-- 3. Bill -->
    <section v-else-if="step === 2 && quote" class="card" aria-label="Hotel bill">
      <h2>Your bill</h2>
      <table class="line-items" data-testid="bill-lines">
        <tbody>
          <tr>
            <td>
              {{ quote.room.name }}: {{ plural(quote.bill.rooms, 'room') }} ×
              {{ plural(quote.bill.nights, 'night') }} × {{ formatMoney(quote.bill.nightlyPrice) }}
            </td>
            <td>{{ formatMoney(quote.bill.roomSubtotal) }}</td>
          </tr>
          <tr v-for="fee in quote.bill.fees" :key="fee.request">
            <td>{{ requestLabel(fee.request) }}</td>
            <td>{{ formatMoney(fee.amount) }}</td>
          </tr>
          <tr>
            <td>Taxes (12%)</td>
            <td>{{ formatMoney(quote.bill.taxes) }}</td>
          </tr>
          <tr class="total">
            <td>Total</td>
            <td data-testid="quote-total">{{ formatMoney(quote.bill.total) }}</td>
          </tr>
        </tbody>
      </table>
      <dl class="receipt checkout-summary">
        <div>
          <dt>Guest</dt>
          <dd>
            {{ guest.fullName }}<br /><span class="small"
              >{{ guest.email }} · {{ guest.phone }}</span
            >
          </dd>
        </div>
        <div>
          <dt>Stay</dt>
          <dd>
            {{ formatDate(quote.checkIn) }} to {{ formatDate(quote.checkOut) }} ·
            {{ plural(quote.guests, 'guest') }}
          </dd>
        </div>
        <div>
          <dt>Requests</dt>
          <dd>
            {{ quote.requests.length ? quote.requests.map(requestLabel).join(', ') : 'None' }}
            <span v-if="requestNote.trim()" class="small"><br />“{{ requestNote.trim() }}”</span>
          </dd>
        </div>
      </dl>
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
    </section>

    <!-- 4. Payment, through the trip -->
    <CheckoutPayment
      v-else-if="step === 3 && tripId !== null"
      :trip-id="tripId"
      :booked="`${quote?.room.name ?? 'your room'} at ${hotel.name}`"
      :search-again="searchAgain"
    />
  </template>
</template>
