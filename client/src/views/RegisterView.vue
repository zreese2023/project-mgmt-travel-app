<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { errorMessage, fieldErrors } from '../utils/errors';

const auth = useAuthStore();
const router = useRouter();

const name = ref('');
const email = ref('');
const password = ref('');
const busy = ref(false);
const error = ref<string | null>(null);
const errors = ref<Record<string, string>>({});

async function submit(): Promise<void> {
  busy.value = true;
  error.value = null;
  errors.value = {};
  try {
    await auth.register(email.value, name.value, password.value);
    await router.push({ name: 'home' });
  } catch (err) {
    errors.value = fieldErrors(err);
    error.value = Object.keys(errors.value).length > 0 ? null : errorMessage(err);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="card" style="max-width: 440px; margin: 0 auto">
    <h1>Create your account</h1>
    <form novalidate @submit.prevent="submit">
      <div v-if="error" class="alert alert--error" role="alert" data-testid="register-error">
        {{ error }}
      </div>
      <div class="field" :class="{ 'field--error': errors.name }">
        <label for="reg-name">Name</label>
        <input id="reg-name" v-model="name" type="text" autocomplete="name" />
        <p v-if="errors.name" class="field__error">{{ errors.name }}</p>
      </div>
      <div class="field" :class="{ 'field--error': errors.email }">
        <label for="reg-email">Email</label>
        <input id="reg-email" v-model="email" type="email" autocomplete="email" />
        <p v-if="errors.email" class="field__error">{{ errors.email }}</p>
      </div>
      <div class="field" :class="{ 'field--error': errors.password }">
        <label for="reg-password">Password (at least 8 characters)</label>
        <input id="reg-password" v-model="password" type="password" autocomplete="new-password" />
        <p v-if="errors.password" class="field__error">{{ errors.password }}</p>
      </div>
      <button type="submit" class="primary" :disabled="busy">
        {{ busy ? 'Creating…' : 'Create account' }}
      </button>
    </form>
    <p class="muted small">
      Already registered? <RouterLink :to="{ name: 'login' }">Sign in</RouterLink>
    </p>
  </div>
</template>
