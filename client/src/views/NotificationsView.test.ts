import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';
import type { AppNotification } from '../api/types';

vi.mock('../api/endpoints', () => ({
  endpoints: {
    notifications: { list: vi.fn(), readAll: vi.fn() },
    alerts: { scan: vi.fn() },
  },
}));

import { endpoints } from '../api/endpoints';
import { flushPromises, mountWithApp } from '../test/utils';
import NotificationsView from './NotificationsView.vue';

const notes: AppNotification[] = [
  {
    id: 3,
    type: 'delay',
    title: 'Flight SK226 is delayed',
    body: 'SK226 (JFK to DXB) on 2026-11-30 is delayed.',
    read: false,
    createdAt: '2026-11-07T12:00:00.000Z',
  },
  {
    id: 2,
    type: 'advisory',
    title: 'Travel advisory: Level 3 for Dubai',
    body: 'The U.S. Department of State advises "Reconsider Travel".',
    read: false,
    createdAt: '2026-11-07T11:59:00.000Z',
  },
  {
    id: 1,
    type: 'weather',
    title: 'Severe weather expected in Tokyo',
    body: 'Thunderstorm is forecast.',
    read: true,
    createdAt: '2026-11-06T09:00:00.000Z',
  },
];

const list = vi.mocked(endpoints.notifications.list);
const scan = vi.mocked(endpoints.alerts.scan);

beforeEach(() => {
  vi.resetAllMocks();
  list.mockResolvedValue({ notifications: notes, unread: 2 });
});
afterEach(() => {
  document.body.innerHTML = '';
});

const open = () => mountWithApp(NotificationsView, { location: '/notifications' });

describe('SCRUM-33: alerts page', () => {
  it('lists alerts newest first, with an icon per kind and "New" on unread ones', async () => {
    const { wrapper } = await open();
    const items = wrapper.findAll('[data-testid="notification"]');
    expect(items).toHaveLength(3);
    expect(items[0]!.text()).toContain('✈️');
    expect(items[0]!.text()).toContain('Flight SK226 is delayed');
    expect(items[0]!.text()).toContain('New');
    expect(items[1]!.text()).toContain('⚠️');
    expect(items[2]!.text()).toContain('⛈️');
    expect(items[2]!.text()).not.toContain('New');
    expect(items[0]!.text()).toContain('2026-11-07 12:00 UTC');
  });

  it('explains what is checked and that emails are simulated', async () => {
    const { wrapper } = await open();
    const text = wrapper.text();
    expect(text).toMatch(/severe weather/i);
    expect(text).toMatch(/advisory at level 3 or 4/i);
    expect(text).toMatch(/delayed or cancelled flights/i);
    expect(text).toMatch(/simulated email/i);
    expect(text).toMatch(/nothing is actually sent/i);
  });

  it('marks everything as read', async () => {
    vi.mocked(endpoints.notifications.readAll).mockResolvedValue({ updated: 2 });
    const { wrapper } = await open();
    await wrapper.get('[data-testid="mark-all-read"]').trigger('click');
    await flushPromises();
    expect(endpoints.notifications.readAll).toHaveBeenCalled();
    expect(wrapper.findAll('.chip').some((c) => c.text() === 'New')).toBe(false);
    expect(wrapper.get('[data-testid="mark-all-read"]').attributes('disabled')).toBeDefined();
  });

  it('is disabled for "mark all as read" when everything is already read', async () => {
    list.mockResolvedValue({ notifications: [notes[2] as AppNotification], unread: 0 });
    const { wrapper } = await open();
    expect(wrapper.get('[data-testid="mark-all-read"]').attributes('disabled')).toBeDefined();
  });

  it('checks the trips for alerts on request and reports how many are new', async () => {
    scan.mockResolvedValue({ created: 2 });
    const { wrapper } = await open();
    await wrapper.get('[data-testid="check-alerts"]').trigger('click');
    await flushPromises();
    expect(scan).toHaveBeenCalledOnce();
    expect(list).toHaveBeenCalledTimes(2); // reloaded after the scan
    expect(wrapper.get('[data-testid="scan-result"]').text()).toBe('2 new alerts found.');
  });

  it('says so when there is nothing new, and uses the singular for one', async () => {
    scan.mockResolvedValueOnce({ created: 0 });
    const { wrapper } = await open();
    await wrapper.get('[data-testid="check-alerts"]').trigger('click');
    await flushPromises();
    expect(wrapper.get('[data-testid="scan-result"]').text()).toBe(
      'No new alerts for your upcoming trips.',
    );

    scan.mockResolvedValueOnce({ created: 1 });
    await wrapper.get('[data-testid="check-alerts"]').trigger('click');
    await flushPromises();
    expect(wrapper.get('[data-testid="scan-result"]').text()).toBe('1 new alert found.');
  });

  it('shows the button as busy while checking', async () => {
    scan.mockReturnValue(new Promise(() => undefined));
    const { wrapper } = await open();
    await wrapper.get('[data-testid="check-alerts"]').trigger('click');
    const button = wrapper.get('[data-testid="check-alerts"]');
    expect(button.text()).toBe('Checking…');
    expect(button.attributes('disabled')).toBeDefined();
  });

  it('shows an error if the check fails', async () => {
    scan.mockRejectedValue(new ApiError(500, 'internal_error', 'Something went wrong'));
    const { wrapper } = await open();
    await wrapper.get('[data-testid="check-alerts"]').trigger('click');
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain('Something went wrong');
  });

  it('shows a friendly empty state and a retryable load error', async () => {
    list.mockResolvedValueOnce({ notifications: [], unread: 0 });
    const empty = await open();
    expect(empty.wrapper.get('[data-testid="no-notifications"]').text()).toMatch(/no alerts/i);

    list.mockRejectedValueOnce(new ApiError(0, 'network_error', 'Cannot reach the server.'));
    const failed = await open();
    expect(failed.wrapper.get('[role="alert"]').text()).toContain('Cannot reach the server');
    await failed.wrapper.get('[role="alert"] button').trigger('click');
    await flushPromises();
    expect(failed.wrapper.findAll('[data-testid="notification"]')).toHaveLength(3);
  });
});
