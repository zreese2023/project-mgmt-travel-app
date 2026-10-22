<script setup lang="ts">
withDefaults(defineProps<{ what?: string }>(), { what: 'Flights, hotels and prices' });
</script>

<template>
  <p class="notice" role="note" data-testid="sample-notice">
    <strong>Sample data.</strong> {{ what }} on this site are fictional and for demonstration only.
    Nothing can be booked or paid for here.
  </p>
</template>
