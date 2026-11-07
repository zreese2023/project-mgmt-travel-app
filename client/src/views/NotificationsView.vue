<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { AppNotification } from '../api/types';
import { useNotificationsStore } from '../stores/notifications';
import { errorMessage } from '../utils/errors';
import { plural } from '../utils/format';

const store = useNotificationsStore();
const loading = ref(true);
const error = ref<string | null>(null);
const message = ref<string | null>(null);

const ICONS: Record<AppNotification['type'], string> = {
  weather: '⛈️',
  advisory: '⚠️',
  delay: '✈️',
};

async function load(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    await store.refresh();
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    loading.value = false;
  }
}

async function check(): Promise<void> {
  error.value = null;
  message.value = null;
  try {
    const created = await store.scan();
    message.value =
      created === 0
        ? 'No new alerts for your upcoming trips.'
        : `${plural(created, 'new alert')} found.`;
  } catch (err) {
    error.value = errorMessage(err);
  }
}

async function markAll(): Promise<void> {
  try {
    await store.markAllRead();
  } catch (err) {
    error.value = errorMessage(err);
  }
}

onMounted(load);
</script>

<template>
  <div class="row row--between">
    <h1>Alerts</h1>
    <div class="row">
      <button type="button" :disabled="store.scanning" data-testid="check-alerts" @click="check">
        {{ store.scanning ? 'Checking…' : 'Check my trips for alerts' }}
      </button>
      <button
        type="button"
        :disabled="store.unread === 0"
        data-testid="mark-all-read"
        @click="markAll"
      >
        Mark all as read
      </button>
    </div>
  </div>
  <p class="muted small">
    Alerts cover your upcoming trips: severe weather in the 5-day forecast, a U.S. State Department
    advisory at level 3 or 4, and delayed or cancelled flights (flight status is sample data). Each
    alert also creates a simulated email in the database; nothing is actually sent.
  </p>

  <div v-if="message" class="alert alert--success" role="status" data-testid="scan-result">
    {{ message }}
  </div>
  <p v-if="loading" class="status">Loading alerts…</p>
  <div v-else-if="error" class="alert alert--error" role="alert">
    {{ error }} <button type="button" class="button--small" @click="load">Try again</button>
  </div>
  <p v-else-if="store.items.length === 0" class="status" data-testid="no-notifications">
    You have no alerts. Add trips and use “Check my trips for alerts”.
  </p>
  <ul v-else class="timeline" aria-label="Alerts">
    <li
      v-for="n in store.items"
      :key="n.id"
      class="card"
      :style="{ fontWeight: n.read ? 400 : 600 }"
      data-testid="notification"
    >
      <span aria-hidden="true">{{ ICONS[n.type] }}</span>
      <strong> {{ n.title }}</strong>
      <span v-if="!n.read" class="chip">New</span>
      <p style="margin: 0.25rem 0">{{ n.body }}</p>
      <span class="muted small">{{ n.createdAt.slice(0, 16).replace('T', ' ') }} UTC</span>
    </li>
  </ul>
</template>
