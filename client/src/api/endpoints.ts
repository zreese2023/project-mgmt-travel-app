import { api, type ApiClient } from './client';
import type {
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
      list: () => client.get<{ trips: TripListEntry[] }>('/trips'),
      create: (input: NewTrip) => client.post<{ trip: Trip }>('/trips', input),
      get: (id: number) => client.get<TripDetail>(`/trips/${id}`),
      remove: (id: number) => client.delete<void>(`/trips/${id}`),
      addItem: (tripId: number, item: NewItem) =>
        client.post<{ item: ItineraryItem }>(`/trips/${tripId}/items`, item),
      removeItem: (tripId: number, itemId: number) =>
        client.delete<void>(`/trips/${tripId}/items/${itemId}`),
    },
  };
}

export const endpoints = createEndpoints(api);
