import { getAdvisory, type Advisory, type AdvisoryService } from './advisory.js';
import { todayIso } from './dates.js';
import type { Queryable } from './db.js';
import { createNotification, type NotificationType } from './notifications.js';
import type { ForecastDay, WeatherService } from './weather.js';

/** SCRUM-33: alerts for the user's upcoming trips. Raised on demand, never by a background job. */
export interface AlertCandidate {
  type: NotificationType;
  title: string;
  body: string;
  dedupeKey: string;
}

export interface AlertTrip {
  id: number;
  name: string;
  startDate: string;
  endDate: string;
  destination: { slug: string; name: string; country: string; latitude: number; longitude: number };
}

export interface AlertFlight {
  id: number;
  tripId: number;
  flightNo: string;
  origin: string;
  destination: string;
  departDay: string;
  status: string;
}

export interface AlertDeps {
  weather: WeatherService;
  advisories: AdvisoryService;
}

/** Forecast conditions treated as "inclement weather". */
export const SEVERE_CONDITIONS: ReadonlySet<string> = new Set([
  'Heavy rain',
  'Freezing rain',
  'Snow',
  'Thunderstorm',
  'Thunderstorm with hail',
]);

/** The advisory level at which an alert is raised (State Department level 3: Reconsider Travel). */
export const ADVISORY_ALERT_LEVEL = 3;

/** One alert per severe forecast day that falls inside the trip and is not already past. */
export function severeWeatherAlerts(
  trip: AlertTrip,
  forecast: readonly ForecastDay[],
  today: string,
): AlertCandidate[] {
  return forecast
    .filter(
      (day) =>
        SEVERE_CONDITIONS.has(day.condition) &&
        day.date >= today &&
        day.date >= trip.startDate &&
        day.date <= trip.endDate,
    )
    .map((day) => ({
      type: 'weather' as const,
      title: `Severe weather expected in ${trip.destination.name}`,
      body: `${day.condition} is forecast for ${day.date} during your trip "${trip.name}".`,
      dedupeKey: `weather:${trip.id}:${day.date}`,
    }));
}

/**
 * An alert for a live State Department advisory at level 3 or 4. Sample (fallback) advisories
 * are made up, so they never raise an alert. A changed level raises a new alert.
 */
export function advisoryAlert(trip: AlertTrip, advisory: Advisory | null): AlertCandidate | null {
  if (!advisory || advisory.kind !== 'live' || advisory.level < ADVISORY_ALERT_LEVEL) return null;
  return {
    type: 'advisory',
    title: `Travel advisory: Level ${advisory.level} for ${trip.destination.name}`,
    body:
      `The U.S. Department of State advises "${advisory.label}" for ${trip.destination.country} ` +
      `(your trip "${trip.name}"). Check travel.state.gov before you travel.`,
    dedupeKey: `advisory:${trip.id}:${advisory.level}`,
  };
}

/** One alert per delayed or cancelled flight on the trip. */
export function flightStatusAlerts(
  trip: AlertTrip,
  flights: readonly AlertFlight[],
): AlertCandidate[] {
  return flights
    .filter((f) => f.status === 'delayed' || f.status === 'cancelled')
    .map((f) => ({
      type: 'delay' as const,
      title: `Flight ${f.flightNo} is ${f.status}`,
      body: `${f.flightNo} (${f.origin} to ${f.destination}) on ${f.departDay} is ${f.status}. It is part of your trip "${trip.name}".`,
      dedupeKey: `flight:${trip.id}:${f.id}:${f.status}`,
    }));
}

interface TripRow {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  slug: string;
  destination_name: string;
  country: string;
  latitude: number;
  longitude: number;
}

interface FlightRow {
  trip_id: number;
  id: number;
  flight_no: string;
  origin_code: string;
  dest_code: string;
  depart_at: Date;
  status: string;
}

/**
 * Checks the user's upcoming trips for severe weather (live Open-Meteo forecast), a level 3 or 4
 * State Department advisory (live) and delayed or cancelled flights, and records a notification
 * (plus a simulated email) for anything new. Safe to run repeatedly: repeats are ignored.
 * Returns how many new alerts were created. If weather or advisories are unreachable, those
 * checks are skipped rather than failing the scan.
 */
export async function scanForAlerts(
  db: Queryable,
  deps: AlertDeps,
  userId: number,
  today: string = todayIso(),
): Promise<number> {
  const { rows: tripRows } = await db.query<TripRow>(
    `select t.id, t.name, t.start_date, t.end_date, d.slug, d.name as destination_name, d.country,
            d.latitude, d.longitude
     from trips t join destinations d on d.id = t.destination_id
     where t.user_id = $1 and t.end_date >= $2::date order by t.start_date, t.id`,
    [userId, today],
  );
  if (tripRows.length === 0) return 0;

  const { rows: flightRows } = await db.query<FlightRow>(
    `select i.trip_id, f.id, f.flight_no, f.origin_code, f.dest_code, f.depart_at, f.status
     from itinerary_items i
     join trips t on t.id = i.trip_id
     join flights f on f.id = i.flight_id
     where t.user_id = $1 and t.end_date >= $2::date and f.status in ('delayed', 'cancelled')
     order by f.depart_at, f.id`,
    [userId, today],
  );

  const perTrip = await Promise.all(
    tripRows.map(async (row): Promise<AlertCandidate[]> => {
      const trip: AlertTrip = {
        id: row.id,
        name: row.name,
        startDate: row.start_date,
        endDate: row.end_date,
        destination: {
          slug: row.slug,
          name: row.destination_name,
          country: row.country,
          latitude: row.latitude,
          longitude: row.longitude,
        },
      };
      const flights = flightRows
        .filter((f) => f.trip_id === row.id)
        .map((f) => ({
          id: f.id,
          tripId: f.trip_id,
          flightNo: f.flight_no,
          origin: f.origin_code,
          destination: f.dest_code,
          departDay: f.depart_at.toISOString().slice(0, 10),
          status: f.status,
        }));
      const [weather, advisory] = await Promise.all([
        deps.weather.getWeather(trip.destination.latitude, trip.destination.longitude, 'F'),
        getAdvisory(db, deps.advisories, trip.destination),
      ]);
      const advisoryCandidate = advisoryAlert(trip, advisory.advisory);
      return [
        ...flightStatusAlerts(trip, flights),
        ...(advisoryCandidate ? [advisoryCandidate] : []),
        ...(weather.available ? severeWeatherAlerts(trip, weather.forecast, today) : []),
      ];
    }),
  );

  let created = 0;
  for (const candidate of perTrip.flat()) {
    if ((await createNotification(db, { userId, ...candidate })) !== null) created += 1;
  }
  return created;
}
