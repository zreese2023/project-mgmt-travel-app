import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';
import type { Airport, Flight, Hotel } from '../api/types';

vi.mock('../api/endpoints', () => ({
  endpoints: {
    travel: { airports: vi.fn(), flights: vi.fn(), hotels: vi.fn() },
    destinations: { search: vi.fn() },
  },
}));

import { endpoints } from '../api/endpoints';
import { flushPromises, mountWithApp } from '../test/utils';
import FlightsView from './FlightsView.vue';
import HotelsView from './HotelsView.vue';

const airports: Airport[] = [
  { code: 'JFK', name: 'Kennedy', city: 'New York', country: 'US', isOrigin: true },
  { code: 'LAX', name: 'LAX', city: 'Los Angeles', country: 'US', isOrigin: true },
  { code: 'NRT', name: 'Narita', city: 'Tokyo', country: 'Japan', isOrigin: false },
];

const flight = (id: number, overrides: Partial<Flight> = {}): Flight => ({
  id,
  flightNo: `SK${id}`,
  airline: 'Skyline Air',
  origin: 'JFK',
  destination: 'NRT',
  departAt: '2026-11-05T08:15:00.000Z',
  arriveAt: '2026-11-05T22:15:00.000Z',
  durationMin: 840,
  price: 900,
  seatsAvailable: 12,
  stops: 0,
  status: 'on_time',
  ...overrides,
});

const hotel: Hotel = {
  id: 7,
  name: 'Tokyo Grand Hotel',
  destinationSlug: 'tokyo',
  destinationName: 'Tokyo',
  rating: 4.6,
  amenities: ['wifi', 'pool'],
  address: '1 Central Plaza, Tokyo',
  imageUrl: '/img/destinations/tokyo.svg',
  nights: 3,
  fromNightly: 100,
  fromTotal: 336,
  rooms: [
    {
      id: 71,
      name: 'Standard Room',
      capacity: 2,
      nightlyPrice: 100,
      price: { subtotal: 300, taxes: 36, total: 336 },
    },
  ],
};

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  vi.mocked(endpoints.travel.airports).mockResolvedValue({
    airports,
    searchWindow: { from: '2026-10-22', to: '2027-01-19' },
  });
});
afterEach(() => {
  document.body.innerHTML = '';
});

