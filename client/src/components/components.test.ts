import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import type { Advisory, Weather } from '../api/types';
import AdvisoryBanner from './AdvisoryBanner.vue';
import WeatherBadge from './WeatherBadge.vue';
import WeatherPanel from './WeatherPanel.vue';

const advisory = (overrides: Partial<Advisory> = {}): Advisory => ({
  destinationSlug: 'paris',
  level: 2,
  label: 'Increased caution',
  summary: 'Sample advisory: watch for pickpockets.',
  categories: ['safety'],
  kind: 'sample',
  sourceLabel: 'Illustrative sample data, not official guidance',
  sourceUrl: null,
  updatedAt: null,
  ...overrides,
});

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

describe('SCRUM-15: AdvisoryBanner', () => {
  it.each([
    [1, 'Normal precautions'],
    [2, 'Increased caution'],
    [3, 'Reconsider travel'],
    [4, 'Do not travel'],
  ])('renders level %i with its label and colour class', (level, label) => {
    const wrapper = mount(AdvisoryBanner, { props: { advisory: advisory({ level, label }) } });
    const banner = wrapper.get('[data-testid="advisory-banner"]');
    expect(banner.classes()).toContain(`advisory--level-${level}`);
    expect(banner.text()).toContain(`Level ${level}: ${label}`);
  });

  it('shows the summary and categories', () => {
    const wrapper = mount(AdvisoryBanner, { props: { advisory: advisory() } });
    expect(wrapper.text()).toContain('watch for pickpockets');
    expect(wrapper.text()).toContain('safety');
  });

  it('always shows the "not official" label, using the disclaimer when given', () => {
    const plain = mount(AdvisoryBanner, { props: { advisory: advisory() } });
    expect(plain.get('[data-testid="advisory-disclaimer"]').text()).toMatch(/not official/i);
    const withDisclaimer = mount(AdvisoryBanner, {
      props: {
        advisory: advisory(),
        disclaimer: 'Illustrative sample data, not official guidance. Check your government.',
      },
    });
    expect(withDisclaimer.get('[data-testid="advisory-disclaimer"]').text()).toContain(
      'Check your government',
    );
  });

  it('shows a live advisory with its source, update date and a link to the full text', () => {
    const wrapper = mount(AdvisoryBanner, {
      props: {
        advisory: advisory({
          kind: 'live',
          sourceLabel: 'U.S. Department of State travel advisory for Brazil. Updated 2026-10-22.',
          sourceUrl: 'https://travel.state.gov/brazil.html',
          updatedAt: '2026-10-23T00:00:00.000Z',
        }),
      },
    });
    expect(wrapper.get('[data-testid="advisory-source"]').text()).toContain(
      'U.S. Department of State travel advisory for Brazil. Updated 2026-10-22.',
    );
    const link = wrapper.get('[data-testid="advisory-source"] a');
    expect(link.attributes('href')).toBe('https://travel.state.gov/brazil.html');
    expect(link.attributes('rel')).toContain('noopener');
    expect(link.attributes('target')).toBe('_blank');
    expect(wrapper.find('[data-testid="advisory-sample"]').exists()).toBe(false);
  });

  it('marks a fallback advisory as sample data and has no link', () => {
    const wrapper = mount(AdvisoryBanner, { props: { advisory: advisory() } });
    expect(wrapper.get('[data-testid="advisory-sample"]').text()).toBe('Sample data');
    expect(wrapper.find('[data-testid="advisory-source"] a').exists()).toBe(false);
  });

  it('omits the tag list when there are no categories', () => {
    const wrapper = mount(AdvisoryBanner, { props: { advisory: advisory({ categories: [] }) } });
    expect(wrapper.findAll('.chip')).toHaveLength(1); // only the "Sample data" chip
  });
});

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
