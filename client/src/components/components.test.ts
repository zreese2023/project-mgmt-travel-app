import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import type { Weather } from '../api/types';
import WeatherBadge from './WeatherBadge.vue';
import WeatherPanel from './WeatherPanel.vue';

const sunny: Weather = {
  available: true,
  unit: 'F',
  fetchedAt: '2026-10-21T14:30:00.000Z',
  current: { temperature: 72, condition: 'Light rain', icon: 'rain', windKmh: 12 },
  forecast: [
    { date: '2026-10-21', condition: 'Overcast', icon: 'cloudy', high: 75, low: 60 },
    { date: '2026-10-22', condition: 'Clear sky', icon: 'clear', high: 70, low: 58 },
  ],
};

describe('SCRUM-14: WeatherPanel states', () => {
  it('shows a loading state', () => {
    const wrapper = mount(WeatherPanel, { props: { weather: null, loading: true } });
    expect(wrapper.find('[data-testid="weather-loading"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="weather-success"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="weather-error"]').exists()).toBe(false);
  });

  it('shows the current conditions and the forecast on success', () => {
    const wrapper = mount(WeatherPanel, { props: { weather: sunny, loading: false } });
    expect(wrapper.find('[data-testid="weather-success"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('72°F, Light rain');
    expect(wrapper.text()).toContain('Wind 12 km/h');
    expect(wrapper.text()).toContain('14:30 UTC');
    expect(wrapper.findAll('.forecast__day')).toHaveLength(2);
    expect(wrapper.text()).toContain('75°F / 60°F');
  });

  it('uses the requested unit for every temperature', () => {
    const celsius: Weather = { ...sunny, unit: 'C' };
    const wrapper = mount(WeatherPanel, { props: { weather: celsius, loading: false } });
    expect(wrapper.text()).toContain('72°C');
  });

  it.each([
    ['unreachable', /unavailable/i],
    ['bad_response', /unavailable/i],
    ['timeout', /too long/i],
  ] as const)(
    'shows a graceful error for reason %s and offers a retry',
    async (reason, message) => {
      const wrapper = mount(WeatherPanel, {
        props: { weather: { available: false, reason }, loading: false },
      });
      expect(wrapper.get('[data-testid="weather-error"]').text()).toMatch(message);
      expect(wrapper.text()).toContain('The rest of the page still works');
      await wrapper.get('button').trigger('click');
      expect(wrapper.emitted('retry')).toHaveLength(1);
    },
  );

  it('treats a missing result as an error rather than crashing', () => {
    const wrapper = mount(WeatherPanel, { props: { weather: null, loading: false } });
    expect(wrapper.find('[data-testid="weather-error"]').exists()).toBe(true);
  });
});

describe('SCRUM-14: WeatherBadge popup', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  const mountBadge = (props: { weather: Weather | null; loading: boolean }) =>
    mount(WeatherBadge, { props: { ...props, placeName: 'Tokyo' }, attachTo: document.body });

  it('shows a compact label such as "72°F, Light rain"', () => {
    expect(
      mountBadge({ weather: sunny, loading: false }).get('[data-testid="weather-badge"]').text(),
    ).toContain('72°F, Light rain');
  });

  it('shows loading and unavailable labels', () => {
    expect(mountBadge({ weather: null, loading: true }).text()).toContain('Weather…');
    expect(
      mountBadge({ weather: { available: false, reason: 'timeout' }, loading: false }).text(),
    ).toContain('Weather unavailable');
  });

  it('opens a dialog with the weather panel and closes with the button', async () => {
    const wrapper = mountBadge({ weather: sunny, loading: false });
    expect(wrapper.find('[data-testid="weather-popup"]').exists()).toBe(false);
    await wrapper.get('[data-testid="weather-badge"]').trigger('click');
    const popup = wrapper.get('[data-testid="weather-popup"]');
    expect(popup.attributes('role')).toBe('dialog');
    expect(popup.text()).toContain('Weather in Tokyo');
    expect(popup.find('[data-testid="weather-success"]').exists()).toBe(true);
    await wrapper.get('button[aria-label="Close weather"]').trigger('click');
    expect(wrapper.find('[data-testid="weather-popup"]').exists()).toBe(false);
  });

  it('closes on Escape and relays retry from the panel', async () => {
    const wrapper = mountBadge({
      weather: { available: false, reason: 'unreachable' },
      loading: false,
    });
    await wrapper.get('[data-testid="weather-badge"]').trigger('click');
    await wrapper
      .get('[data-testid="weather-popup"] [data-testid="weather-error"] button')
      .trigger('click');
    expect(wrapper.emitted('retry')).toHaveLength(1);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="weather-popup"]').exists()).toBe(false);
  });
});
