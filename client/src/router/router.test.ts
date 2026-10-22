import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { ApiError } from '../api/client';
import { resolveGuard, safeRedirect } from './guards';

vi.mock('../api/endpoints', () => ({
  endpoints: { auth: { me: vi.fn() } },
}));

import { endpoints } from '../api/endpoints';
import { installGuards, routes } from './index';

const signedOut = { isAuthenticated: false };
const user = { isAuthenticated: true };

describe('SCRUM-34: route guard decisions', () => {
  it('lets anyone open public pages', () => {
    expect(resolveGuard({}, '/destinations', signedOut)).toBe(true);
  });

  it('sends signed-out users to login and remembers where they were going', () => {
    expect(resolveGuard({ requiresAuth: true }, '/trips/3?x=1', signedOut)).toEqual({
      name: 'login',
      query: { redirect: '/trips/3?x=1' },
    });
    expect(resolveGuard({ requiresAuth: true }, '/trips', user)).toBe(true);
  });

  it('keeps signed-in users off the login and register pages', () => {
    expect(resolveGuard({ guestOnly: true }, '/login', user)).toEqual({ name: 'home' });
    expect(resolveGuard({ guestOnly: true }, '/login', signedOut)).toBe(true);
  });

  it('only follows same-site relative redirects', () => {
    expect(safeRedirect('/trips/3')).toBe('/trips/3');
    expect(safeRedirect('https://evil.example')).toBe('/');
    expect(safeRedirect('//evil.example')).toBe('/');
    expect(safeRedirect(undefined)).toBe('/');
    expect(safeRedirect(['/x'])).toBe('/');
  });
});

describe('SCRUM-34: guards wired into the router', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.resetAllMocks();
  });

  function buildRouter() {
    // Real route table, but without lazy component loading: guards run before components load.
    const router = createRouter({ history: createMemoryHistory(), routes });
    installGuards(router);
    return router;
  }

  it('redirects a signed-out visit to a protected page to login with a redirect target', async () => {
    vi.mocked(endpoints.auth.me).mockRejectedValue(new ApiError(401, 'unauthenticated', 'no'));
    const router = buildRouter();
    await router.push('/trips');
    expect(router.currentRoute.value.name).toBe('login');
    expect(router.currentRoute.value.query.redirect).toBe('/trips');
  });

  it('allows a signed-in user through and bounces them off /login', async () => {
    vi.mocked(endpoints.auth.me).mockResolvedValue({
      user: {
        id: 1,
        email: 'a@b.co',
        name: 'A',
        role: 'user',
      },
    });
    const router = buildRouter();
    await router.push('/trips');
    expect(router.currentRoute.value.name).toBe('trips');
    await router.push('/login');
    expect(router.currentRoute.value.name).toBe('home');
  });

  it('gives every route a title and a unique name', () => {
    const names = routes.map((r) => r.name);
    expect(new Set(names).size).toBe(names.length);
    expect(routes.every((r) => typeof r.meta?.title === 'string')).toBe(true);
  });

  it('shows the not-found route for unknown paths', async () => {
    vi.mocked(endpoints.auth.me).mockRejectedValue(new ApiError(401, 'unauthenticated', 'no'));
    const router = buildRouter();
    await router.push('/no/such/page');
    expect(router.currentRoute.value.name).toBe('not-found');
  });
});
