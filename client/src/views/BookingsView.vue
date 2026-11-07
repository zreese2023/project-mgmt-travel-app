<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { endpoints } from '../api/endpoints';
import type { Booking, BookingScope, BookingSort, SortOrder } from '../api/types';
import SampleDataNotice from '../components/SampleDataNotice.vue';
import { useTripsStore } from '../stores/trips';
import { errorMessage, fieldErrors } from '../utils/errors';
import { formatDate, formatMoney, plural } from '../utils/format';

const trips = useTripsStore();

const bookings = ref<Booking[]>([]);
const sort = ref<BookingSort>('date');
const order = ref<SortOrder>('asc');
const scope = ref<BookingScope>('all');
const loading = ref(true);
const error = ref<string | null>(null);
const message = ref<{ kind: 'success' | 'error'; text: string } | null>(null);

// Inline "change dates" form
const editingId = ref<number | null>(null);
const checkIn = ref('');
const checkOut = ref('');
const stayErrors = ref<Record<string, string>>({});
const saving = ref(false);

const COLUMNS: Array<{ key: BookingSort; label: string }> = [
  { key: 'trip', label: 'Trip' },
  { key: 'type', label: 'Type' },
  { key: 'date', label: 'Dates' },
  { key: 'price', label: 'Price' },
  { key: 'status', label: 'Status' },
];

async function load(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    bookings.value = (
      await endpoints.bookings.list({ sort: sort.value, order: order.value, scope: scope.value })
    ).bookings;
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    loading.value = false;
  }
}

/** Clicking the active column flips the direction; clicking another sorts by it ascending. */
function sortBy(key: BookingSort): void {
  if (sort.value === key) order.value = order.value === 'asc' ? 'desc' : 'asc';
  else {
    sort.value = key;
    order.value = 'asc';
  }
}

function ariaSort(key: BookingSort): 'ascending' | 'descending' | 'none' {
  if (sort.value !== key) return 'none';
  return order.value === 'asc' ? 'ascending' : 'descending';
}

function startEdit(booking: Booking): void {
  editingId.value = booking.id;
  checkIn.value = booking.startDate;
  checkOut.value = booking.endDate;
  stayErrors.value = {};
  message.value = null;
}

async function saveStay(booking: Booking): Promise<void> {
  saving.value = true;
  stayErrors.value = {};
  message.value = null;
  try {
    const { booking: updated } = await endpoints.bookings.changeStay(booking.id, {
      checkIn: checkIn.value,
      checkOut: checkOut.value,
    });
    editingId.value = null;
    message.value = {
      kind: 'success',
      text: `Dates changed: ${plural(updated.nights ?? 1, 'night')}, now ${formatMoney(updated.amount)}.`,
    };
    await load();
  } catch (err) {
    stayErrors.value = fieldErrors(err);
    message.value = { kind: 'error', text: errorMessage(err) };
  } finally {
    saving.value = false;
  }
}

async function remove(booking: Booking): Promise<void> {
  if (!window.confirm(`Remove "${booking.title}" from "${booking.tripName}"?`)) return;
  message.value = null;
  try {
    await endpoints.bookings.remove(booking.id);
    message.value = { kind: 'success', text: `Removed "${booking.title}".` };
    await load();
    await trips.load().catch(() => undefined);
  } catch (err) {
    message.value = { kind: 'error', text: errorMessage(err) };
  }
}

watch([sort, order, scope], load);
onMounted(load);
</script>

