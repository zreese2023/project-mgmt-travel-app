import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';
import type { DestinationSummary } from '../api/types';

vi.mock('../api/endpoints', () => ({
  endpoints: { destinations: { search: vi.fn(), filters: vi.fn() } },
}));

import { endpoints } from '../api/endpoints';
import { SEARCH_DEBOUNCE_MS } from '../composables/useDestinationSearch';
import { flushPromises, mountWithApp } from '../test/utils';
import DestinationsView from './DestinationsView.vue';

const tokyo: DestinationSummary = {
  id: 1,
  slug: 'tokyo',
  name: 'Tokyo',
  country: 'Japan',
  region: 'Asia',
  description: 'd',
  imageUrl: '/img/destinations/tokyo.svg',
  avgDailyCost: 210,
  budgetTier: 3,
  interests: ['food'],
};
const paris: DestinationSummary = {
  ...tokyo,
  id: 2,
  slug: 'paris',
  name: 'Paris',
  country: 'France',
  region: 'Europe',
};

const search = vi.mocked(endpoints.destinations.search);

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetAllMocks();
  search.mockResolvedValue({ destinations: [tokyo, paris] });
  vi.mocked(endpoints.destinations.filters).mockResolvedValue({
    regions: ['Asia', 'Europe'],
    interests: ['food', 'beach'],
    budgets: [
      { tier: 1, label: '$', description: 'Budget' },
      { tier: 2, label: '$$', description: 'Moderate' },
    ],
  });
});
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

async function mountView(location = '/destinations') {
  const app = await mountWithApp(DestinationsView, { location });
  await flushPromises();
  return app;
}

describe('SCRUM-11: keyword search with debouncing', () => {
  it('loads all destinations on open and shows the count', async () => {
    const { wrapper } = await mountView();
    expect(search).toHaveBeenCalledTimes(1);
    expect(wrapper.findAll('[data-testid="destination-card"]')).toHaveLength(2);
    expect(wrapper.get('[data-testid="result-count"]').text()).toBe('2 destinations found');
  });

  it('waits for the user to stop typing, then searches once with the final text', async () => {
    const { wrapper } = await mountView();
    search.mockClear();
    const input = wrapper.get('[data-testid="destination-search"]');

    await input.setValue('t');
    await input.setValue('to');
    await input.setValue('tok');
    await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS - 1);
    expect(search).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await flushPromises();
    expect(search).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenCalledWith({ q: 'tok', region: [], budget: [], interest: [] });
  });

  it('starts the wait again on every keystroke', async () => {
    const { wrapper } = await mountView();
    search.mockClear();
    const input = wrapper.get('[data-testid="destination-search"]');
    await input.setValue('a');
    await vi.advanceTimersByTimeAsync(200);
    await input.setValue('ab');
    await vi.advanceTimersByTimeAsync(200);
    expect(search).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(100);
    expect(search).toHaveBeenCalledTimes(1);
  });

  it('starts from the keyword in the URL', async () => {
    await mountView('/destinations?q=tokyo');
    expect(search).toHaveBeenCalledWith({ q: 'tokyo', region: [], budget: [], interest: [] });
  });

  it('shows a friendly empty state when nothing matches', async () => {
    search.mockResolvedValue({ destinations: [] });
    const { wrapper } = await mountView();
    expect(wrapper.get('[data-testid="no-results"]').text()).toMatch(/no destinations match/i);
    expect(wrapper.find('[data-testid="destination-card"]').exists()).toBe(false);
  });

  it('shows an error with a retry, and recovers', async () => {
    search.mockRejectedValueOnce(new ApiError(0, 'network_error', 'Cannot reach the server.'));
    const { wrapper } = await mountView();
    expect(wrapper.get('[role="alert"]').text()).toContain('Cannot reach the server');
    await wrapper.get('[role="alert"] button').trigger('click');
    await flushPromises();
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(wrapper.findAll('[data-testid="destination-card"]')).toHaveLength(2);
  });

  it('ignores a slow response that arrives after a newer search', async () => {
    let resolveSlow: (v: { destinations: DestinationSummary[] }) => void = () => undefined;
    search.mockReset();
    search.mockResolvedValueOnce({ destinations: [tokyo, paris] });
    const { wrapper } = await mountView();

    search.mockReturnValueOnce(new Promise((resolve) => (resolveSlow = resolve)));
    await wrapper.get('[data-testid="destination-search"]').setValue('slow');
    await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);

    search.mockResolvedValueOnce({ destinations: [paris] });
    await wrapper.get('[data-testid="destination-search"]').setValue('fast');
    await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);
    await flushPromises();

    resolveSlow({ destinations: [tokyo, paris] });
    await flushPromises();
    expect(wrapper.findAll('[data-testid="destination-card"]')).toHaveLength(1);
    expect(wrapper.text()).toContain('Paris');
  });
});

describe('SCRUM-12: filters', () => {
  it('searches immediately (no debounce) when a filter is applied, and again when it is removed', async () => {
    const { wrapper } = await mountView();
    search.mockClear();

    await wrapper.get('input[type="checkbox"][value="Asia"]').setValue(true);
    await flushPromises();
    expect(search).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenLastCalledWith({ q: '', region: ['Asia'], budget: [], interest: [] });

    await wrapper.get('input[type="checkbox"][value="2"]').setValue(true);
    await wrapper.get('input[type="checkbox"][value="beach"]').setValue(true);
    await flushPromises();
    expect(search).toHaveBeenLastCalledWith({
      q: '',
      region: ['Asia'],
      budget: [2],
      interest: ['beach'],
    });

    await wrapper.get('[data-testid="clear-filters"]').trigger('click');
    await flushPromises();
    expect(search).toHaveBeenLastCalledWith({ q: '', region: [], budget: [], interest: [] });
    expect(wrapper.find('[data-testid="clear-filters"]').exists()).toBe(false);
  });

  it('still searches if the filter options cannot be loaded', async () => {
    vi.mocked(endpoints.destinations.filters).mockRejectedValue(
      new ApiError(500, 'internal_error', 'x'),
    );
    const { wrapper } = await mountView();
    expect(wrapper.findAll('[data-testid="destination-card"]')).toHaveLength(2);
    expect(wrapper.find('fieldset').exists()).toBe(false);
  });
});
