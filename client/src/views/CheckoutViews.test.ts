import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';
import type {
  Flight,
  FlightQuote,
  Hotel,
  HotelQuote,
  TripDetail,
  TripListEntry,
} from '../api/types';

vi.mock('../api/endpoints', () => ({
  endpoints: {
    travel: { flight: vi.fn(), hotel: vi.fn() },
    checkout: {
      quoteFlights: vi.fn(),
      bookFlights: vi.fn(),
      quoteHotel: vi.fn(),
      bookHotel: vi.fn(),
    },
    trips: { list: vi.fn(), get: vi.fn(), pay: vi.fn() },
  },
}));

import { endpoints } from '../api/endpoints';
import { flushPromises, mountWithApp } from '../test/utils';
import FlightCheckoutView from './FlightCheckoutView.vue';
import HotelCheckoutView from './HotelCheckoutView.vue';

const flight = (id: number, overrides: Partial<Flight> = {}): Flight => ({
  id,
  flightNo: `SK${id}`,
  airline: 'Skyline Air',
  origin: 'JFK',
  destination: 'NRT',
  departAt: '2026-12-01T09:00:00.000Z',
  arriveAt: '2026-12-01T23:00:00.000Z',
  durationMin: 840,
  price: 500,
  seatsAvailable: 20,
  stops: 0,
  status: 'on_time',
  ...overrides,
});
const outbound = flight(1);
const inbound = flight(3, {
  origin: 'NRT',
  destination: 'JFK',
  departAt: '2026-12-06T09:00:00.000Z',
  arriveAt: '2026-12-06T21:00:00.000Z',
});

const trip = (id: number, overrides: Partial<TripListEntry> = {}): TripListEntry => ({
  id,
  name: `Trip ${id}`,
  destination: { slug: 'tokyo', name: 'Tokyo', imageUrl: '/x.svg', airportCode: 'NRT' },
  startDate: '2026-11-30',
  endDate: '2026-12-08',
  createdAt: '2026-11-01T00:00:00.000Z',
  itemCount: 0,
  paid: false,
  isPast: false,
  ...overrides,
});

const legPrice = { passengers: 2, fare: 1000, taxes: 75, checkedBags: 1, baggage: 35, total: 1110 };
const flightQuote: FlightQuote = {
  legs: [
    { flight: outbound, price: legPrice },
    { flight: inbound, price: legPrice },
  ],
  passengers: [
    { fullName: 'Ada Lovelace', dateOfBirth: '1990-05-10', seat: 'window', checkedBags: 1 },
    { fullName: 'Byron Lovelace', dateOfBirth: '2016-03-02', seat: 'aisle', checkedBags: 0 },
  ],
  total: 2220,
};

const tripDetail = (overrides: Partial<TripDetail> = {}): TripDetail => ({
  trip: trip(5),
  days: [],
  summary: { days: 9, items: 2, byKind: { flight: 2, hotel: 0, activity: 0, note: 0 } },
  cost: {
    lines: [
      {
        itemId: 1,
        kind: 'flight',
        title: 'Flight SK1: JFK to NRT',
        amount: 1110,
        detail: '2 passengers · 1 checked bag',
      },
    ],
    total: 1110,
  },
  payment: null,
  ...overrides,
});

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  vi.mocked(endpoints.trips.list).mockResolvedValue({
    trips: [trip(5), trip(6, { name: 'Paris', startDate: '2027-02-01', endDate: '2027-02-05' })],
  });
  vi.mocked(endpoints.trips.get).mockResolvedValue(tripDetail());
});
afterEach(() => {
  document.body.innerHTML = '';
});