<template>
  <h1>My bookings</h1>
  <SampleDataNotice what="Flights, hotels and prices" />
  <p class="muted small">
    Every flight and hotel on your trips. A booking is <strong>planned</strong> until its trip is
    paid for, then <strong>confirmed</strong>. Planned bookings can be removed, and hotel dates can
    be changed (the price updates). Paid trips are locked.
  </p>

  <div class="card row">
    <label for="booking-scope" style="margin: 0">Show</label>
    <select id="booking-scope" v-model="scope" style="max-width: 12rem">
      <option value="all">All bookings</option>
      <option value="upcoming">Upcoming</option>
      <option value="past">Past</option>
    </select>
    <span class="muted small" aria-live="polite" data-testid="booking-count">
      {{ loading ? 'Loading…' : plural(bookings.length, 'booking') }}
    </span>
  </div>

  <div v-if="message" class="alert" :class="`alert--${message.kind}`" role="status">
    {{ message.text }}
  </div>
  <div v-if="error" class="alert alert--error" role="alert">
    {{ error }} <button type="button" class="button--small" @click="load">Try again</button>
  </div>
  <p v-else-if="!loading && bookings.length === 0" class="status" data-testid="no-bookings">
    {{
      scope === 'all'
        ? 'You have no bookings yet. Add a flight or hotel to a trip and it will appear here.'
        : `You have no ${scope} bookings.`
    }}
  </p>

  <div v-else-if="bookings.length > 0" class="table-wrap">
    <table class="bookings" data-testid="bookings-table">
      <thead>
        <tr>
          <th
            v-for="column in COLUMNS"
            :key="column.key"
            scope="col"
            :aria-sort="ariaSort(column.key)"
          >
            <button
              type="button"
              class="sort-button"
              :data-testid="`sort-${column.key}`"
              @click="sortBy(column.key)"
            >
              {{ column.label }}
              <span aria-hidden="true">{{
                sort === column.key ? (order === 'asc' ? '▲' : '▼') : ''
              }}</span>
            </button>
          </th>
          <th scope="col">Actions</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="b in bookings" :key="b.id" data-testid="booking-row">
          <td>
            <RouterLink :to="{ name: 'trip', params: { id: b.tripId } }">{{
              b.tripName
            }}</RouterLink>
            <div class="muted small">{{ b.destination }}</div>
          </td>
          <td>
            <span class="kind">{{ b.kind }}</span>
          </td>
          <td>
            <strong>{{ b.title }}</strong>
            <div v-if="editingId !== b.id" class="muted small">
              {{ formatDate(b.startDate) }}
              <template v-if="b.kind === 'hotel'">
                to {{ formatDate(b.endDate) }} ({{ plural(b.nights ?? 1, 'night') }})
              </template>
              <span v-if="b.isPast" class="chip" data-testid="past-chip">Past</span>
            </div>
            <form
              v-else
              class="row"
              :aria-label="`Change dates for ${b.title}`"
              @submit.prevent="saveStay(b)"
            >
              <div class="field" :class="{ 'field--error': stayErrors.checkIn || stayErrors.day }">
                <label :for="`in-${b.id}`" class="small">Check-in</label>
                <input :id="`in-${b.id}`" v-model="checkIn" type="date" />
              </div>
              <div class="field" :class="{ 'field--error': stayErrors.checkOut }">
                <label :for="`out-${b.id}`" class="small">Check-out</label>
                <input :id="`out-${b.id}`" v-model="checkOut" type="date" :min="checkIn" />
              </div>
              <button type="submit" class="primary button--small" :disabled="saving">
                {{ saving ? 'Saving…' : 'Save' }}
              </button>
              <button type="button" class="button--small" @click="editingId = null">Cancel</button>
            </form>
          </td>
          <td data-testid="booking-amount">{{ formatMoney(b.amount) }}</td>
          <td>
            <span
              class="kind"
              :class="{ 'kind--booked': b.status === 'confirmed' }"
              data-testid="booking-status"
              >{{ b.status === 'confirmed' ? 'Confirmed' : 'Planned' }}</span
            >
            <div v-if="b.paidAt" class="muted small">Paid {{ b.paidAt.slice(0, 10) }}</div>
          </td>
          <td>
            <div class="row">
              <button
                v-if="b.canChangeDates && editingId !== b.id"
                type="button"
                class="button--small"
                :aria-label="`Change dates for ${b.title}`"
                @click="startEdit(b)"
              >
                Change dates
              </button>
              <button
                v-if="b.canRemove"
                type="button"
                class="button--small button--danger"
                :aria-label="`Remove ${b.title}`"
                @click="remove(b)"
              >
                Remove
              </button>
              <span v-if="!b.canRemove" class="muted small">Paid: locked</span>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
