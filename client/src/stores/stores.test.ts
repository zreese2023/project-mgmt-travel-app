import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';
import type { TripListEntry, User } from '../api/types';

vi.mock('../api/endpoints', () => ({
  endpoints: {
    auth: {
      me: vi.fn(),
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    },
    trips: { list: vi.fn() },
  },
}));

import { endpoints } from '../api/endpoints';
import { useAuthStore } from './auth';
import { useTripsStore } from './trips';

const user: User = {
  id: 1,
  email: 'ada@example.com',
  name: 'Ada',
  role: 'user',
};
const trip = (id: number): TripListEntry => ({
  id,
  name: `Trip ${id}`,
  destination: { slug: 'tokyo', name: 'Tokyo', imageUrl: '/x.svg', airportCode: 'NRT' },
  startDate: '2026-11-05',
  endDate: '2026-11-08',
  createdAt: '2026-10-21T00:00:00.000Z',
  itemCount: 0,
  paid: false,
});

beforeEach(() => {
  setActivePinia(createPinia());
  vi.resetAllMocks();
  localStorage.clear();
});

describe('SCRUM-34: auth store', () => {
  it('starts signed out and not ready', () => {
    const auth = useAuthStore();
    expect(auth.user).toBeNull();
    expect(auth.ready).toBe(false);
    expect(auth.isAuthenticated).toBe(false);
  });

  it('restores the session on init and only asks once', async () => {
    vi.mocked(endpoints.auth.me).mockResolvedValue({ user });
    const auth = useAuthStore();
    await auth.init();
    await auth.init();
    expect(auth.user).toEqual(user);
    expect(auth.isAuthenticated).toBe(true);
    expect(auth.ready).toBe(true);
    expect(endpoints.auth.me).toHaveBeenCalledTimes(1);
  });

  it('treats a 401 as signed out and stops asking', async () => {
    vi.mocked(endpoints.auth.me).mockRejectedValue(new ApiError(401, 'unauthenticated', 'no'));
    const auth = useAuthStore();
    await auth.init();
    expect(auth.user).toBeNull();
    expect(auth.ready).toBe(true);
  });

  it('treats a network failure as signed out but retries next time', async () => {
    vi.mocked(endpoints.auth.me).mockRejectedValueOnce(new ApiError(0, 'network_error', 'down'));
    vi.mocked(endpoints.auth.me).mockResolvedValueOnce({ user });
    const auth = useAuthStore();
    await auth.init();
    expect(auth.ready).toBe(false);
    await auth.init();
    expect(auth.user).toEqual(user);
  });

  it('logs in and registers, replacing the signed-in user', async () => {
    vi.mocked(endpoints.auth.login).mockResolvedValue({ user });
    vi.mocked(endpoints.auth.register).mockResolvedValue({ user: { ...user, name: 'Grace' } });
    const auth = useAuthStore();

    await auth.login('a@b.co', 'pw');
    expect(endpoints.auth.login).toHaveBeenCalledWith({ email: 'a@b.co', password: 'pw' });
    expect(auth.user?.name).toBe('Ada');
    expect(auth.ready).toBe(true);

    await auth.register('g@b.co', 'Grace', 'pw');
    expect(endpoints.auth.register).toHaveBeenCalledWith({
      email: 'g@b.co',
      name: 'Grace',
      password: 'pw',
    });
    expect(auth.user?.name).toBe('Grace');
  });

  it('propagates a failed login without signing in', async () => {
    vi.mocked(endpoints.auth.login).mockRejectedValue(
      new ApiError(401, 'invalid_credentials', 'Incorrect'),
    );
    const auth = useAuthStore();
    await expect(auth.login('a@b.co', 'bad')).rejects.toMatchObject({
      code: 'invalid_credentials',
    });
    expect(auth.isAuthenticated).toBe(false);
  });

  it('signs out locally even if the server call fails', async () => {
    vi.mocked(endpoints.auth.login).mockResolvedValue({ user });
    vi.mocked(endpoints.auth.logout).mockRejectedValue(new ApiError(0, 'network_error', 'down'));
    const auth = useAuthStore();
    await auth.login('a@b.co', 'pw');
    await expect(auth.logout()).rejects.toBeInstanceOf(ApiError);
    expect(auth.user).toBeNull();
  });
});

describe('SCRUM-31: trips store', () => {
  it('loads trips and defaults to the only trip', async () => {
    vi.mocked(endpoints.trips.list).mockResolvedValue({ trips: [trip(4)] });
    const store = useTripsStore();
    await store.load();
    expect(store.loaded).toBe(true);
    expect(store.activeTripId).toBe(4);
    expect(store.activeTrip?.name).toBe('Trip 4');
    expect(localStorage.getItem('wayfarer.activeTrip')).toBe('4');
  });

  it('leaves the selection empty when there are several trips', async () => {
    vi.mocked(endpoints.trips.list).mockResolvedValue({ trips: [trip(1), trip(2)] });
    const store = useTripsStore();
    await store.load();
    expect(store.activeTripId).toBeNull();
    store.setActive(2);
    expect(store.activeTrip?.id).toBe(2);
  });

  it('remembers the selection across stores and forgets a deleted trip', async () => {
    localStorage.setItem('wayfarer.activeTrip', '9');
    vi.mocked(endpoints.trips.list).mockResolvedValue({ trips: [trip(1), trip(2)] });
    const store = useTripsStore();
    expect(store.activeTripId).toBe(9);
    await store.load();
    expect(store.activeTripId).toBeNull();
    expect(localStorage.getItem('wayfarer.activeTrip')).toBeNull();
  });

  it('never selects a paid trip: it forgets a stored one and defaults to the only open trip', async () => {
    localStorage.setItem('wayfarer.activeTrip', '1');
    vi.mocked(endpoints.trips.list).mockResolvedValue({
      trips: [{ ...trip(1), paid: true }, trip(2)],
    });
    const store = useTripsStore();
    await store.load();
    expect(store.openTrips.map((t) => t.id)).toEqual([2]);
    expect(store.activeTripId).toBe(2);
  });

  it('works in memory when localStorage throws', async () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    try {
      setActivePinia(createPinia());
      const store = useTripsStore();
      expect(store.activeTripId).toBeNull();
      store.setActive(3);
      expect(store.activeTripId).toBe(3);
    } finally {
      getItem.mockRestore();
      setItem.mockRestore();
    }
  });

  it('ignores a non-numeric stored value and clears everything on demand', async () => {
    localStorage.setItem('wayfarer.activeTrip', 'abc');
    setActivePinia(createPinia());
    const store = useTripsStore();
    expect(store.activeTripId).toBeNull();
    vi.mocked(endpoints.trips.list).mockResolvedValue({ trips: [trip(1), trip(2)] });
    await store.load();
    store.setActive(1);
    store.clear();
    expect(store.trips).toEqual([]);
    expect(store.loaded).toBe(false);
    expect(store.activeTripId).toBeNull();
  });
});
