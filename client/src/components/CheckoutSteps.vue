<script setup lang="ts">
defineProps<{
  steps: readonly string[];
  /** Index of the step being shown. */
  current: number;
}>();
</script>

<template>
  <ol class="steps" aria-label="Checkout progress" data-testid="checkout-steps">
    <li
      v-for="(step, index) in steps"
      :key="step"
      class="steps__item"
      :class="{ 'steps__item--done': index < current, 'steps__item--current': index === current }"
      :aria-current="index === current ? 'step' : undefined"
    >
      <span class="steps__number" aria-hidden="true">{{ index < current ? '✓' : index + 1 }}</span>
      <span class="steps__label">{{ step }}</span>
    </li>
  </ol>
</template>
