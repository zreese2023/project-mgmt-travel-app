import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';
import type { Booking } from '../api/types';

vi.mock('../api/endpoints', () => ({
  endpoints: {
    bookings: { list: vi.fn(), changeStay: vi.fn(), remove: vi.fn() },
    trips: { list: vi.fn() },
  },
}));

import { endpoints } from '../api/endpoints';
import { flushPromises, mountWithApp } from '../test/utils';
import BookingsView from './BookingsView.vue';

const hotel: Booking = {
  id: 11,
  tripId: 3,
  tripName: 'Tokyo trip',
  destination: 'Tokyo',
  kind: 'hotel',
  title: 'Stay at Tokyo Grand Hotel',
  startDate: '2026-12-01',
  endDate: '2026-12-04',
  nights: 3,
  amount: 336,
  detail: null,
  status: 'planned',
  paidAt: null,
  isPast: false,
  canRemove: true,
  canChangeDates: true,
};
const flight: Booking = {
  ...hotel,
  id: 12,
  kind: 'flight',
  title: 'Flight SK100: JFK to NRT',
  endDate: '2026-12-01',
  nights: null,
  amount: 812.5,
  canChangeDates: false,
};
const paid: Booking = {
  ...hotel,
  id: 13,
  tripName: 'Paris trip',
  status: 'confirmed',
  paidAt: '2026-11-01T10:00:00.000Z',
  canRemove: false,
  canChangeDates: false,
};

const list = vi.mocked(endpoints.bookings.list);

beforeEach(() => {
  vi.resetAllMocks();
  list.mockResolvedValue({ bookings: [hotel, flight, paid] });
  vi.mocked(endpoints.trips.list).mockResolvedValue({ trips: [] });
});
afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

const open = () => mountWithApp(BookingsView, { location: '/bookings' });

describe('SCRUM-26: viewing bookings', () => {
  it('lists every flight and hotel with trip, type, dates, price and status', async () => {
    const { wrapper } = await open();
    expect(list).toHaveBeenCalledWith({ sort: 'date', order: 'asc', scope: 'all' });
    const rows = wrapper.findAll('[data-testid="booking-row"]');
    expect(rows).toHaveLength(3);
    expect(wrapper.get('[data-testid="booking-count"]').text()).toBe('3 bookings');

    const first = rows[0]!;
    expect(first.text()).toContain('Tokyo trip');
    expect(first.text()).toContain('Stay at Tokyo Grand Hotel');
    expect(first.text()).toContain('3 nights');
    expect(first.get('[data-testid="booking-amount"]').text()).toBe('$336.00');
    expect(first.get('[data-testid="booking-status"]').text()).toBe('Planned');
    expect(rows[1]!.get('[data-testid="booking-amount"]').text()).toBe('$812.50');
    expect(rows[1]!.text()).not.toContain('night'); // a flight has no nights
  });

  it('links each booking to its trip and shows the sample-data notice', async () => {
    const { wrapper } = await open();
    expect(wrapper.get('[data-testid="sample-notice"]').text()).toMatch(/sample data/i);
    const link = wrapper.get('[data-testid="booking-row"] a');
    expect(link.attributes('href')).toBe('/trips/3');
  });

  it('shows paid bookings as confirmed and locked, with the payment date', async () => {
    const { wrapper } = await open();
    const row = wrapper.findAll('[data-testid="booking-row"]')[2]!;
    expect(row.get('[data-testid="booking-status"]').text()).toBe('Confirmed');
    expect(row.text()).toContain('Paid 2026-11-01');
    expect(row.text()).toContain('Paid: locked');
    expect(row.find('button').exists()).toBe(false);
  });

  it('marks past bookings', async () => {
    list.mockResolvedValue({ bookings: [{ ...hotel, isPast: true, canChangeDates: false }] });
    const { wrapper } = await open();
    expect(wrapper.get('[data-testid="past-chip"]').text()).toBe('Past');
  });

  it('shows a friendly message when there are none, depending on the filter', async () => {
    list.mockResolvedValue({ bookings: [] });
    const { wrapper } = await open();
    expect(wrapper.get('[data-testid="no-bookings"]').text()).toMatch(/no bookings yet/i);
    await wrapper.get('#booking-scope').setValue('past');
    await flushPromises();
    expect(wrapper.get('[data-testid="no-bookings"]').text()).toBe('You have no past bookings.');
  });

  it('shows a retryable error if loading fails', async () => {
    list.mockRejectedValueOnce(new ApiError(0, 'network_error', 'Cannot reach the server.'));
    const { wrapper } = await open();
    expect(wrapper.get('[role="alert"]').text()).toContain('Cannot reach the server');
    await wrapper.get('[role="alert"] button').trigger('click');
    await flushPromises();
    expect(wrapper.findAll('[data-testid="booking-row"]')).toHaveLength(3);
  });
});

