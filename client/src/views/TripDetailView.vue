<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { ApiError } from '../api/client';
import { endpoints } from '../api/endpoints';
import type { Activity, ItineraryItem, TripDetail } from '../api/types';
import { useTripsStore } from '../stores/trips';
import { errorMessage, fieldErrors } from '../utils/errors';
import { formatClock, formatDate, formatDuration, plural, titleCase } from '../utils/format';

const route = useRoute();
const trips = useTripsStore();
const tripId = computed(() => Number(route.params.id));

const detail = ref<TripDetail | null>(null);
const suggestions = ref<Activity[]>([]);
const loading = ref(true);
const notFound = ref(false);
const error = ref<string | null>(null);
const message = ref<{ kind: 'success' | 'error'; text: string } | null>(null);

// Add-item form
const newKind = ref<'activity' | 'note'>('activity');
const newTitle = ref('');
const newDay = ref('');
const newTime = ref('');
const newNotes = ref('');
const adding = ref(false);
const addErrors = ref<Record<string, string>>({});

// Suggested activity form
const suggestDay = ref('');

// Inline edit
const editingId = ref<number | null>(null);
const editTitle = ref('');
const editDay = ref('');
const editTime = ref('');
const editNotes = ref('');

const tripDays = computed(() => detail.value?.days.filter((d) => d.dayNumber !== null) ?? []);

async function load(): Promise<void> {
  error.value = null;
  try {
    detail.value = await endpoints.trips.get(tripId.value);
    trips.setActive(tripId.value);
    if (!newDay.value) newDay.value = detail.value.trip.startDate;
    if (!suggestDay.value) suggestDay.value = detail.value.trip.startDate;
    if (suggestions.value.length === 0) {
      const destination = await endpoints.destinations.get(detail.value.trip.destination.slug);
      suggestions.value = destination.destination.activities;
    }
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound.value = true;
    else error.value = errorMessage(err);
  } finally {
    loading.value = false;
  }
}

async function addCustom(): Promise<void> {
  adding.value = true;
  addErrors.value = {};
  message.value = null;
  try {
    await endpoints.trips.addItem(tripId.value, {
      kind: newKind.value,
      title: newTitle.value,
      day: newDay.value,
      ...(newTime.value ? { startTime: newTime.value } : {}),
      ...(newNotes.value ? { notes: newNotes.value } : {}),
    });
    newTitle.value = '';
    newTime.value = '';
    newNotes.value = '';
    message.value = { kind: 'success', text: 'Added to your itinerary.' };
    await load();
  } catch (err) {
    addErrors.value = fieldErrors(err);
    message.value = { kind: 'error', text: errorMessage(err) };
  } finally {
    adding.value = false;
  }
}

async function addSuggestion(activity: Activity): Promise<void> {
  message.value = null;
  try {
    await endpoints.trips.addItem(tripId.value, {
      kind: 'activity',
      activityId: activity.id,
      day: suggestDay.value,
    });
    message.value = { kind: 'success', text: `Added “${activity.name}” to your itinerary.` };
    await load();
  } catch (err) {
    message.value = { kind: 'error', text: errorMessage(err) };
  }
}

async function remove(item: ItineraryItem): Promise<void> {
  message.value = null;
  try {
    await endpoints.trips.removeItem(tripId.value, item.id);
    await load();
  } catch (err) {
    message.value = { kind: 'error', text: errorMessage(err) };
  }
}

function startEdit(item: ItineraryItem): void {
  editingId.value = item.id;
  editTitle.value = item.title;
  editDay.value = item.day;
  editTime.value = item.startTime ?? '';
  editNotes.value = item.notes ?? '';
}

async function saveEdit(item: ItineraryItem): Promise<void> {
  message.value = null;
  try {
    await endpoints.trips.updateItem(tripId.value, item.id, {
      title: editTitle.value,
      day: editDay.value,
      startTime: editTime.value || null,
      notes: editNotes.value || null,
    });
    editingId.value = null;
    await load();
  } catch (err) {
    message.value = { kind: 'error', text: errorMessage(err) };
  }
}

