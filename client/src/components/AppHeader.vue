<script setup lang="ts">
import { watch } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { useTripsStore } from '../stores/trips';

const auth = useAuthStore();
const trips = useTripsStore();
const router = useRouter();

// Load the signed-in user's trips (for "add to trip"); clear them on sign-out.
watch(
  () => auth.user?.id,
  async (id) => {
    if (id === undefined) {
      trips.clear();
      return;
    }
    await trips.load().catch(() => undefined);
  },
  { immediate: true },
);

async function signOut(): Promise<void> {
  await auth.logout().catch(() => undefined);
  await router.push({ name: 'home' });
}
</script>

<template>
  <header class="site-header">
    <div class="site-header__inner">
      <RouterLink class="brand" :to="{ name: 'home' }">Wayfarer</RouterLink>
      <nav class="site-nav" aria-label="Main">
        <RouterLink :to="{ name: 'destinations' }">Destinations</RouterLink>
        <RouterLink :to="{ name: 'flights' }">Flights</RouterLink>
        <RouterLink :to="{ name: 'hotels' }">Hotels</RouterLink>
        <RouterLink v-if="auth.isAuthenticated" :to="{ name: 'trips' }">My trips</RouterLink>
      </nav>
      <div class="site-actions">
        <template v-if="auth.isAuthenticated">
          <span class="muted" data-testid="user-name">{{ auth.user?.name }}</span>
          <button type="button" class="button--small" data-testid="sign-out" @click="signOut">
            Sign out
          </button>
        </template>
        <template v-else>
          <RouterLink :to="{ name: 'login' }">Sign in</RouterLink>
          <RouterLink class="button button--primary" :to="{ name: 'register' }">
            Create account
          </RouterLink>
        </template>
      </div>
    </div>
  </header>
</template>
