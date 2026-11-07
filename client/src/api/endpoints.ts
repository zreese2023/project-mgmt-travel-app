import { api, type ApiClient } from './client';
import type {
  AppNotification,
  Booking,
  BookingScope,
  BookingSort,
  SortOrder,
  TripScope,
  AdvisoryResponse,
  Airport,
  DestinationDetail,
  DestinationFilterOptions,
  DestinationQuery,
  DestinationSummary,
  FlightSearch,
  FlightSearchResult,
  Hotel,
  HotelSearch,
  ItineraryItem,
  NewItem,
  NewTrip,
  Payment,
  PaymentMethod,
  TempUnit,
  Trip,
  TripDetail,
  TripListEntry,
  User,
  Weather,
} from './types';

/** All endpoint functions, bound to a client (tests inject one with a fake fetch). */
export function createEndpoints(client: ApiClient) {
  return {
    auth: {
      register: (input: { email: string; name: string; password: string }) =>
        client.post<{ user: User }>('/auth/register', input),
      login: (input: { email: string; password: string }) =>
        client.post<{ user: User }>('/auth/login', input),
      logout: () => client.post<void>('/auth/logout'),
      me: () => client.get<{ user: User }>('/me'),
    },
    destinations: {
      search: (query: DestinationQuery = {}) =>
        client.get<{ destinations: DestinationSummary[] }>('/destinations', {
          q: query.q,
          region: query.region,
          budget: query.budget,
          interest: query.interest,
        }),
      filters: () => client.get<DestinationFilterOptions>('/destinations/filters'),
      get: (slug: string) =>
        client.get<{ destination: DestinationDetail }>(`/destinations/${encodeURIComponent(slug)}`),
      weather: (slug: string, unit: TempUnit) =>
        client.get<Weather>(`/destinations/${encodeURIComponent(slug)}/weather`, { unit }),
      advisory: (slug: string) =>
        client.get<AdvisoryResponse>(`/destinations/${encodeURIComponent(slug)}/advisory`),
    },
    bookings: {
      list: (query: { sort?: BookingSort; order?: SortOrder; scope?: BookingScope } = {}) =>
        client.get<{ bookings: Booking[] }>('/bookings', { ...query }),
      changeStay: (id: number, stay: { checkIn: string; checkOut: string }) =>
        client.patch<{ booking: Booking }>(`/bookings/${id}`, stay),
      remove: (id: number) => client.delete<void>(`/bookings/${id}`),
    },
    notifications: {
      list: () =>
        client.get<{ notifications: AppNotification[]; unread: number }>('/notifications'),
      readAll: () => client.post<{ updated: number }>('/notifications/read-all'),
    },
    alerts: {
      scan: () => client.post<{ created: number }>('/alerts/scan'),
    },
    travel: {
      airports: () =>
        client.get<{ airports: Airport[]; searchWindow: { from: string; to: string } }>(
          '/airports',
        ),
      flights: (search: FlightSearch) => client.get<FlightSearchResult>('/flights', { ...search }),
      hotels: (search: HotelSearch) =>
        client.get<{ hotels: Hotel[]; note: string }>('/hotels', { ...search }),
    },
    trips: {
      list: (scope?: TripScope) => client.get<{ trips: TripListEntry[] }>('/trips', { scope }),
      create: (input: NewTrip) => client.post<{ trip: Trip }>('/trips', input),
      get: (id: number) => client.get<TripDetail>(`/trips/${id}`),
      remove: (id: number) => client.delete<void>(`/trips/${id}`),
      addItem: (tripId: number, item: NewItem) =>
        client.post<{ item: ItineraryItem }>(`/trips/${tripId}/items`, item),
      updateItem: (
        tripId: number,
        itemId: number,
        patch: { title?: string; notes?: string | null; day?: string; startTime?: string | null },
      ) => client.patch<{ item: ItineraryItem }>(`/trips/${tripId}/items/${itemId}`, patch),
      moveItem: (tripId: number, itemId: number, direction: 'up' | 'down') =>
        client.post<{ item: ItineraryItem }>(`/trips/${tripId}/items/${itemId}/move`, {
          direction,
        }),
      removeItem: (tripId: number, itemId: number) =>
        client.delete<void>(`/trips/${tripId}/items/${itemId}`),
      pay: (tripId: number, method: PaymentMethod) =>
        client.post<{ payment: Payment }>(`/trips/${tripId}/payment`, { method }),
    },
  };
}

export const endpoints = createEndpoints(api);
