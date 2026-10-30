import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';
import type { Advisory, DestinationDetail, Weather } from '../api/types';

vi.mock('../api/endpoints', () => ({
  endpoints: { destinations: { get: vi.fn(), advisory: vi.fn(), weather: vi.fn() } },
}));

import { endpoints } from '../api/endpoints';
import { flushPromises, mountWithApp } from '../test/utils';
import DestinationDetailView from './DestinationDetailView.vue';

const tokyo: DestinationDetail = {
  id: 1,
  slug: 'tokyo',
  name: 'Tokyo',
  country: 'Japan',
  region: 'Asia',
  description: 'Japan’s capital blends neon-lit districts with quiet shrines.',
  imageUrl: '/img/destinations/tokyo.svg',
  avgDailyCost: 210,
  budgetTier: 3,
  interests: ['food', 'culture'],
  latitude: 35.7,
  longitude: 139.7,
  airportCode: 'NRT',
  activities: [
    {
      id: 1,
      name: 'Senso-ji Temple',
      category: 'culture',
      description: 'Oldest temple.',
      durationMin: 120,
    },
    {
      id: 2,
      name: 'Tsukiji Market',
      category: 'food',
      description: 'Street food.',
      durationMin: 150,
    },
    {
      id: 3,
      name: 'Meiji Shrine',
      category: 'culture',
      description: 'Forest shrine.',
      durationMin: 90,
    },
  ],
};

const advisory: Advisory = {
  destinationSlug: 'tokyo',
  level: 1,
  label: 'Normal precautions',
  summary: 'Sample advisory: normal precautions.',
  categories: ['entry'],
  kind: 'live',
  sourceLabel: 'U.S. Department of State travel advisory for Japan. Updated 2026-10-22.',
  sourceUrl: 'https://travel.state.gov/japan.html',
  updatedAt: '2026-10-23T00:00:00.000Z',
};

const weather = (unit: 'F' | 'C', temperature: number): Weather => ({
  available: true,
  unit,
  fetchedAt: '2026-10-21T14:30:00.000Z',
  current: { temperature, condition: 'Light rain', icon: 'rain', windKmh: 9 },
  forecast: [{ date: '2026-10-21', condition: 'Overcast', icon: 'cloudy', high: 75, low: 60 }],
});

const open = (slug = 'tokyo') =>
  mountWithApp(DestinationDetailView, { location: { name: 'destination', params: { slug } } });

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(endpoints.destinations.advisory).mockResolvedValue({
    advisory,
    disclaimer: 'Published by the U.S. Department of State. Wayfarer is not an official source.',
  });
  vi.mocked(endpoints.destinations.get).mockResolvedValue({ destination: tokyo });
  vi.mocked(endpoints.destinations.weather).mockImplementation(async (_slug, unit) =>
    weather(unit, unit === 'F' ? 72 : 22),
  );
});
afterEach(() => {
  document.body.innerHTML = '';
});

describe('SCRUM-13: destination details', () => {
  it('shows the photo, description and a list of activities', async () => {
    const { wrapper } = await open();
    expect(wrapper.get('h1').text()).toBe('Tokyo');
    expect(wrapper.get('.dest-hero img').attributes('src')).toBe('/img/destinations/tokyo.svg');
    expect(wrapper.get('[data-testid="destination-description"]').text()).toContain('neon-lit');
    const activities = wrapper.findAll('[data-testid="activity-list"] li');
    expect(activities).toHaveLength(3);
    expect(activities[0]!.text()).toContain('Senso-ji Temple');
  });

  it('links to flight, hotel and itinerary planning pre-filled for this destination', async () => {
    const { wrapper } = await open();
    const hrefs = wrapper.findAll('a').map((a) => a.attributes('href') ?? '');
    expect(hrefs.some((h) => h.includes('/flights') && h.includes('destination=NRT'))).toBe(true);
    expect(hrefs.some((h) => h.includes('/hotels') && h.includes('destination=tokyo'))).toBe(true);
    expect(hrefs.some((h) => h.includes('/trips') && h.includes('destination=tokyo'))).toBe(true);
  });

  it('shows "not found" for an unknown destination', async () => {
    vi.mocked(endpoints.destinations.get).mockRejectedValue(
      new ApiError(404, 'not_found', 'Destination not found'),
    );
    const { wrapper } = await open('atlantis');
    expect(wrapper.get('[data-testid="destination-not-found"]').text()).toContain(
      'Destination not found',
    );
  });

  it('shows a retryable error if the destination cannot be loaded', async () => {
    vi.mocked(endpoints.destinations.get).mockRejectedValueOnce(
      new ApiError(0, 'network_error', 'Cannot reach the server.'),
    );
    const { wrapper } = await open();
    expect(wrapper.get('[role="alert"]').text()).toContain('Cannot reach the server');
    await wrapper.get('[role="alert"] button').trigger('click');
    await flushPromises();
    expect(wrapper.get('h1').text()).toBe('Tokyo');
  });
});

