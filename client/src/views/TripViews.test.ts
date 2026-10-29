import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';
import type { TripDetail, TripListEntry } from '../api/types';

vi.mock('../api/endpoints', () => ({
  endpoints: {
    trips: {
      list: vi.fn(),
      create: vi.fn(),
      get: vi.fn(),
      remove: vi.fn(),
      addItem: vi.fn(),
      removeItem: vi.fn(),
      updateItem: vi.fn(),
      moveItem: vi.fn(),
    },
    destinations: { search: vi.fn(), get: vi.fn() },
  },
}));

import { endpoints } from '../api/endpoints';
import { flushPromises, mountWithApp } from '../test/utils';
import TripDetailView from './TripDetailView.vue';
import TripsView from './TripsView.vue';

const destination = { slug: 'tokyo', name: 'Tokyo', imageUrl: '/x.svg', airportCode: 'NRT' };
const tripEntry: TripListEntry = {
  id: 3,
  name: 'Tokyo trip',
  destination,
  startDate: '2026-11-05',
  endDate: '2026-11-06',
  createdAt: '2026-10-21T00:00:00.000Z',
  itemCount: 2,
};

const item = (id: number, overrides: object = {}) => ({
  id,
  tripId: 3,
  kind: 'activity' as const,
  title: `Item ${id}`,
  day: '2026-11-05',
  startTime: null,
  position: 0,
  notes: null,
  activityId: null,
  flightId: null,
  hotelId: null,
  ...overrides,
});

const detail = (): TripDetail => ({
  trip: tripEntry,
  days: [
    {
      day: '2026-11-05',
      dayNumber: 1,
      items: [
        item(1, { title: 'Breakfast', startTime: '08:30' }),
        item(2, { title: 'Visit Shibuya station', startTime: '13:00', notes: 'Bring Suica' }),
        item(3, {
          kind: 'flight',
          title: 'Flight SK100: JFK to NRT',
          startTime: '15:00',
        }),
      ],
    },
    { day: '2026-11-06', dayNumber: 2, items: [] },
  ],
  summary: { days: 2, items: 3, byKind: { flight: 1, hotel: 0, activity: 2, note: 0 } },
});

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  vi.mocked(endpoints.trips.list).mockResolvedValue({ trips: [tripEntry] });
  vi.mocked(endpoints.destinations.search).mockResolvedValue({
    destinations: [{ slug: 'tokyo', name: 'Tokyo', country: 'Japan' } as never],
  });
  vi.mocked(endpoints.trips.get).mockResolvedValue(detail());
  vi.mocked(endpoints.destinations.get).mockResolvedValue({
    destination: {
      activities: [
        {
          id: 50,
          name: 'Senso-ji Temple',
          category: 'culture',
          description: 'x',
          durationMin: 120,
        },
      ],
    } as never,
  });
});
afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('SCRUM-31: trips list', () => {
  it('lists the user trips with item counts', async () => {
    const { wrapper } = await mountWithApp(TripsView, { location: '/trips' });
    const card = wrapper.get('[data-testid="trip-card"]');
    expect(card.text()).toContain('Tokyo trip');
    expect(card.text()).toContain('2 items planned');
  });

  it('shows an empty state with no trips', async () => {
    vi.mocked(endpoints.trips.list).mockResolvedValue({ trips: [] });
    const { wrapper } = await mountWithApp(TripsView, { location: '/trips' });
    expect(wrapper.get('[data-testid="no-trips"]').text()).toMatch(/no trips yet/i);
  });

  it('creates a trip and opens its itinerary; the destination in the URL is preselected', async () => {
    vi.mocked(endpoints.trips.create).mockResolvedValue({ trip: tripEntry });
    const { wrapper, router } = await mountWithApp(TripsView, {
      location: '/trips?destination=tokyo',
    });
    expect((wrapper.get('#trip-destination').element as HTMLSelectElement).value).toBe('tokyo');
    expect((wrapper.get('#trip-name').element as HTMLInputElement).value).toBe('Tokyo trip');

    await wrapper.get('#trip-start').setValue('2026-11-05');
    await wrapper.get('#trip-end').setValue('2026-11-09');
    await wrapper.get('form[aria-label="Create a trip"]').trigger('submit');
    await flushPromises();

    expect(endpoints.trips.create).toHaveBeenCalledWith({
      destinationSlug: 'tokyo',
      name: 'Tokyo trip',
      startDate: '2026-11-05',
      endDate: '2026-11-09',
    });
    expect(router.currentRoute.value.name).toBe('trip');
    expect(router.currentRoute.value.params.id).toBe('3');
  });

  it('shows validation errors from the server', async () => {
    vi.mocked(endpoints.trips.create).mockRejectedValue(
      new ApiError(422, 'validation_error', 'Invalid trip dates', {
        endDate: 'End date cannot be before the start date',
      }),
    );
    const { wrapper, router } = await mountWithApp(TripsView, {
      location: '/trips?destination=tokyo',
    });
    await wrapper.get('form[aria-label="Create a trip"]').trigger('submit');
    await flushPromises();
    expect(wrapper.text()).toContain('End date cannot be before the start date');
    expect(router.currentRoute.value.name).toBe('trips');
  });

  it('deletes a trip only after confirmation', async () => {
    vi.mocked(endpoints.trips.remove).mockResolvedValue(undefined);
    const confirm = vi.spyOn(window, 'confirm');
    const { wrapper } = await mountWithApp(TripsView, { location: '/trips' });

    confirm.mockReturnValueOnce(false);
    await wrapper.get('[data-testid="trip-card"] .button--danger').trigger('click');
    expect(endpoints.trips.remove).not.toHaveBeenCalled();

    confirm.mockReturnValueOnce(true);
    await wrapper.get('[data-testid="trip-card"] .button--danger').trigger('click');
    await flushPromises();
    expect(endpoints.trips.remove).toHaveBeenCalledWith(3);
  });
});

