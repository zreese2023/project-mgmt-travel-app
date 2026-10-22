<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import type { Weather } from '../api/types';
import { formatTemperature, weatherEmoji } from '../utils/presentation';
import WeatherPanel from './WeatherPanel.vue';

const props = defineProps<{
  weather: Weather | null;
  loading: boolean;
  placeName: string;
}>();

defineEmits<{ retry: [] }>();

const open = ref(false);

const label = computed(() => {
  if (props.loading) return 'Weather…';
  const w = props.weather;
  if (!w || !w.available) return 'Weather unavailable';
  return `${formatTemperature(w.current.temperature, w.unit)}, ${w.current.condition}`;
});

const icon = computed(() => {
  const w = props.weather;
  return w && w.available ? weatherEmoji(w.current.icon) : '🌡️';
});

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') open.value = false;
}

watch(open, (isOpen) => {
  if (isOpen) document.addEventListener('keydown', onKeydown);
  else document.removeEventListener('keydown', onKeydown);
});
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown));
</script>

<template>
  <button
    type="button"
    class="weather-badge"
    aria-haspopup="dialog"
    :aria-expanded="open"
    data-testid="weather-badge"
    @click="open = true"
  >
    <span aria-hidden="true">{{ icon }}</span>
    {{ label }}
  </button>

  <div v-if="open" class="popup-backdrop" @click.self="open = false">
    <div
      class="popup"
      role="dialog"
      aria-modal="true"
      :aria-label="`Weather in ${placeName}`"
      data-testid="weather-popup"
    >
      <div class="row row--between">
        <h2>Weather in {{ placeName }}</h2>
        <button
          type="button"
          class="button--small"
          aria-label="Close weather"
          @click="open = false"
        >
          Close
        </button>
      </div>
      <WeatherPanel :weather="weather" :loading="loading" @retry="$emit('retry')" />
    </div>
  </div>
</template>
