import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';
import type { User } from '../api/types';

vi.mock('../api/endpoints', () => ({
  endpoints: {
    auth: { register: vi.fn(), logout: vi.fn(), me: vi.fn() },
    destinations: { search: vi.fn() },
    trips: { list: vi.fn() },
  },
}));

import { endpoints } from '../api/endpoints';
import AppHeader from '../components/AppHeader.vue';
import { useAuthStore } from '../stores/auth';
import { flushPromises, mountWithApp } from '../test/utils';
import { errorMessage, fieldErrors } from '../utils/errors';
import HomeView from './HomeView.vue';
import RegisterView from './RegisterView.vue';

const user: User = { id: 1, email: 'ada@example.com', name: 'Ada', role: 'user' };

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  vi.mocked(endpoints.destinations.search).mockResolvedValue({
    destinations: Array.from({ length: 8 }, (_, i) => ({
      id: i,
      slug: `d${i}`,
      name: `Dest ${i}`,
      country: 'X',
      region: 'Y',
      description: '',
      imageUrl: '/x.svg',
      avgDailyCost: 100,
      budgetTier: 2,
      interests: [],
    })),
  });
});
afterEach(() => {
  document.body.innerHTML = '';
});

describe('SCRUM-11: home page', () => {
  it('shows six popular destinations and the sample-data notice', async () => {
    const { wrapper } = await mountWithApp(HomeView);
    expect(wrapper.findAll('[data-testid="destination-card"]')).toHaveLength(6);
    expect(wrapper.text()).toMatch(/sample data/i);
    expect(wrapper.text()).toMatch(/not an official source/i);
  });

  it('sends the keyword to the destinations page', async () => {
    const { wrapper, router } = await mountWithApp(HomeView);
    await wrapper.get('#home-search').setValue('  tokyo ');
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('destinations');
    expect(router.currentRoute.value.query.q).toBe('tokyo');
  });

  it('shows a retryable error if destinations cannot be loaded', async () => {
    vi.mocked(endpoints.destinations.search).mockRejectedValueOnce(
      new ApiError(0, 'network_error', 'Cannot reach the server.'),
    );
    const { wrapper } = await mountWithApp(HomeView);
    expect(wrapper.get('.alert').text()).toContain('Cannot reach the server');
    await wrapper.get('.alert button').trigger('click');
    await flushPromises();
    expect(wrapper.findAll('[data-testid="destination-card"]')).toHaveLength(6);
  });
});

describe('SCRUM-34: register', () => {
  it('registers and goes home', async () => {
    vi.mocked(endpoints.auth.register).mockResolvedValue({ user });
    const { wrapper, router } = await mountWithApp(RegisterView, { location: '/register' });
    await wrapper.get('#reg-name').setValue('Ada');
    await wrapper.get('#reg-email').setValue('ada@example.com');
    await wrapper.get('#reg-password').setValue('longenough1');
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(endpoints.auth.register).toHaveBeenCalledWith({
      email: 'ada@example.com',
      name: 'Ada',
      password: 'longenough1',
    });
    expect(router.currentRoute.value.name).toBe('home');
  });

  it('shows field errors beside each field and a general error otherwise', async () => {
    vi.mocked(endpoints.auth.register).mockRejectedValueOnce(
      new ApiError(422, 'validation_error', 'Please fix', {
        email: 'Enter a valid email address',
        password: 'Password must be at least 8 characters',
      }),
    );
    const { wrapper } = await mountWithApp(RegisterView, { location: '/register' });
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(wrapper.text()).toContain('Enter a valid email address');
    expect(wrapper.text()).toContain('at least 8 characters');
    expect(wrapper.find('[data-testid="register-error"]').exists()).toBe(false);

    vi.mocked(endpoints.auth.register).mockRejectedValueOnce(
      new ApiError(409, 'email_taken', 'An account with that email already exists'),
    );
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(wrapper.get('[data-testid="register-error"]').text()).toContain('already exists');
  });
});

describe('SCRUM-34: header', () => {
  it('shows sign-in links when signed out, and no trips link', async () => {
    const { wrapper } = await mountWithApp(AppHeader);
    expect(wrapper.text()).toContain('Sign in');
    expect(wrapper.text()).toContain('Create account');
    expect(wrapper.text()).not.toContain('My trips');
  });

  it('when signed in shows the name and trips link, loads trips and signs out', async () => {
    vi.mocked(endpoints.trips.list).mockResolvedValue({ trips: [] });
    vi.mocked(endpoints.auth.logout).mockResolvedValue(undefined);
    const { wrapper, router, pinia } = await mountWithApp(AppHeader);
    useAuthStore(pinia).user = user;
    await flushPromises();

    expect(wrapper.get('[data-testid="user-name"]').text()).toBe('Ada');
    expect(wrapper.text()).toContain('My trips');
    expect(endpoints.trips.list).toHaveBeenCalled();

    await wrapper.get('[data-testid="sign-out"]').trigger('click');
    await flushPromises();
    expect(endpoints.auth.logout).toHaveBeenCalled();
    expect(useAuthStore(pinia).isAuthenticated).toBe(false);
    expect(wrapper.text()).toContain('Sign in');
    expect(router.currentRoute.value.name).toBe('home');
  });

  it('has no notifications or profile links in this build', async () => {
    const { wrapper, pinia } = await mountWithApp(AppHeader);
    vi.mocked(endpoints.trips.list).mockResolvedValue({ trips: [] });
    useAuthStore(pinia).user = user;
    await flushPromises();
    expect(wrapper.text()).not.toMatch(/notifications|profile/i);
  });
});

describe('error helpers', () => {
  it('extracts messages and field errors from any thrown value', () => {
    expect(errorMessage(new ApiError(422, 'x', 'Bad input'))).toBe('Bad input');
    expect(errorMessage(new Error('plain'))).toBe('plain');
    expect(errorMessage(new Error(''))).toMatch(/something went wrong/i);
    expect(errorMessage('boom')).toMatch(/something went wrong/i);
    expect(fieldErrors(new ApiError(422, 'x', 'm', { a: 'b' }))).toEqual({ a: 'b' });
    expect(fieldErrors(new Error('x'))).toEqual({});
  });
});
