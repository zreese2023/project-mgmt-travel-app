import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { ApiError } from '../api/client';
import { endpoints } from '../api/endpoints';
import type { User } from '../api/types';

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null);
  /** True once the first /me check has finished, so guards do not flash the login page. */
  const ready = ref(false);

  const isAuthenticated = computed(() => user.value !== null);

  /**
   * Restores the session from the cookie. A 401 means "signed out"; any other failure (server
   * down) is also treated as signed out so navigation never breaks, and the next call retries.
   */
  async function init(): Promise<void> {
    if (ready.value) return;
    try {
      user.value = (await endpoints.auth.me()).user;
      ready.value = true;
    } catch (err) {
      user.value = null;
      if (err instanceof ApiError && err.status === 401) ready.value = true;
    }
  }

  async function login(email: string, password: string): Promise<void> {
    user.value = (await endpoints.auth.login({ email, password })).user;
    ready.value = true;
  }

  async function register(email: string, name: string, password: string): Promise<void> {
    user.value = (await endpoints.auth.register({ email, name, password })).user;
    ready.value = true;
  }

  async function logout(): Promise<void> {
    try {
      await endpoints.auth.logout();
    } finally {
      user.value = null;
    }
  }

  return { user, ready, isAuthenticated, init, login, register, logout };
});
