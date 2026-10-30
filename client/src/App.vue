<script setup lang="ts">
import AppHeader from './components/AppHeader.vue';
</script>

<template>
  <AppHeader />
  <main class="container">
    <RouterView />
  </main>
  <footer class="container muted small">
    Wayfarer is a class project prototype and not an official source. Flights, hotels and prices are
    sample data. Travel advisories are from the U.S. Department of State.
  </footer>
</template>