describe('SCRUM-15: flight checkout', () => {
  const open = (
    query: Record<string, string> = { outbound: '1', return: '3', passengers: '2' },
  ) => {
    vi.mocked(endpoints.travel.flight).mockImplementation(async (id) => ({
      flight: id === 1 ? outbound : inbound,
      note: '',
    }));
    return mountWithApp(FlightCheckoutView, { location: { name: 'checkout-flight', query } });
  };
  const currentStep = (wrapper: Awaited<ReturnType<typeof open>>['wrapper']) =>
    wrapper.get('[aria-current="step"]').text();

  async function fillPassengers(wrapper: Awaited<ReturnType<typeof open>>['wrapper']) {
    await wrapper.get('#p0-name').setValue('Ada Lovelace');
    await wrapper.get('#p0-dob').setValue('1990-05-10');
    await wrapper.get('#p0-seat').setValue('window');
    await wrapper.get('#p0-bags').setValue('1');
    await wrapper.get('#p1-name').setValue('Byron Lovelace');
    await wrapper.get('#p1-dob').setValue('2016-03-02');
    await wrapper.get('#p1-seat').setValue('aisle');
  }

  it('shows both legs and picks the only trip whose dates cover them', async () => {
    const { wrapper } = await open();
    expect(currentStep(wrapper)).toContain('Flights');
    expect(wrapper.findAll('[data-testid="checkout-leg"]')).toHaveLength(2);
    expect(wrapper.text()).toContain('$500.00 per passenger');
    const select = wrapper.get<HTMLSelectElement>('#checkout-trip');
    expect(select.element.value).toBe('5');
    const paris = wrapper.findAll('#checkout-trip option').find((o) => o.text().includes('Paris'));
    expect(paris?.attributes('disabled')).toBeDefined();
    expect(paris?.text()).toContain('dates do not match');
  });

  it('runs through passengers, fare review, booking and payment', async () => {
    vi.mocked(endpoints.checkout.quoteFlights).mockResolvedValue({ quote: flightQuote });
    vi.mocked(endpoints.checkout.bookFlights).mockResolvedValue({ items: [], quote: flightQuote });
    vi.mocked(endpoints.trips.pay).mockResolvedValue({
      payment: {
        id: 9,
        tripId: 5,
        amount: 1110,
        method: 'paypal',
        status: 'completed',
        createdAt: '2026-11-07T10:00:00.000Z',
      },
    });
    const { wrapper } = await open();
    await wrapper.get('[data-testid="next"]').trigger('click');
    expect(currentStep(wrapper)).toContain('Passengers');
    expect(wrapper.findAll('[data-testid="passenger"]')).toHaveLength(2);

    await fillPassengers(wrapper);
    await wrapper.get('form[aria-label="Passenger details"]').trigger('submit');
    await flushPromises();
    const input = {
      flightIds: [1, 3],
      passengers: [
        { fullName: 'Ada Lovelace', dateOfBirth: '1990-05-10', seat: 'window', checkedBags: 1 },
        { fullName: 'Byron Lovelace', dateOfBirth: '2016-03-02', seat: 'aisle', checkedBags: 0 },
      ],
    };
    expect(endpoints.checkout.quoteFlights).toHaveBeenCalledWith(input);

    expect(currentStep(wrapper)).toContain('Review fare');
    const fare = wrapper.findAll('[data-testid="fare-lines"]');
    expect(fare).toHaveLength(2);
    expect(fare[0]!.text()).toContain('2 passengers × $500.00');
    expect(fare[0]!.text()).toContain('Taxes and fees (7.5%)');
    expect(fare[0]!.text()).toContain('$35.00');
    expect(wrapper.get('[data-testid="quote-total"]').text()).toContain('$2,220.00');
    expect(wrapper.text()).toContain('Window seat');

    await wrapper.get('[data-testid="confirm"]').trigger('click');
    await flushPromises();
    expect(endpoints.checkout.bookFlights).toHaveBeenCalledWith(5, input);
    expect(currentStep(wrapper)).toContain('Payment');
    expect(wrapper.get('[data-testid="booked"]').text()).toContain('Booked 2 flights onto Trip 5');
    expect(wrapper.get('[data-testid="cost-line"]').text()).toContain(
      '2 passengers · 1 checked bag',
    );

    vi.mocked(endpoints.trips.get).mockResolvedValue(
      tripDetail({
        payment: {
          id: 9,
          tripId: 5,
          amount: 1110,
          method: 'paypal',
          status: 'completed',
          createdAt: '2026-11-07T10:00:00.000Z',
        },
      }),
    );
    await wrapper.get('#pay-method').setValue('paypal');
    await wrapper.get('form[aria-label="Pay for trip"]').trigger('submit');
    await flushPromises();
    expect(endpoints.trips.pay).toHaveBeenCalledWith(5, 'paypal');
    expect(wrapper.get('[data-testid="payment-receipt"]').text()).toContain('Receipt #9');
  });

  it('checks passengers before asking the server, including the adult rule', async () => {
    const { wrapper } = await open({ outbound: '1', passengers: '1' });
    await wrapper.get('[data-testid="next"]').trigger('click');
    await wrapper.get('form[aria-label="Passenger details"]').trigger('submit');
    expect(wrapper.text()).toContain('Enter the full name');
    expect(wrapper.text()).toContain('Enter a date of birth');

    await wrapper.get('#p0-name').setValue('Byron Lovelace');
    await wrapper.get('#p0-dob').setValue('2016-03-02');
    await wrapper.get('form[aria-label="Passenger details"]').trigger('submit');
    expect(wrapper.get('[data-testid="passengers-error"]').text()).toContain('18 or older');
    expect(endpoints.checkout.quoteFlights).not.toHaveBeenCalled();
  });

  it('shows server field errors beside the right passenger field', async () => {
    vi.mocked(endpoints.checkout.quoteFlights).mockRejectedValue(
      new ApiError(422, 'validation_error', 'Check the passenger details', {
        'passengers.1.fullName': 'Enter a full name of 2 to 100 characters',
      }),
    );
    const { wrapper } = await open();
    await wrapper.get('[data-testid="next"]').trigger('click');
    await fillPassengers(wrapper);
    await wrapper.get('form[aria-label="Passenger details"]').trigger('submit');
    await flushPromises();
    expect(currentStep(wrapper)).toContain('Passengers');
    const second = wrapper.findAll('[data-testid="passenger"]')[1]!;
    expect(second.text()).toContain('Enter a full name of 2 to 100 characters');
  });

  it('stays on the review when the flight sells out, and says why', async () => {
    vi.mocked(endpoints.checkout.quoteFlights).mockResolvedValue({ quote: flightQuote });
    vi.mocked(endpoints.checkout.bookFlights).mockRejectedValue(
      new ApiError(409, 'sold_out', 'Flight SK1 has only 1 seats left'),
    );
    const { wrapper } = await open();
    await wrapper.get('[data-testid="next"]').trigger('click');
    await fillPassengers(wrapper);
    await wrapper.get('form[aria-label="Passenger details"]').trigger('submit');
    await flushPromises();
    await wrapper.get('[data-testid="confirm"]').trigger('click');
    await flushPromises();
    expect(currentStep(wrapper)).toContain('Review fare');
    expect(wrapper.get('[role="alert"]').text()).toContain('only 1 seats left');
  });

  it('asks for a trip covering the dates when none does', async () => {
    vi.mocked(endpoints.trips.list).mockResolvedValue({
      trips: [trip(6, { name: 'Paris', startDate: '2027-02-01', endDate: '2027-02-05' })],
    });
    const { wrapper } = await open();
    expect(wrapper.get('[data-testid="no-fitting-trip"]').text()).toContain('Create a trip');
    await wrapper.get('[data-testid="next"]').trigger('click');
    expect(currentStep(wrapper)).toContain('Flights');
    expect(wrapper.text()).toContain('Choose the trip these flights are for');
  });

  it('explains when there is no flight to book', async () => {
    const { wrapper } = await mountWithApp(FlightCheckoutView, {
      location: { name: 'checkout-flight' },
    });
    expect(wrapper.get('[role="alert"]').text()).toContain('Choose a flight to book first');
    expect(endpoints.travel.flight).not.toHaveBeenCalled();
  });
});

