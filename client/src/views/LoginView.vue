<script setup lang="ts">
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { safeRedirect } from '../router/guards';
import { useAuthStore } from '../stores/auth';
import { errorMessage } from '../utils/errors';

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();

const email = ref('');
const password = ref('');
const busy = ref(false);
const error = ref<string | null>(null);

async function submit(): Promise<void> {
  busy.value = true;
  error.value = null;
  try {
    await auth.login(email.value, password.value);
    await router.push(safeRedirect(route.query.redirect));
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="card" style="max-width: 440px; margin: 0 auto">
    <h1>Sign in</h1>
    <form @submit.prevent="submit">
      <div v-if="error" class="alert alert--error" role="alert" data-testid="login-error">
        {{ error }}
      </div>
      <div class="field">
        <label for="login-email">Email</label>
        <input id="login-email" v-model="email" type="email" required autocomplete="email" />
      </div>
      <div class="field">
        <label for="login-password">Password</label>
        <input
          id="login-password"
          v-model="password"
          type="password"
          required
          autocomplete="current-password"
        />
      </div>
      <button type="submit" class="primary" :disabled="busy">
        {{ busy ? 'Signing in…' : 'Sign in' }}
      </button>
    </form>
    <p class="muted small">
      New here? <RouterLink :to="{ name: 'register' }">Create an account</RouterLink>. Demo account:
      demo@wayfarer.test / wayfarer123.
    </p>
  </div>
</template>
