<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { endpoints } from '../api/endpoints';
import type { DestinationSummary } from '../api/types';
import DestinationCard from '../components/DestinationCard.vue';
import { errorMessage } from '../utils/errors';

const router = useRouter();
const keyword = ref('');
const popular = ref<DestinationSummary[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);

async function loadPopular(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    popular.value = (await endpoints.destinations.search()).destinations.slice(0, 6);
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    loading.value = false;
  }
}

function search(): void {
  void router.push({
    name: 'destinations',
    query: keyword.value.trim() ? { q: keyword.value.trim() } : {},
  });
}

onMounted(loadPopular);
</script>

<template>
  <section class="hero">
    <h1>Plan your whole trip in one place</h1>
    <p>Search destinations, compare flights and hotels, and build a day-by-day itinerary.</p>
    <form role="search" @submit.prevent="search">
      <label for="home-search" class="sr-only" style="position: absolute; left: -9999px"
        >Search destinations</label
      >
      <input
        id="home-search"
        v-model="keyword"
        type="search"
        placeholder="Try “Tokyo” or “beach”"
      />
      <button type="submit" class="primary">Search</button>
    </form>
  </section>

  <p class="notice" role="note">
    <strong>Prototype notice:</strong> flights, hotels and prices are <strong>sample data</strong>.
  </p>

  <h2>Popular destinations</h2>
  <p v-if="loading" class="status">Loading destinations…</p>
  <div v-else-if="error" class="alert alert--error">
    {{ error }} <button type="button" class="button--small" @click="loadPopular">Try again</button>
  </div>
  <div v-else class="grid">
    <DestinationCard
      v-for="destination in popular"
      :key="destination.id"
      :destination="destination"
    />
  </div>
  <p><RouterLink :to="{ name: 'destinations' }">Browse all destinations</RouterLink></p>
</template>