describe('SCRUM-16: hotel checkout', () => {
  const hotel: Hotel = {
    id: 7,
    name: 'Tokyo Grand Hotel',
    destinationSlug: 'tokyo',
    destinationName: 'Tokyo',
    rating: 4.6,
    amenities: ['wifi'],
    address: '1 Central Plaza, Tokyo',
    imageUrl: '/x.svg',
    nights: 3,
    fromNightly: 100,
    fromTotal: 336,
    rooms: [
      {
        id: 71,
        name: 'Single King',
        capacity: 2,
        nightlyPrice: 100,
        price: { subtotal: 300, taxes: 36, total: 336 },
      },
      {
        id: 74,
        name: 'Suite',
        capacity: 4,
        nightlyPrice: 210,
        price: { subtotal: 630, taxes: 75.6, total: 705.6 },
      },
    ],
  };
  const hotelQuote: HotelQuote = {
    hotel: { id: 7, name: hotel.name, address: hotel.address, destinationName: 'Tokyo' },
    room: { id: 74, name: 'Suite', capacity: 4, nightlyPrice: 210 },
    checkIn: '2026-12-01',
    checkOut: '2026-12-04',
    guests: 3,
    requests: ['late_check_out', 'crib'],
    bill: {
      nights: 3,
      rooms: 1,
      nightlyPrice: 210,
      roomSubtotal: 630,
      fees: [{ request: 'late_check_out', amount: 40 }],
      subtotal: 670,
      taxes: 80.4,
      total: 750.4,
    },
  };
  const query = {
    hotel: '7',
    room: '71',
    checkIn: '2026-12-01',
    checkOut: '2026-12-04',
    guests: '3',
  };
  const open = (q: Record<string, string> = query) => {
    vi.mocked(endpoints.travel.hotel).mockResolvedValue({ hotel, note: '' });
    return mountWithApp(HotelCheckoutView, { location: { name: 'checkout-hotel', query: q } });
  };
  const currentStep = (wrapper: Awaited<ReturnType<typeof open>>['wrapper']) =>
    wrapper.get('[aria-current="step"]').text();

  it('loads the hotel for the stay and preselects the room from search', async () => {
    const { wrapper } = await open();
    expect(endpoints.travel.hotel).toHaveBeenCalledWith(7, {
      checkIn: '2026-12-01',
      checkOut: '2026-12-04',
    });
    expect(wrapper.text()).toContain('Tokyo Grand Hotel');
    expect(wrapper.findAll('[data-testid="room-choice"]')).toHaveLength(2);
    expect(wrapper.get<HTMLInputElement>('input[type="radio"][value="71"]').element.checked).toBe(
      true,
    );
  });

  it('will not continue with more guests than the rooms sleep', async () => {
    const { wrapper } = await open();
    await wrapper.get('[data-testid="next"]').trigger('click');
    expect(currentStep(wrapper)).toContain('Room');
    expect(wrapper.text()).toContain('sleep at most 2');

    await wrapper.get('#checkout-rooms').setValue('2');
    await wrapper.get('[data-testid="next"]').trigger('click');
    expect(currentStep(wrapper)).toContain('Guest');
  });

  it('runs through room, guest details and requests, the bill, booking and payment', async () => {
    vi.mocked(endpoints.checkout.quoteHotel).mockResolvedValue({ quote: hotelQuote });
    vi.mocked(endpoints.checkout.bookHotel).mockResolvedValue({
      item: {} as never,
      quote: hotelQuote,
    });
    const { wrapper } = await open();
    await wrapper.get('input[type="radio"][value="74"]').setValue(true);
    await wrapper.get('[data-testid="next"]').trigger('click');
    expect(currentStep(wrapper)).toContain('Guest');

    await wrapper.get('#guest-name').setValue('Grace Hopper');
    await wrapper.get('#guest-email').setValue('grace@example.com');
    await wrapper.get('#guest-phone').setValue('+1 555 010 2000');
    await wrapper.get('input[type="checkbox"][value="late_check_out"]').setValue(true);
    await wrapper.get('input[type="checkbox"][value="crib"]').setValue(true);
    await wrapper.get('#guest-note').setValue('Arriving late');
    expect(wrapper.text()).toContain('+$40 per stay');
    await wrapper.get('form[aria-label="Guest details"]').trigger('submit');
    await flushPromises();

    const selection = {
      hotelId: 7,
      roomTypeId: 74,
      checkIn: '2026-12-01',
      checkOut: '2026-12-04',
      rooms: 1,
      guests: 3,
      requests: ['late_check_out', 'crib'],
    };
    expect(endpoints.checkout.quoteHotel).toHaveBeenCalledWith(selection);
    expect(currentStep(wrapper)).toContain('Review bill');
    const bill = wrapper.get('[data-testid="bill-lines"]').text();
    expect(bill).toContain('Suite: 1 room × 3 nights × $210.00');
    expect(bill).toContain('Late check-out');
    expect(bill).toContain('Taxes (12%)');
    expect(wrapper.get('[data-testid="quote-total"]').text()).toBe('$750.40');
    expect(wrapper.text()).toContain('Late check-out, Crib');

    await wrapper.get('[data-testid="confirm"]').trigger('click');
    await flushPromises();
    expect(endpoints.checkout.bookHotel).toHaveBeenCalledWith(5, {
      ...selection,
      guest: { fullName: 'Grace Hopper', email: 'grace@example.com', phone: '+1 555 010 2000' },
      requestNote: 'Arriving late',
    });
    expect(currentStep(wrapper)).toContain('Payment');
    expect(wrapper.get('[data-testid="booked"]').text()).toContain(
      'Booked Suite at Tokyo Grand Hotel onto Trip 5',
    );
    expect(wrapper.find('[data-testid="pay"]').exists()).toBe(true);
  });

  it('checks the guest contact details before pricing', async () => {
    const { wrapper } = await open({ ...query, guests: '1' });
    await wrapper.get('[data-testid="next"]').trigger('click');
    await wrapper.get('#guest-email').setValue('grace@');
    await wrapper.get('form[aria-label="Guest details"]').trigger('submit');
    expect(wrapper.text()).toContain('Enter a valid email address');
    expect(wrapper.text()).toContain('Enter a phone number');
    expect(endpoints.checkout.quoteHotel).not.toHaveBeenCalled();
  });

  it('explains when the hotel or dates are missing', async () => {
    const { wrapper } = await mountWithApp(HotelCheckoutView, {
      location: { name: 'checkout-hotel', query: { hotel: '7' } },
    });
    expect(wrapper.get('[role="alert"]').text()).toContain('Choose a hotel and dates');
    expect(endpoints.travel.hotel).not.toHaveBeenCalled();
  });
});
