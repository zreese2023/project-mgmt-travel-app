<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { endpoints } from '../api/endpoints';
import type { DestinationSummary, Hotel } from '../api/types';
import HotelCard from '../components/HotelCard.vue';
import SampleDataNotice from '../components/SampleDataNotice.vue';
import TripPicker from '../components/TripPicker.vue';
import { useTripsStore } from '../stores/trips';
import { addDays, defaultDates } from '../utils/dates';
import { errorMessage, fieldErrors } from '../utils/errors';
import { plural, titleCase } from '../utils/format';

const AMENITIES = ['wifi', 'pool', 'spa', 'gym', 'breakfast', 'bar'];

const route = useRoute();
const trips = useTripsStore();

const queryString = (key: string): string =>
  typeof route.query[key] === 'string' ? (route.query[key] as string) : '';

const destinations = ref<DestinationSummary[]>([]);
const destination = ref(queryString('destination'));
const checkIn = ref(queryString('checkIn') || defaultDates(3).start);
const checkOut = ref(queryString('checkOut') || addDays(checkIn.value, 3));
const guests = ref(Number(queryString('guests')) || 2);
const maxPrice = ref<number | null>(null);
const minRating = ref<number | null>(null);
const amenities = ref<string[]>([]);
const sort = ref<'price' | 'rating'>('price');

const hotels = ref<Hotel[]>([]);
const note = ref('');
const searched = ref(false);
const loading = ref(false);
const error = ref<string | null>(null);
const errors = ref<Record<string, string>>({});
const message = ref<{ kind: 'success' | 'error'; text: string } | null>(null);

async function search(): Promise<void> {
  loading.value = true;
  error.value = null;
  errors.value = {};
  message.value = null;
  try {
    const result = await endpoints.travel.hotels({
      destination: destination.value,
      checkIn: checkIn.value,
      checkOut: checkOut.value,
      guests: guests.value,
      sort: sort.value,
      ...(maxPrice.value ? { maxPrice: maxPrice.value } : {}),
      ...(minRating.value ? { minRating: minRating.value } : {}),
      ...(amenities.value.length ? { amenity: amenities.value } : {}),
    });
    hotels.value = result.hotels;
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

async function addToTrip(hotel: Hotel): Promise<void> {
  message.value = null;
  if (!trips.activeTripId) return;
  try {
    await endpoints.trips.addItem(trips.activeTripId, {
      kind: 'hotel',
      hotelId: hotel.id,
      checkIn: checkIn.value,
      checkOut: checkOut.value,
    });
    message.value = { kind: 'success', text: `Added ${hotel.name} to your trip.` };
  } catch (err) {
    message.value = { kind: 'error', text: errorMessage(err) };
  }
}

onMounted(async () => {
  try {
    destinations.value = (await endpoints.destinations.search()).destinations;
  } catch (err) {
    error.value = errorMessage(err);
  }
  if (destination.value && route.query.checkIn) void search();
});
</script>

<template>
  <h1>Hotels</h1>
  <SampleDataNotice what="Hotels, rooms and prices" />

  <form class="card" aria-label="Hotel search" @submit.prevent="search">
    <div class="form-grid">
      <div class="field" :class="{ 'field--error': errors.destination }">
        <label for="hotel-destination">Destination</label>
        <select id="hotel-destination" v-model="destination">
          <option value="">Choose a destination…</option>
          <option v-for="d in destinations" :key="d.slug" :value="d.slug">
            {{ d.name }}, {{ d.country }}
          </option>
        </select>
      </div>
      <div class="field" :class="{ 'field--error': errors.checkIn }">
        <label for="hotel-checkin">Check-in</label>
        <input id="hotel-checkin" v-model="checkIn" type="date" />
        <p v-if="errors.checkIn" class="field__error">{{ errors.checkIn }}</p>
      </div>
      <div class="field" :class="{ 'field--error': errors.checkOut }">
        <label for="hotel-checkout">Check-out</label>
        <input id="hotel-checkout" v-model="checkOut" type="date" :min="checkIn" />
        <p v-if="errors.checkOut" class="field__error">{{ errors.checkOut }}</p>
      </div>
      <div class="field" :class="{ 'field--error': errors.guests }">
        <label for="hotel-guests">Guests</label>
        <input id="hotel-guests" v-model.number="guests" type="number" min="1" max="8" />
        <p v-if="errors.guests" class="field__error">{{ errors.guests }}</p>
      </div>
      <div class="field">
        <label for="hotel-max">Max price a night</label>
        <input id="hotel-max" v-model.number="maxPrice" type="number" min="0" placeholder="Any" />
      </div>
      <div class="field">
        <label for="hotel-rating">Minimum rating</label>
        <select id="hotel-rating" v-model.number="minRating">
          <option :value="null">Any</option>
          <option :value="3">3+</option>
          <option :value="4">4+</option>
          <option :value="4.5">4.5+</option>
        </select>
      </div>
      <div class="field">
        <label for="hotel-sort">Sort by</label>
        <select id="hotel-sort" v-model="sort">
          <option value="price">Price</option>
          <option value="rating">Rating</option>
        </select>
      </div>
    </div>
    <fieldset class="field">
      <legend>Amenities</legend>
      <div class="check-row">
        <label v-for="a in AMENITIES" :key="a"
          ><input v-model="amenities" type="checkbox" :value="a" /> {{ titleCase(a) }}</label
        >
      </div>
    </fieldset>
    <button type="submit" class="primary" :disabled="loading || !destination">
      {{ loading ? 'Searching…' : 'Search hotels' }}
    </button>
  </form>

  <div v-if="error" class="alert alert--error" role="alert">{{ error }}</div>
  <div v-if="message" class="alert" :class="`alert--${message.kind}`" role="status">
    {{ message.text }}
  </div>

  <template v-if="searched">
    <TripPicker />
    <p class="muted small">{{ plural(hotels.length, 'hotel') }} found. {{ note }}</p>
    <p v-if="hotels.length === 0" class="status" data-testid="no-hotels">
      No hotels match those dates and filters. Try different dates or remove a filter.
    </p>
    <HotelCard
      v-for="hotel in hotels"
      :key="hotel.id"
      :hotel="hotel"
      :can-add-to-trip="trips.activeTripId !== null"
      @add-to-trip="addToTrip"
    />
  </template>
</template>