describe('SCRUM-15: advisory on the destination page', () => {
  it('shows the State Department advisory banner with its source and the not-official disclaimer', async () => {
    const { wrapper } = await open();
    expect(endpoints.destinations.advisory).toHaveBeenCalledWith('tokyo');
    expect(wrapper.get('[data-testid="advisory-banner"]').text()).toContain(
      'Level 1: Normal precautions',
    );
    expect(wrapper.get('[data-testid="advisory-disclaimer"]').text()).toMatch(
      /not an official source/i,
    );
    expect(wrapper.get('[data-testid="advisory-source"] a').attributes('href')).toBe(
      'https://travel.state.gov/japan.html',
    );
  });

  it('shows a higher level with its own styling', async () => {
    vi.mocked(endpoints.destinations.advisory).mockResolvedValue({
      advisory: { ...advisory, level: 3, label: 'Reconsider travel' },
      disclaimer: 'Illustrative sample data, not official guidance.',
    });
    const { wrapper } = await open();
    const banner = wrapper.get('[data-testid="advisory-banner"]');
    expect(banner.classes()).toContain('advisory--level-3');
    expect(banner.text()).toContain('Reconsider travel');
  });

  it('still renders the page when the advisory cannot be loaded', async () => {
    vi.mocked(endpoints.destinations.advisory).mockRejectedValue(
      new ApiError(500, 'internal_error', 'x'),
    );
    const { wrapper } = await open();
    expect(wrapper.find('[data-testid="advisory-banner"]').exists()).toBe(false);
    expect(wrapper.get('h1').text()).toBe('Tokyo');
  });

  it('shows a note instead of a banner when the State Department issues no advisory', async () => {
    vi.mocked(endpoints.destinations.advisory).mockResolvedValue({
      advisory: null,
      disclaimer: 'Published by the U.S. Department of State.',
      note: 'The U.S. Department of State does not publish a travel advisory for United States.',
    });
    const { wrapper } = await open();
    expect(wrapper.find('[data-testid="advisory-banner"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="advisory-note"]').text()).toContain('does not publish');
  });

  it('labels a fallback advisory as sample data', async () => {
    vi.mocked(endpoints.destinations.advisory).mockResolvedValue({
      advisory: {
        ...advisory,
        kind: 'sample',
        sourceUrl: null,
        updatedAt: null,
        sourceLabel: 'Illustrative sample data, not official guidance',
      },
      disclaimer: 'Illustrative sample data, not official guidance.',
    });
    const { wrapper } = await open();
    expect(wrapper.find('[data-testid="advisory-sample"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="advisory-source"] a').exists()).toBe(false);
  });
});

describe('SCRUM-14: weather on the destination page', () => {
  it('shows a badge such as "72°F, Light rain" and an inline panel', async () => {
    const { wrapper } = await open();
    expect(endpoints.destinations.weather).toHaveBeenCalledWith('tokyo', 'F');
    expect(wrapper.get('[data-testid="weather-badge"]').text()).toContain('72°F, Light rain');
    expect(wrapper.get('[data-testid="weather-success"]').text()).toContain('72°F, Light rain');
  });

  it('opens the weather popup from the badge', async () => {
    const { wrapper } = await open();
    expect(wrapper.find('[data-testid="weather-popup"]').exists()).toBe(false);
    await wrapper.get('[data-testid="weather-badge"]').trigger('click');
    expect(wrapper.get('[data-testid="weather-popup"]').text()).toContain('Weather in Tokyo');
  });

  it('reloads in Celsius when the unit is switched', async () => {
    const { wrapper } = await open();
    await wrapper.get('[data-testid="unit-select"]').setValue('C');
    await flushPromises();
    expect(endpoints.destinations.weather).toHaveBeenLastCalledWith('tokyo', 'C');
    expect(wrapper.get('[data-testid="weather-badge"]').text()).toContain('22°C');
  });

  it('degrades gracefully when the weather request fails, and retries', async () => {
    vi.mocked(endpoints.destinations.weather).mockRejectedValueOnce(
      new ApiError(0, 'network_error', 'down'),
    );
    const { wrapper } = await open();
    expect(wrapper.get('[data-testid="weather-badge"]').text()).toContain('Weather unavailable');
    expect(wrapper.get('[data-testid="weather-error"]').text()).toContain(
      'The rest of the page still works',
    );
    expect(wrapper.get('h1').text()).toBe('Tokyo');

    await wrapper.get('[data-testid="weather-error"] button').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="weather-success"]').exists()).toBe(true);
  });

  it('shows the unavailable state when the API reports it cannot reach the weather service', async () => {
    vi.mocked(endpoints.destinations.weather).mockResolvedValue({
      available: false,
      reason: 'timeout',
    });
    const { wrapper } = await open();
    expect(wrapper.get('[data-testid="weather-error"]').text()).toMatch(/too long/i);
  });
});
