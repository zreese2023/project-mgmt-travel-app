/**
 * Response shapes of the Wayfarer API. These mirror the server's types (the repo layout has no
 * shared package); server integration tests assert the same fields so drift fails the build.
 */

export type TempUnit = 'F' | 'C';

export interface User {
  id: number;
  email: string;
  name: string;
  role: 'user' | 'admin';
}

export interface DestinationSummary {
  id: number;
  slug: string;
  name: string;
  country: string;
  region: string;
  description: string;
  imageUrl: string;
  avgDailyCost: number;
  budgetTier: number;
  interests: string[];
}

export interface Activity {
  id: number;
  name: string;
  category: string;
  description: string;
  durationMin: number;
}

export interface DestinationDetail extends DestinationSummary {
  latitude: number;
  longitude: number;
  airportCode: string;
  activities: Activity[];
}

export interface BudgetTier {
  tier: number;
  label: string;
  description: string;
}

export interface DestinationFilterOptions {
  regions: string[];
  interests: string[];
  budgets: BudgetTier[];
}

export interface DestinationQuery {
  q?: string;
  region?: string[];
  budget?: number[];
  interest?: string[];
}

export type WeatherIcon =
  'clear' | 'partly-cloudy' | 'cloudy' | 'fog' | 'drizzle' | 'rain' | 'snow' | 'thunder';

export interface ForecastDay {
  date: string;
  condition: string;
  icon: WeatherIcon;
  high: number;
  low: number;
}

export type Weather =
  | {
      available: true;
      unit: TempUnit;
      fetchedAt: string;
      current: { temperature: number; condition: string; icon: WeatherIcon; windKmh: number };
      forecast: ForecastDay[];
    }
  | { available: false; reason: 'unreachable' | 'timeout' | 'bad_response' };

export interface Airport {
  code: string;
  name: string;
  city: string;
  country: string;
  isOrigin: boolean;
}

export interface Flight {
  id: number;
  flightNo: string;
  airline: string;
  origin: string;
  destination: string;
  departAt: string;
  arriveAt: string;
  durationMin: number;
  price: number;
  seatsAvailable: number;
  stops: number;
  status: 'on_time' | 'delayed' | 'cancelled';
}

export interface FlightSearch {
  origin: string;
  destination: string;
  depart: string;
  return?: string;
  maxPrice?: number;
  passengers?: number;
  sort?: 'price' | 'duration' | 'departure';
}

export interface FlightSearchResult {
  outbound: Flight[];
  return: Flight[] | null;
  note: string;
}

export interface PriceBreakdown {
  subtotal: number;
  taxes: number;
  total: number;
}

export interface RoomOption {
  id: number;
  name: string;
  capacity: number;
  nightlyPrice: number;
  price: PriceBreakdown;
}

export interface Hotel {
  id: number;
  name: string;
  destinationSlug: string;
  destinationName: string;
  rating: number;
  amenities: string[];
  address: string;
  imageUrl: string;
  nights: number;
  fromNightly: number;
  fromTotal: number;
  rooms: RoomOption[];
}

export interface HotelSearch {
  destination: string;
  checkIn: string;
  checkOut: string;
  guests?: number;
  maxPrice?: number;
  minRating?: number;
  amenity?: string[];
  sort?: 'price' | 'rating';
}

export type ItemKind = 'flight' | 'hotel' | 'activity' | 'note';

export interface ItineraryItem {
  id: number;
  tripId: number;
  kind: ItemKind;
  title: string;
  day: string;
  startTime: string | null;
  position: number;
  notes: string | null;
  activityId: number | null;
  flightId: number | null;
  hotelId: number | null;
}

export interface Trip {
  id: number;
  name: string;
  destination: { slug: string; name: string; imageUrl: string; airportCode: string };
  startDate: string;
  endDate: string;
  createdAt: string;
}

export interface TripListEntry extends Trip {
  itemCount: number;
}

export interface DayPlan {
  day: string;
  dayNumber: number | null;
  items: ItineraryItem[];
}

export interface TripDetail {
  trip: Trip;
  days: DayPlan[];
  summary: {
    days: number;
    items: number;
    byKind: Record<ItemKind, number>;
  };
}

export type NewItem =
  | { kind: 'activity'; activityId: number; day: string; startTime?: string }
  | { kind: 'activity' | 'note'; title: string; day: string; startTime?: string; notes?: string }
  | { kind: 'flight'; flightId: number }
  | { kind: 'hotel'; hotelId: number; checkIn: string; checkOut: string };

export interface NewTrip {
  destinationSlug: string;
  name: string;
  startDate: string;
  endDate: string;
}