async function move(item: ItineraryItem, direction: 'up' | 'down'): Promise<void> {
  message.value = null;
  try {
    await endpoints.trips.moveItem(tripId.value, item.id, direction);
    await load();
  } catch (err) {
    message.value = { kind: 'error', text: errorMessage(err) };
  }
}

onMounted(load);
</script>

<template>
  <p v-if="loading" class="status">Loading itinerary…</p>
  <div v-else-if="notFound" class="card">
    <h1>Trip not found</h1>
    <RouterLink :to="{ name: 'trips' }">Back to my trips</RouterLink>
  </div>
  <div v-else-if="error" class="alert alert--error" role="alert">
    {{ error }} <button type="button" class="button--small" @click="load">Try again</button>
  </div>

  <template v-else-if="detail">
    <div class="row row--between">
      <div>
        <h1>{{ detail.trip.name }}</h1>
        <p class="muted">
          <RouterLink
            :to="{ name: 'destination', params: { slug: detail.trip.destination.slug } }"
            >{{ detail.trip.destination.name }}</RouterLink
          >
          · {{ formatDate(detail.trip.startDate) }} to {{ formatDate(detail.trip.endDate) }}
        </p>
      </div>
      <div class="row">
        <RouterLink
          class="button"
          :to="{
            name: 'flights',
            query: {
              destination: detail.trip.destination.airportCode,
              depart: detail.trip.startDate,
              return: detail.trip.endDate,
            },
          }"
        >
          Find flights
        </RouterLink>
        <RouterLink
          class="button"
          :to="{
            name: 'hotels',
            query: {
              destination: detail.trip.destination.slug,
              checkIn: detail.trip.startDate,
              checkOut: detail.trip.endDate,
            },
          }"
        >
          Find hotels
        </RouterLink>
      </div>
    </div>

    <section class="card" aria-label="Trip summary" data-testid="trip-summary">
      <strong>Summary:</strong>
      {{ plural(detail.summary.days, 'day') }} · {{ plural(detail.summary.items, 'item') }} planned
      · {{ detail.summary.byKind.flight }} flights · {{ detail.summary.byKind.hotel }} stays ·
      {{ detail.summary.byKind.activity }} activities · {{ detail.summary.byKind.note }} notes ·
      Your itinerary is saved to your account automatically.
    </section>

    <div v-if="message" class="alert" :class="`alert--${message.kind}`" role="status">
      {{ message.text }}
    </div>

    <div
      class="grid"
      style="margin-top: 1rem; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr))"
    >
      <form class="card" aria-label="Add to itinerary" @submit.prevent="addCustom">
        <h2>Add to your itinerary</h2>
        <div class="field">
          <label for="item-kind">Type</label>
          <select id="item-kind" v-model="newKind">
            <option value="activity">Activity</option>
            <option value="note">Note</option>
          </select>
        </div>
        <div class="field" :class="{ 'field--error': addErrors.title }">
          <label for="item-title">What are you doing?</label>
          <input
            id="item-title"
            v-model="newTitle"
            type="text"
            placeholder="Visit Shibuya station"
            required
          />
          <p v-if="addErrors.title" class="field__error">{{ addErrors.title }}</p>
        </div>
        <div class="form-grid">
          <div class="field" :class="{ 'field--error': addErrors.day }">
            <label for="item-day">Day</label>
            <select id="item-day" v-model="newDay">
              <option v-for="d in tripDays" :key="d.day" :value="d.day">
                Day {{ d.dayNumber }}: {{ formatDate(d.day) }}
              </option>
            </select>
          </div>
          <div class="field" :class="{ 'field--error': addErrors.startTime }">
            <label for="item-time">Time (optional)</label>
            <input id="item-time" v-model="newTime" type="time" />
          </div>
        </div>
        <div class="field">
          <label for="item-notes">Notes (optional)</label>
          <input id="item-notes" v-model="newNotes" type="text" />
        </div>
        <button type="submit" class="primary" :disabled="adding" data-testid="add-item">
          {{ adding ? 'Adding…' : 'Add' }}
        </button>
      </form>

      <section class="card" aria-label="Suggested activities">
        <h2>Ideas for {{ detail.trip.destination.name }}</h2>
        <div class="field">
          <label for="suggest-day">Add to day</label>
          <select id="suggest-day" v-model="suggestDay">
            <option v-for="d in tripDays" :key="d.day" :value="d.day">
              Day {{ d.dayNumber }}: {{ formatDate(d.day) }}
            </option>
          </select>
        </div>
        <ul class="timeline">
          <li
            v-for="activity in suggestions"
            :key="activity.id"
            class="timeline__item"
            style="grid-template-columns: 1fr auto"
          >
            <div>
              <strong>{{ activity.name }}</strong>
              <div class="muted small">
                {{ titleCase(activity.category) }} · {{ formatDuration(activity.durationMin) }}
              </div>
            </div>
            <button type="button" class="button--small" @click="addSuggestion(activity)">
              Add
            </button>
          </li>
        </ul>
      </section>
    </div>

    <section
      v-for="day in detail.days"
      :key="day.day"
      class="day"
      :aria-label="`Day ${day.dayNumber ?? ''} ${day.day}`"
      data-testid="day"
    >
      <h3>
        <template v-if="day.dayNumber !== null">Day {{ day.dayNumber }}: </template
        >{{ formatDate(day.day) }}
        <span v-if="day.dayNumber === null" class="chip">outside trip dates</span>
      </h3>
      <p v-if="day.items.length === 0" class="muted small">Nothing planned yet.</p>
      <ul v-else class="timeline">
        <li
          v-for="(item, index) in day.items"
          :key="item.id"
          class="timeline__item"
          data-testid="itinerary-item"
        >
          <span class="timeline__time">{{
            item.startTime ? formatClock(item.startTime) : 'Anytime'
          }}</span>
          <div v-if="editingId !== item.id">
            <span class="kind">{{ item.kind }}</span>
            <strong>{{ item.title }}</strong>
            <div v-if="item.notes" class="muted small">{{ item.notes }}</div>
          </div>
          <form v-else class="stack" @submit.prevent="saveEdit(item)">
            <input v-model="editTitle" type="text" aria-label="Title" required />
            <div class="row">
              <select v-model="editDay" aria-label="Day" style="max-width: 14rem">
                <option v-for="d in tripDays" :key="d.day" :value="d.day">
                  Day {{ d.dayNumber }}: {{ formatDate(d.day) }}
                </option>
              </select>
              <input v-model="editTime" type="time" aria-label="Time" style="max-width: 9rem" />
            </div>
            <input v-model="editNotes" type="text" aria-label="Notes" placeholder="Notes" />
            <div class="row">
              <button type="submit" class="primary button--small">Save</button>
              <button type="button" class="button--small" @click="editingId = null">Cancel</button>
            </div>
          </form>
          <div v-if="editingId !== item.id" class="row">
            <button
              type="button"
              class="button--small"
              :aria-label="`Move ${item.title} up`"
              :disabled="index === 0"
              @click="move(item, 'up')"
            >
              ↑
            </button>
            <button
              type="button"
              class="button--small"
              :aria-label="`Move ${item.title} down`"
              :disabled="index === day.items.length - 1"
              @click="move(item, 'down')"
            >
              ↓
            </button>
            <button
              type="button"
              class="button--small"
              :aria-label="`Edit ${item.title}`"
              @click="startEdit(item)"
            >
              Edit
            </button>
            <button
              type="button"
              class="button--small button--danger"
              :aria-label="`Remove ${item.title}`"
              @click="remove(item)"
            >
              Remove
            </button>
          </div>
        </li>
      </ul>
    </section>
  </template>
</template>
