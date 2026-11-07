import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import { createMemoryHistory, createRouter, type Router, type RouteLocationRaw } from 'vue-router';
import type { Component } from 'vue';

const Stub = { template: '<div />' };

/** A router with every route name the app links to, but stub components. */
export function createTestRouter(): Router {
  const names = [
    'home',
    'destinations',
    'flights',
    'hotels',
    'trips',
    'bookings',
    'notifications',
    'login',
    'register',
  ];
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      ...names.map((name) => ({ path: name === 'home' ? '/' : `/${name}`, name, component: Stub })),
      { path: '/destinations/:slug', name: 'destination', component: Stub },
      { path: '/trips/:id', name: 'trip', component: Stub },
      { path: '/checkout/flight', name: 'checkout-flight', component: Stub },
      { path: '/checkout/hotel', name: 'checkout-hotel', component: Stub },
    ],
  });
}

export interface MountedApp {
  wrapper: VueWrapper;
  router: Router;
  pinia: Pinia;
}

/** Mounts a component with a fresh Pinia and a test router positioned at `location`. */
export async function mountWithApp(
  component: Component,
  options: { location?: RouteLocationRaw; props?: Record<string, unknown>; routes?: Router } = {},
): Promise<MountedApp> {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = options.routes ?? createTestRouter();
  await router.push(options.location ?? '/');
  await router.isReady();
  const wrapper = mount(component, {
    props: options.props ?? {},
    global: { plugins: [pinia, router] },
    attachTo: document.body,
  });
  await flushPromises();
  return { wrapper, router, pinia };
}

export { flushPromises };