describe('SCRUM-31/32: itinerary page', () => {
  const open = () =>
    mountWithApp(TripDetailView, { location: { name: 'trip', params: { id: '3' } } });

  it('shows the daily timeline in order, with times and notes', async () => {
    const { wrapper } = await open();
    expect(wrapper.findAll('[data-testid="day"]')).toHaveLength(2);
    const items = wrapper.findAll('[data-testid="itinerary-item"]');
    expect(items.map((i) => i.text())).toEqual([
      expect.stringContaining('8:30 AM'),
      expect.stringContaining('1:00 PM'),
      expect.stringContaining('flight'),
    ]);
    expect(items[1]!.text()).toContain('Bring Suica');
    expect(wrapper.get('[data-testid="trip-summary"]').text()).toContain('3 items planned');
    expect(wrapper.text()).toContain('Nothing planned yet.');
  });

  it('adds a custom timed activity and refreshes the itinerary', async () => {
    vi.mocked(endpoints.trips.addItem).mockResolvedValue({ item: item(10) });
    const { wrapper } = await open();
    await wrapper.get('#item-title').setValue('Visit Shibuya station');
    await wrapper.get('#item-time').setValue('13:00');
    await wrapper.get('form[aria-label="Add to itinerary"]').trigger('submit');
    await flushPromises();

    expect(endpoints.trips.addItem).toHaveBeenCalledWith(3, {
      kind: 'activity',
      title: 'Visit Shibuya station',
      day: '2026-11-05',
      startTime: '13:00',
    });
    expect(endpoints.trips.get).toHaveBeenCalledTimes(2);
    expect(wrapper.get('[role="status"]').text()).toContain('Added to your itinerary');
    expect((wrapper.get('#item-title').element as HTMLInputElement).value).toBe('');
  });

  it('adds a suggested activity for the chosen day', async () => {
    vi.mocked(endpoints.trips.addItem).mockResolvedValue({ item: item(11) });
    const { wrapper } = await open();
    await wrapper.get('#suggest-day').setValue('2026-11-06');
    await wrapper.get('section[aria-label="Suggested activities"] li button').trigger('click');
    await flushPromises();
    expect(endpoints.trips.addItem).toHaveBeenCalledWith(3, {
      kind: 'activity',
      activityId: 50,
      day: '2026-11-06',
    });
  });

  it('shows the server error when an item cannot be added', async () => {
    vi.mocked(endpoints.trips.addItem).mockRejectedValue(
      new ApiError(422, 'validation_error', 'That day is outside your trip dates', {
        day: 'Choose a day between',
      }),
    );
    const { wrapper } = await open();
    await wrapper.get('#item-title').setValue('x');
    await wrapper.get('form[aria-label="Add to itinerary"]').trigger('submit');
    await flushPromises();
    expect(wrapper.get('[role="status"]').text()).toContain('outside your trip dates');
  });

  it('removes an item', async () => {
    vi.mocked(endpoints.trips.removeItem).mockResolvedValue(undefined);
    const { wrapper } = await open();
    await wrapper.get('button[aria-label="Remove Breakfast"]').trigger('click');
    await flushPromises();
    expect(endpoints.trips.removeItem).toHaveBeenCalledWith(3, 1);
    expect(endpoints.trips.get).toHaveBeenCalledTimes(2);
  });

  it('edits an item inline: title, day, time and notes', async () => {
    vi.mocked(endpoints.trips.updateItem).mockResolvedValue({ item: item(1) });
    const { wrapper } = await open();
    await wrapper.get('button[aria-label="Edit Breakfast"]').trigger('click');
    expect((wrapper.get('input[aria-label="Title"]').element as HTMLInputElement).value).toBe(
      'Breakfast',
    );
    await wrapper.get('input[aria-label="Title"]').setValue('Late breakfast');
    await wrapper.get('select[aria-label="Day"]').setValue('2026-11-06');
    await wrapper.get('input[aria-label="Time"]').setValue('09:30');
    await wrapper.get('input[aria-label="Notes"]').setValue('At the hotel');
    await wrapper.get('li form').trigger('submit');
    await flushPromises();

    expect(endpoints.trips.updateItem).toHaveBeenCalledWith(3, 1, {
      title: 'Late breakfast',
      day: '2026-11-06',
      startTime: '09:30',
      notes: 'At the hotel',
    });
    expect(endpoints.trips.get).toHaveBeenCalledTimes(2); // itinerary reloaded
    expect(wrapper.find('li form').exists()).toBe(false);
  });

  it('clears the time and notes when they are emptied', async () => {
    vi.mocked(endpoints.trips.updateItem).mockResolvedValue({ item: item(2) });
    const { wrapper } = await open();
    await wrapper.get('button[aria-label="Edit Visit Shibuya station"]').trigger('click');
    await wrapper.get('input[aria-label="Time"]').setValue('');
    await wrapper.get('input[aria-label="Notes"]').setValue('');
    await wrapper.get('li form').trigger('submit');
    await flushPromises();
    expect(vi.mocked(endpoints.trips.updateItem).mock.calls[0]?.[2]).toMatchObject({
      startTime: null,
      notes: null,
    });
  });

  it('can cancel an edit without saving', async () => {
    const { wrapper } = await open();
    await wrapper.get('button[aria-label="Edit Breakfast"]').trigger('click');
    const cancel = wrapper.findAll('li form button').find((b) => b.text() === 'Cancel');
    await cancel!.trigger('click');
    expect(wrapper.find('li form').exists()).toBe(false);
    expect(endpoints.trips.updateItem).not.toHaveBeenCalled();
  });

  it('shows the server message when an edit is rejected and keeps the form open', async () => {
    vi.mocked(endpoints.trips.updateItem).mockRejectedValue(
      new ApiError(422, 'validation_error', 'Title is required', { title: 'Enter a title' }),
    );
    const { wrapper } = await open();
    await wrapper.get('button[aria-label="Edit Breakfast"]').trigger('click');
    await wrapper.get('li form').trigger('submit');
    await flushPromises();
    expect(wrapper.get('[role="status"]').text()).toContain('Title is required');
    expect(wrapper.find('li form').exists()).toBe(true);
  });

  it('rearranges: move up and down buttons call the API, and are disabled at the ends', async () => {
    vi.mocked(endpoints.trips.moveItem).mockResolvedValue({ item: item(2) });
    const { wrapper } = await open();
    expect(
      wrapper.get('button[aria-label="Move Breakfast up"]').attributes('disabled'),
    ).toBeDefined();
    expect(
      wrapper.get('button[aria-label="Move Flight SK100: JFK to NRT down"]').attributes('disabled'),
    ).toBeDefined();
    expect(
      wrapper.get('button[aria-label="Move Visit Shibuya station up"]').attributes('disabled'),
    ).toBeUndefined();

    await wrapper.get('button[aria-label="Move Visit Shibuya station up"]').trigger('click');
    await flushPromises();
    expect(endpoints.trips.moveItem).toHaveBeenCalledWith(3, 2, 'up');
    expect(endpoints.trips.get).toHaveBeenCalledTimes(2);

    await wrapper.get('button[aria-label="Move Visit Shibuya station down"]').trigger('click');
    await flushPromises();
    expect(endpoints.trips.moveItem).toHaveBeenLastCalledWith(3, 2, 'down');
  });

  it('shows an error if a move fails', async () => {
    vi.mocked(endpoints.trips.moveItem).mockRejectedValue(
      new ApiError(0, 'network_error', 'Cannot reach the server.'),
    );
    const { wrapper } = await open();
    await wrapper.get('button[aria-label="Move Visit Shibuya station up"]').trigger('click');
    await flushPromises();
    expect(wrapper.get('[role="status"]').text()).toContain('Cannot reach the server');
  });

  it('links to flights and hotels pre-filled with the trip destination and dates', async () => {
    const { wrapper } = await open();
    const links = wrapper.findAll('a').map((a) => a.attributes('href'));
    expect(
      links.some(
        (h) =>
          h?.includes('/flights') &&
          h.includes('destination=NRT') &&
          h.includes('depart=2026-11-05'),
      ),
    ).toBe(true);
    expect(
      links.some(
        (h) =>
          h?.includes('/hotels') &&
          h.includes('destination=tokyo') &&
          h.includes('checkOut=2026-11-06'),
      ),
    ).toBe(true);
  });

  it('shows "not found" for a trip that is missing or belongs to someone else', async () => {
    vi.mocked(endpoints.trips.get).mockRejectedValue(
      new ApiError(404, 'not_found', 'Trip not found'),
    );
    const { wrapper } = await open();
    expect(wrapper.text()).toContain('Trip not found');
  });

  it('shows a retryable error when loading fails', async () => {
    vi.mocked(endpoints.trips.get).mockRejectedValueOnce(
      new ApiError(0, 'network_error', 'Cannot reach the server.'),
    );
    const { wrapper } = await open();
    expect(wrapper.get('[role="alert"]').text()).toContain('Cannot reach the server');
    await wrapper.get('[role="alert"] button').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="day"]').exists()).toBe(true);
  });
});
