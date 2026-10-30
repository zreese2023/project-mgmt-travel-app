import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';

vi.mock('../api/endpoints', () => ({
  endpoints: { auth: { login: vi.fn(), me: vi.fn() } },
}));

import { endpoints } from '../api/endpoints';
import { flushPromises, mountWithApp } from '../test/utils';
import LoginView from './LoginView.vue';

const user = {
  id: 1,
  email: 'a@b.co',
  name: 'A',
  role: 'user' as const,
};

beforeEach(() => vi.resetAllMocks());
afterEach(() => {
  document.body.innerHTML = '';
});

async function submit(location: string | object = '/login') {
  const app = await mountWithApp(LoginView, { location });
  await app.wrapper.get('#login-email').setValue('a@b.co');
  await app.wrapper.get('#login-password').setValue('secret-pw');
  await app.wrapper.get('form').trigger('submit');
  return app;
}

describe('SCRUM-34: login', () => {
  it('signs in and goes to the page the user originally wanted', async () => {
    vi.mocked(endpoints.auth.login).mockResolvedValue({ user });
    const { router } = await submit({ path: '/login', query: { redirect: '/trips' } });
    await flushPromises();
    expect(endpoints.auth.login).toHaveBeenCalledWith({ email: 'a@b.co', password: 'secret-pw' });
    expect(router.currentRoute.value.path).toBe('/trips');
  });

  it('ignores an external redirect target and goes home', async () => {
    vi.mocked(endpoints.auth.login).mockResolvedValue({ user });
    const { router } = await submit({
      path: '/login',
      query: { redirect: 'https://evil.example' },
    });
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/');
  });

  it('shows the error for wrong credentials and stays on the page', async () => {
    vi.mocked(endpoints.auth.login).mockRejectedValue(
      new ApiError(401, 'invalid_credentials', 'Incorrect email or password'),
    );
    const { wrapper, router } = await submit();
    await flushPromises();
    expect(wrapper.get('[data-testid="login-error"]').text()).toBe('Incorrect email or password');
    expect(router.currentRoute.value.path).toBe('/login');
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeUndefined();
  });

  it('disables the button while signing in', async () => {
    vi.mocked(endpoints.auth.login).mockReturnValue(new Promise(() => undefined));
    const { wrapper } = await submit();
    const button = wrapper.get('button[type="submit"]');
    expect(button.attributes('disabled')).toBeDefined();
    expect(button.text()).toBe('Signing in…');
  });
});
