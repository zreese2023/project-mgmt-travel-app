<script setup lang="ts">
import { computed } from 'vue';
import type { BudgetTier, DestinationSummary } from '../api/types';
import { formatMoney, titleCase } from '../utils/format';

const props = defineProps<{
  destination: DestinationSummary;
  budgets?: BudgetTier[];
}>();

const tierLabel = computed(
  () =>
    props.budgets?.find((b) => b.tier === props.destination.budgetTier)?.label ??
    '$'.repeat(props.destination.budgetTier),
);
</script>

<template>
  <article class="card dest-card" data-testid="destination-card">
    <img
      :src="destination.imageUrl"
      :alt="`${destination.name}, sample illustration`"
      loading="lazy"
    />
    <div class="dest-card__body">
      <h3>
        <RouterLink :to="{ name: 'destination', params: { slug: destination.slug } }">{{
          destination.name
        }}</RouterLink>
      </h3>
      <p class="muted small">{{ destination.country }} · {{ destination.region }}</p>
      <p class="small">
        <strong>{{ tierLabel }}</strong> about {{ formatMoney(destination.avgDailyCost) }} a day
      </p>
      <p>
        <span v-for="interest in destination.interests" :key="interest" class="chip">{{
          titleCase(interest)
        }}</span>
      </p>
    </div>
  </article>
</template>
