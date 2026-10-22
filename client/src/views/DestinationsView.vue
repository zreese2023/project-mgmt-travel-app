<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { endpoints } from '../api/endpoints';
import type { DestinationFilterOptions } from '../api/types';
import DestinationCard from '../components/DestinationCard.vue';
import { useDestinationSearch } from '../composables/useDestinationSearch';
import { plural, titleCase } from '../utils/format';

const route = useRoute();
const initialQuery = typeof route.query.q === 'string' ? route.query.q : '';
const {
  q,
  regions,
  budgets,
  interests,
  results,
  loading,
  error,
  searched,
  hasFilters,
  run,
  clearFilters,
} = useDestinationSearch({ q: initialQuery });

const options = ref<DestinationFilterOptions | null>(null);

onMounted(async () => {
  void run();
  try {
    options.value = await endpoints.destinations.filters();
  } catch {
    options.value = null; // filters are optional; search still works without them
  }
});
</script>

<template>
  <h1>Destinations</h1>

  <form
    class="card"
    role="search"
    aria-label="Search and filter destinations"
    @submit.prevent="run"
  >
    <div class="field">
      <label for="destination-q">Search by keyword</label>
      <input
        id="destination-q"
        v-model="q"
        type="search"
        placeholder="City, country, region or interest"
        data-testid="destination-search"
        autocomplete="off"
      />
    </div>

    <div v-if="options" class="stack">
      <fieldset>
        <legend>Region</legend>
        <div class="check-row">
          <label v-for="region in options.regions" :key="region">
            <input v-model="regions" type="checkbox" :value="region" /> {{ region }}
          </label>
        </div>
      </fieldset>
      <fieldset>
        <legend>Budget</legend>
        <div class="check-row">
          <label v-for="tier in options.budgets" :key="tier.tier" :title="tier.description">
            <input v-model="budgets" type="checkbox" :value="tier.tier" /> {{ tier.label }}
            <span class="muted small">{{ tier.description }}</span>
          </label>
        </div>
      </fieldset>
      <fieldset>
        <legend>Interests</legend>
        <div class="check-row">
          <label v-for="interest in options.interests" :key="interest">
            <input v-model="interests" type="checkbox" :value="interest" />
            {{ titleCase(interest) }}
          </label>
        </div>
      </fieldset>
    </div>

    <p v-if="hasFilters">
      <button type="button" class="button--small" data-testid="clear-filters" @click="clearFilters">
        Remove all filters
      </button>
    </p>
  </form>

  <p class="muted" aria-live="polite" data-testid="result-count">
    <template v-if="loading">Searching…</template>
    <template v-else-if="searched && !error"
      >{{ plural(results.length, 'destination') }} found</template
    >
  </p>

  <div v-if="error" class="alert alert--error" role="alert">
    {{ error }} <button type="button" class="button--small" @click="run">Try again</button>
  </div>
  <p
    v-else-if="searched && !loading && results.length === 0"
    class="status"
    data-testid="no-results"
  >
    No destinations match your search. Try a different keyword or remove a filter.
  </p>
  <div v-else class="grid">
    <DestinationCard
      v-for="destination in results"
      :key="destination.id"
      :destination="destination"
      :budgets="options?.budgets"
    />
  </div>
</template>