describe('SCRUM-26: sorting and filtering', () => {
  it('sorts by a column, then flips the direction when it is clicked again', async () => {
    const { wrapper } = await open();
    await wrapper.get('[data-testid="sort-price"]').trigger('click');
    await flushPromises();
    expect(list).toHaveBeenLastCalledWith({ sort: 'price', order: 'asc', scope: 'all' });

    await wrapper.get('[data-testid="sort-price"]').trigger('click');
    await flushPromises();
    expect(list).toHaveBeenLastCalledWith({ sort: 'price', order: 'desc', scope: 'all' });

    await wrapper.get('[data-testid="sort-trip"]').trigger('click');
    await flushPromises();
    expect(list).toHaveBeenLastCalledWith({ sort: 'trip', order: 'asc', scope: 'all' });
  });

  it('tells assistive tech and sighted users which column is sorted and how', async () => {
    const { wrapper } = await open();
    const header = (key: string) =>
      wrapper.get(`[data-testid="sort-${key}"]`).element.closest('th')!;
    expect(header('date').getAttribute('aria-sort')).toBe('ascending');
    expect(header('price').getAttribute('aria-sort')).toBe('none');
    expect(wrapper.get('[data-testid="sort-date"]').text()).toContain('▲');

    await wrapper.get('[data-testid="sort-date"]').trigger('click');
    await flushPromises();
    expect(header('date').getAttribute('aria-sort')).toBe('descending');
    expect(wrapper.get('[data-testid="sort-date"]').text()).toContain('▼');
  });

  it('filters to upcoming or past bookings', async () => {
    const { wrapper } = await open();
    await wrapper.get('#booking-scope').setValue('upcoming');
    await flushPromises();
    expect(list).toHaveBeenLastCalledWith({ sort: 'date', order: 'asc', scope: 'upcoming' });
    await wrapper.get('#booking-scope').setValue('past');
    await flushPromises();
    expect(list).toHaveBeenLastCalledWith({ sort: 'date', order: 'asc', scope: 'past' });
  });
});

describe('SCRUM-26: modifying a booking', () => {
  it('offers "Change dates" only for upcoming planned hotel stays', async () => {
    const { wrapper } = await open();
    const rows = wrapper.findAll('[data-testid="booking-row"]');
    expect(rows[0]!.find('button[aria-label^="Change dates"]').exists()).toBe(true);
    expect(rows[1]!.find('button[aria-label^="Change dates"]').exists()).toBe(false); // flight
    expect(rows[2]!.find('button[aria-label^="Change dates"]').exists()).toBe(false); // paid
  });

  it('changes the dates, tells the user the new price, and reloads the list', async () => {
    vi.mocked(endpoints.bookings.changeStay).mockResolvedValue({
      booking: { ...hotel, endDate: '2026-12-06', nights: 5, amount: 560 },
    });
    const { wrapper } = await open();
    await wrapper
      .get('button[aria-label="Change dates for Stay at Tokyo Grand Hotel"]')
      .trigger('click');

    expect((wrapper.get('#in-11').element as HTMLInputElement).value).toBe('2026-12-01');
    expect((wrapper.get('#out-11').element as HTMLInputElement).value).toBe('2026-12-04');
    await wrapper.get('#in-11').setValue('2026-12-02');
    await wrapper.get('#out-11').setValue('2026-12-07');
    await wrapper.get('form[aria-label^="Change dates"]').trigger('submit');
    await flushPromises();

    expect(endpoints.bookings.changeStay).toHaveBeenCalledWith(11, {
      checkIn: '2026-12-02',
      checkOut: '2026-12-07',
    });
    expect(wrapper.get('[role="status"]').text()).toBe('Dates changed: 5 nights, now $560.00.');
    expect(list).toHaveBeenCalledTimes(2);
    expect(wrapper.find('form[aria-label^="Change dates"]').exists()).toBe(false);
  });

  it('shows the server message and keeps the form open when the new dates are rejected', async () => {
    vi.mocked(endpoints.bookings.changeStay).mockRejectedValue(
      new ApiError(422, 'validation_error', 'Invalid hotel search', {
        checkOut: 'Check-out must be after check-in',
      }),
    );
    const { wrapper } = await open();
    await wrapper.get('button[aria-label^="Change dates"]').trigger('click');
    await wrapper.get('form[aria-label^="Change dates"]').trigger('submit');
    await flushPromises();
    expect(wrapper.get('[role="status"]').text()).toContain('Invalid hotel search');
    expect(wrapper.find('form[aria-label^="Change dates"]').exists()).toBe(true);
    expect(wrapper.find('.field--error').exists()).toBe(true);
  });

  it('can cancel the change without saving', async () => {
    const { wrapper } = await open();
    await wrapper.get('button[aria-label^="Change dates"]').trigger('click');
    const cancel = wrapper.findAll('form button').find((b) => b.text() === 'Cancel');
    await cancel!.trigger('click');
    expect(wrapper.find('form[aria-label^="Change dates"]').exists()).toBe(false);
    expect(endpoints.bookings.changeStay).not.toHaveBeenCalled();
  });
});

describe('SCRUM-26: removing a planned booking', () => {
  it('asks first, then removes it, reloads the list and refreshes the trips', async () => {
    vi.mocked(endpoints.bookings.remove).mockResolvedValue(undefined);
    const confirm = vi.spyOn(window, 'confirm');
    const { wrapper } = await open();
    const button = () => wrapper.get('button[aria-label="Remove Flight SK100: JFK to NRT"]');

    confirm.mockReturnValueOnce(false);
    await button().trigger('click');
    expect(endpoints.bookings.remove).not.toHaveBeenCalled();

    confirm.mockReturnValueOnce(true);
    await button().trigger('click');
    await flushPromises();
    expect(endpoints.bookings.remove).toHaveBeenCalledWith(12);
    expect(wrapper.get('[role="status"]').text()).toContain('Removed "Flight SK100: JFK to NRT"');
    expect(list).toHaveBeenCalledTimes(2);
    expect(endpoints.trips.list).toHaveBeenCalled();
  });

  it('shows the reason when a booking cannot be removed (e.g. its trip was just paid)', async () => {
    vi.mocked(endpoints.bookings.remove).mockRejectedValue(
      new ApiError(409, 'trip_paid', 'This trip has been paid for and can no longer be changed'),
    );
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { wrapper } = await open();
    await wrapper.get('button[aria-label^="Remove"]').trigger('click');
    await flushPromises();
    expect(wrapper.get('[role="status"]').text()).toContain('can no longer be changed');
  });
});
