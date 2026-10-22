<template>
  <div class="card">
    <h1>Page not found</h1>
    <p>We couldn't find that page.</p>
    <p><RouterLink :to="{ name: 'home' }">Go to the home page</RouterLink></p>
  </div>
</template>
