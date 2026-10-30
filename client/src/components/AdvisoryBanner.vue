<script setup lang="ts">
import { computed } from 'vue';
import type { Advisory } from '../api/types';
import { advisoryClass, advisorySymbol } from '../utils/presentation';

const props = defineProps<{
  advisory: Advisory;
  disclaimer?: string;
}>();

const cssClass = computed(() => advisoryClass(props.advisory.level));
</script>

<template>
  <section
    class="advisory"
    :class="cssClass"
    aria-label="Travel advisory"
    data-testid="advisory-banner"
  >
    <p class="advisory__title">
      <span class="advisory__level">
        <span aria-hidden="true">{{ advisorySymbol(advisory.level) }}</span>
        Level {{ advisory.level }}: {{ advisory.label }}
      </span>
      <span v-if="advisory.kind === 'sample'" class="chip" data-testid="advisory-sample">
        Sample data
      </span>
    </p>
    <p data-testid="advisory-summary">{{ advisory.summary }}</p>
    <p v-if="advisory.categories.length > 0">
      <span v-for="category in advisory.categories" :key="category" class="chip">{{
        category
      }}</span>
    </p>
    <p class="small" data-testid="advisory-source">
      {{ advisory.sourceLabel }}
      <a
        v-if="advisory.sourceUrl"
        :href="advisory.sourceUrl"
        target="_blank"
        rel="noopener noreferrer"
        >Read the full advisory</a
      >
    </p>
    <p class="advisory__disclaimer" data-testid="advisory-disclaimer">
      {{ disclaimer ?? advisory.sourceLabel }}
    </p>
  </section>
</template>