describe('SCRUM-21: flights page', () => {
  async function openAndSearch(location = '/flights') {
    const app = await mountWithApp(FlightsView, { location });
    await app.wrapper.get('#flight-destination').setValue('NRT');
    await app.wrapper.get('form[aria-label="Flight search"]').trigger('submit');
    await flushPromises();
    return app;
  }

  it('shows the sample-data notice and only offers origin airports in "From"', async () => {
    const { wrapper } = await mountWithApp(FlightsView, { location: '/flights' });
    expect(wrapper.get('[data-testid="sample-notice"]').text()).toMatch(/sample data/i);
    expect(wrapper.findAll('#flight-origin option').map((o) => o.attributes('value'))).toEqual([
      'JFK',
      'LAX',
    ]);
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeDefined(); // no destination yet
    expect(endpoints.travel.flights).not.toHaveBeenCalled();
  });

  it('searches with origin, destination, dates and passengers, and lists outbound and return flights', async () => {
    vi.mocked(endpoints.travel.flights).mockResolvedValue({
      outbound: [flight(1), flight(2)],
      return: [flight(3, { origin: 'NRT', destination: 'JFK' })],
      note: 'Sample flight data. Times are shown in UTC.',
    });
    const { wrapper } = await openAndSearch();
    const call = vi.mocked(endpoints.travel.flights).mock.calls[0]?.[0];
    expect(call).toMatchObject({
      origin: 'JFK',
      destination: 'NRT',
      passengers: 1,
      sort: 'departure',
    });
    expect(call?.depart).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(call?.return).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(wrapper.findAll('[data-testid="flight-card"]')).toHaveLength(3);
    expect(wrapper.text()).toContain('$900.00');
  });

  it('needs both legs chosen for a round trip, then continues to checkout with them', async () => {
    vi.mocked(endpoints.travel.flights).mockResolvedValue({
      outbound: [flight(1)],
      return: [flight(3, { origin: 'NRT', destination: 'JFK' })],
      note: '',
    });
    const { wrapper, router } = await openAndSearch();
    await wrapper.get('#flight-passengers').setValue('2');
    const cards = wrapper.findAll('[data-testid="flight-card"]');
    expect(wrapper.find('[data-testid="flight-summary"]').exists()).toBe(false);

    await cards[0]!.get('button').trigger('click');
    expect(wrapper.get('[data-testid="book-flight"]').attributes('disabled')).toBeDefined();
    expect(wrapper.get('[data-testid="flight-summary"]').text()).toContain('Choose a return');
    await cards[1]!.get('button').trigger('click');
    expect(wrapper.get('[data-testid="book-flight"]').attributes('disabled')).toBeUndefined();

    await wrapper.get('[data-testid="book-flight"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('checkout-flight');
    expect(router.currentRoute.value.query).toEqual({
      outbound: '1',
      return: '3',
      passengers: '2',
    });
  });

  it('books a one-way flight without a return leg', async () => {
    vi.mocked(endpoints.travel.flights).mockResolvedValue({
      outbound: [flight(1)],
      return: null,
      note: '',
    });
    const { wrapper, router } = await mountWithApp(FlightsView, { location: '/flights' });
    await wrapper.get('#flight-destination').setValue('NRT');
    await wrapper.get('input[type="checkbox"]').setValue(false);
    await wrapper.get('form[aria-label="Flight search"]').trigger('submit');
    await flushPromises();
    await wrapper.get('[data-testid="flight-card"] button').trigger('click');

    await wrapper.get('[data-testid="book-flight"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.query).toEqual({ outbound: '1', passengers: '1' });
  });

  it('shows an empty state when no flights match', async () => {
    vi.mocked(endpoints.travel.flights).mockResolvedValue({ outbound: [], return: [], note: '' });
    const { wrapper } = await openAndSearch();
    expect(wrapper.get('[data-testid="no-flights"]').text()).toMatch(/no flights match/i);
  });

  it('shows field errors from the server beside the right field', async () => {
    vi.mocked(endpoints.travel.flights).mockRejectedValue(
      new ApiError(422, 'validation_error', 'Invalid flight search', {
        depart: 'Departure date cannot be in the past',
      }),
    );
    const { wrapper } = await openAndSearch();
    expect(wrapper.text()).toContain('Departure date cannot be in the past');
    expect(wrapper.find('[data-testid="flight-card"]').exists()).toBe(false);
  });

  it('runs the search straight away when opened with a destination and date in the URL', async () => {
    vi.mocked(endpoints.travel.flights).mockResolvedValue({
      outbound: [flight(1)],
      return: null,
      note: '',
    });
    await mountWithApp(FlightsView, { location: '/flights?destination=NRT&depart=2026-11-05' });
    expect(endpoints.travel.flights).toHaveBeenCalledTimes(1);
    expect(vi.mocked(endpoints.travel.flights).mock.calls[0]?.[0]).toMatchObject({
      destination: 'NRT',
      depart: '2026-11-05',
    });
  });
});

describe('SCRUM-23/24: hotels page', () => {
  beforeEach(() => {
    vi.mocked(endpoints.destinations.search).mockResolvedValue({
      destinations: [{ slug: 'tokyo', name: 'Tokyo', country: 'Japan' } as never],
    });
  });

  async function openAndSearch(location = '/hotels') {
    const app = await mountWithApp(HotelsView, { location });
    await app.wrapper.get('#hotel-destination').setValue('tokyo');
    await app.wrapper.get('form[aria-label="Hotel search"]').trigger('submit');
    await flushPromises();
    return app;
  }

  it('searches by destination, dates and guests with the chosen filters', async () => {
    vi.mocked(endpoints.travel.hotels).mockResolvedValue({
      hotels: [hotel],
      note: 'Sample hotel data and prices.',
    });
    const { wrapper } = await openAndSearch();
    await wrapper.get('input[type="checkbox"][value="pool"]').setValue(true);
    await wrapper.get('#hotel-max').setValue('150');
    await wrapper.get('form[aria-label="Hotel search"]').trigger('submit');
    await flushPromises();

    const last = vi.mocked(endpoints.travel.hotels).mock.calls.at(-1)?.[0];
    expect(last).toMatchObject({
      destination: 'tokyo',
      guests: 2,
      sort: 'price',
      maxPrice: 150,
      amenity: ['pool'],
    });
    expect(wrapper.get('[data-testid="sample-notice"]').text()).toMatch(/sample data/i);
    expect(wrapper.get('[data-testid="hotel-card"]').text()).toContain('Tokyo Grand Hotel');
    expect(wrapper.get('[data-testid="room-option"]').text()).toContain('$336.00');
  });

  it('lists rooms with sample totals, each with a Book button that opens the checkout', async () => {
    vi.mocked(endpoints.travel.hotels).mockResolvedValue({ hotels: [hotel], note: '' });
    const { wrapper, router } = await openAndSearch();
    const room = wrapper.get('[data-testid="room-option"]');
    expect(room.text()).toContain('Standard Room');
    expect(room.text()).toContain('$336.00');

    await room.get('[data-testid="book-room"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('checkout-hotel');
    expect(router.currentRoute.value.query).toMatchObject({ hotel: '7', guests: '2' });
    expect(router.currentRoute.value.query.room).toBe(String(hotel.rooms[0]?.id));
    expect(router.currentRoute.value.query.checkIn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('shows an empty state, and server validation errors', async () => {
    vi.mocked(endpoints.travel.hotels).mockResolvedValueOnce({ hotels: [], note: '' });
    const { wrapper } = await openAndSearch();
    expect(wrapper.get('[data-testid="no-hotels"]').text()).toMatch(/no hotels/i);

    vi.mocked(endpoints.travel.hotels).mockRejectedValueOnce(
      new ApiError(422, 'validation_error', 'Invalid hotel search', {
        checkOut: 'Check-out must be after check-in',
      }),
    );
    await wrapper.get('form[aria-label="Hotel search"]').trigger('submit');
    await flushPromises();
    expect(wrapper.text()).toContain('Check-out must be after check-in');
  });
});
