import { createRouter, createWebHistory, type RouteRecordRaw, type Router } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { resolveGuard } from './guards';

export const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'home',
    component: () => import('../views/HomeView.vue'),
    meta: { title: 'Home' },
  },
  {
    path: '/destinations',
    name: 'destinations',
    component: () => import('../views/DestinationsView.vue'),
    meta: { title: 'Destinations' },
  },
  {
    path: '/destinations/:slug',
    name: 'destination',
    component: () => import('../views/DestinationDetailView.vue'),
    meta: { title: 'Destination' },
  },
  {
    path: '/flights',
    name: 'flights',
    component: () => import('../views/FlightsView.vue'),
    meta: { title: 'Flights' },
  },
  {
    path: '/hotels',
    name: 'hotels',
    component: () => import('../views/HotelsView.vue'),
    meta: { title: 'Hotels' },
  },
  {
    path: '/checkout/flight',
    name: 'checkout-flight',
    component: () => import('../views/FlightCheckoutView.vue'),
    meta: { requiresAuth: true, title: 'Book flights' },
  },
  {
    path: '/checkout/hotel',
    name: 'checkout-hotel',
    component: () => import('../views/HotelCheckoutView.vue'),
    meta: { requiresAuth: true, title: 'Book a hotel' },
  },
  {
    path: '/trips',
    name: 'trips',
    component: () => import('../views/TripsView.vue'),
    meta: { requiresAuth: true, title: 'My trips' },
  },
  {
    path: '/trips/:id',
    name: 'trip',
    component: () => import('../views/TripDetailView.vue'),
    meta: { requiresAuth: true, title: 'Itinerary' },
  },
  {
    path: '/bookings',
    name: 'bookings',
    component: () => import('../views/BookingsView.vue'),
    meta: { requiresAuth: true, title: 'My bookings' },
  },
  {
    path: '/notifications',
    name: 'notifications',
    component: () => import('../views/NotificationsView.vue'),
    meta: { requiresAuth: true, title: 'Alerts' },
  },
  {
    path: '/login',
    name: 'login',
    component: () => import('../views/LoginView.vue'),
    meta: { guestOnly: true, title: 'Sign in' },
  },
  {
    path: '/register',
    name: 'register',
    component: () => import('../views/RegisterView.vue'),
    meta: { guestOnly: true, title: 'Create account' },
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('../views/NotFoundView.vue'),
    meta: { title: 'Not found' },
  },
];

/** Installs the auth guard: restores the session once, then applies `resolveGuard`. */
export function installGuards(router: Router): void {
  router.beforeEach(async (to) => {
    const auth = useAuthStore();
    await auth.init();
    return resolveGuard(to.meta, to.fullPath, { isAuthenticated: auth.isAuthenticated });
  });
  router.afterEach((to) => {
    document.title = to.meta.title ? `${to.meta.title} · Wayfarer` : 'Wayfarer';
  });
}

export function createAppRouter(): Router {
  const router = createRouter({ history: createWebHistory(), routes });
  installGuards(router);
  return router;
}
