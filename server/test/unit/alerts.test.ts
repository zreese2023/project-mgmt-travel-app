import { describe, expect, it, vi } from 'vitest';
import type { Advisory, AdvisoryService, FeedAdvisory } from '../../src/lib/advisory.js';
import {
  SEVERE_CONDITIONS,
  advisoryAlert,
  flightStatusAlerts,
  scanForAlerts,
  severeWeatherAlerts,
  type AlertFlight,
  type AlertTrip,
} from '../../src/lib/alerts.js';
import type { ForecastDay, WeatherResult, WeatherService } from '../../src/lib/weather.js';
import { mockDb } from '../helpers/mockDb.js';

const TODAY = '2026-11-10';

const trip: AlertTrip = {
  id: 7,
  name: 'Tokyo trip',
  startDate: '2026-11-11',
  endDate: '2026-11-14',
  destination: { slug: 'tokyo', name: 'Tokyo', country: 'Japan', latitude: 35.7, longitude: 139.7 },
};

const day = (date: string, condition: string): ForecastDay => ({
  date,
  condition,
  icon: 'rain',
  high: 60,
  low: 50,
});

const advisory = (overrides: Partial<Advisory> = {}): Advisory => ({
  destinationSlug: 'tokyo',
  level: 3,
  label: 'Reconsider Travel',
  summary: 's',
  categories: [],
  kind: 'live',
  sourceLabel: 'U.S. Department of State',
  sourceUrl: null,
  updatedAt: null,
  ...overrides,
});

describe('SCRUM-33: severe weather alerts', () => {
  it('raises one alert per severe forecast day inside the trip, with a stable dedupe key', () => {
    const alerts = severeWeatherAlerts(
      trip,
      [
        day('2026-11-10', 'Thunderstorm'), // before the trip starts
        day('2026-11-11', 'Heavy rain'),
        day('2026-11-12', 'Clear sky'),
        day('2026-11-13', 'Snow'),
        day('2026-11-15', 'Thunderstorm'), // after the trip ends
      ],
      TODAY,
    );
    expect(alerts.map((a) => a.dedupeKey)).toEqual([
      'weather:7:2026-11-11',
      'weather:7:2026-11-13',
    ]);
    expect(alerts[0]).toMatchObject({
      type: 'weather',
      title: 'Severe weather expected in Tokyo',
      body: 'Heavy rain is forecast for 2026-11-11 during your trip "Tokyo trip".',
    });
  });

  it('ignores ordinary weather and days that are already past', () => {
    expect(
      severeWeatherAlerts(
        trip,
        [day('2026-11-11', 'Light rain'), day('2026-11-12', 'Overcast'), day('2026-11-13', 'Fog')],
        TODAY,
      ),
    ).toEqual([]);
    const ongoing = { ...trip, startDate: '2026-11-08' };
    expect(severeWeatherAlerts(ongoing, [day('2026-11-09', 'Thunderstorm')], TODAY)).toEqual([]);
    expect(severeWeatherAlerts(trip, [], TODAY)).toEqual([]);
  });

  it('treats thunderstorms, heavy rain, freezing rain and snow as inclement', () => {
    expect([...SEVERE_CONDITIONS].sort()).toEqual([
      'Freezing rain',
      'Heavy rain',
      'Snow',
      'Thunderstorm',
      'Thunderstorm with hail',
    ]);
  });
});

describe('SCRUM-33: advisory alerts', () => {
  it('alerts for a live level 3 or 4 advisory, with the level in the dedupe key', () => {
    expect(advisoryAlert(trip, advisory({ level: 3 }))).toMatchObject({
      type: 'advisory',
      title: 'Travel advisory: Level 3 for Tokyo',
      dedupeKey: 'advisory:7:3',
    });
    expect(advisoryAlert(trip, advisory({ level: 4, label: 'Do Not Travel' }))?.dedupeKey).toBe(
      'advisory:7:4',
    );
    expect(advisoryAlert(trip, advisory())?.body).toContain('U.S. Department of State advises');
  });

  it('stays quiet for levels 1 and 2, for a missing advisory and for made-up sample advisories', () => {
    expect(advisoryAlert(trip, advisory({ level: 2 }))).toBeNull();
    expect(advisoryAlert(trip, advisory({ level: 1 }))).toBeNull();
    expect(advisoryAlert(trip, null)).toBeNull();
    expect(advisoryAlert(trip, advisory({ kind: 'sample', level: 4 }))).toBeNull();
  });
});

describe('SCRUM-33: flight status alerts', () => {
  const flight = (id: number, status: string): AlertFlight => ({
    id,
    tripId: 7,
    flightNo: `SK${id}`,
    origin: 'JFK',
    destination: 'NRT',
    departDay: '2026-11-12',
    status,
  });

  it('alerts for delayed and cancelled flights only', () => {
    const alerts = flightStatusAlerts(trip, [
      flight(1, 'delayed'),
      flight(2, 'on_time'),
      flight(3, 'cancelled'),
    ]);
    expect(alerts.map((a) => [a.type, a.title, a.dedupeKey])).toEqual([
      ['delay', 'Flight SK1 is delayed', 'flight:7:1:delayed'],
      ['delay', 'Flight SK3 is cancelled', 'flight:7:3:cancelled'],
    ]);
    expect(alerts[0]?.body).toBe(
      'SK1 (JFK to NRT) on 2026-11-12 is delayed. It is part of your trip "Tokyo trip".',
    );
  });

  it('raises a new alert when the same flight changes from delayed to cancelled', () => {
    const [delayed] = flightStatusAlerts(trip, [flight(1, 'delayed')]);
    const [cancelled] = flightStatusAlerts(trip, [flight(1, 'cancelled')]);
    expect(delayed?.dedupeKey).not.toBe(cancelled?.dedupeKey);
  });
});

describe('SCRUM-33: scanning a user’s trips (mocked DB and services)', () => {
  const tripRow = {
    id: 7,
    name: 'Tokyo trip',
    start_date: '2026-11-11',
    end_date: '2026-11-14',
    slug: 'tokyo',
    destination_name: 'Tokyo',
    country: 'Japan',
    latitude: 35.7,
    longitude: 139.7,
  };
  const flightRow = {
    trip_id: 7,
    id: 3,
    flight_no: 'SK3',
    origin_code: 'JFK',
    dest_code: 'NRT',
    depart_at: new Date('2026-11-12T08:15:00Z'),
    status: 'delayed',
  };
  const feedEntry = (level: number): FeedAdvisory => ({
    country: 'Japan',
    level,
    label: 'Reconsider Travel',
    summaryHtml: '',
    link: '',
    updated: '',
  });
  const weatherService = (result: WeatherResult): WeatherService => ({
    getWeather: vi.fn(async () => result),
  });
  const forecast = (...days: ForecastDay[]): WeatherResult => ({
    available: true,
    unit: 'F',
    fetchedAt: '2026-11-10T12:00:00.000Z',
    current: { temperature: 60, condition: 'Clear sky', icon: 'clear', windKmh: 5 },
    forecast: days,
  });
  const advisories = (lookup: Awaited<ReturnType<AdvisoryService['lookup']>>): AdvisoryService => ({
    lookup: async () => lookup,
  });

  it('does nothing, and asks the database only once, when there are no upcoming trips', async () => {
    const { db, query } = mockDb([]);
    const weather = weatherService(forecast());
    expect(
      await scanForAlerts(
        db,
        { weather, advisories: advisories({ status: 'not_issued' }) },
        1,
        TODAY,
      ),
    ).toBe(0);
    expect(query).toHaveBeenCalledOnce();
    expect(weather.getWeather).not.toHaveBeenCalled();
  });

  it('creates a notification (and a simulated email) for weather, advisory and flight alerts', async () => {
    const { db, query } = mockDb(
      [tripRow],
      [flightRow],
      [{ id: 1 }],
      [], // flight notification + email
      [{ id: 2 }],
      [], // advisory
      [{ id: 3 }],
      [], // weather
    );
    const created = await scanForAlerts(
      db,
      {
        weather: weatherService(forecast(day('2026-11-12', 'Thunderstorm'))),
        advisories: advisories({ status: 'found', advisory: feedEntry(3) }),
      },
      1,
      TODAY,
    );
    expect(created).toBe(3);
    expect(query.mock.calls.filter(([sql]) => String(sql).includes('email_outbox'))).toHaveLength(
      3,
    );
    const types = query.mock.calls
      .filter(([sql]) => String(sql).includes('insert into notifications'))
      .map(([, values]) => (values as unknown[])[1]);
    expect(types).toEqual(['delay', 'advisory', 'weather']);
  });

  it('counts only new alerts: a repeated alert (conflict) creates no notification and no email', async () => {
    const { db, query } = mockDb([tripRow], [flightRow], [] /* insert ignored: already alerted */);
    const created = await scanForAlerts(
      db,
      { weather: weatherService(forecast()), advisories: advisories({ status: 'not_issued' }) },
      1,
      TODAY,
    );
    expect(created).toBe(0);
    expect(query.mock.calls.some(([sql]) => String(sql).includes('email_outbox'))).toBe(false);
  });

  it('skips the weather check, without failing, when the weather service is unavailable', async () => {
    const { db, query } = mockDb([tripRow], [], [{ id: 1 }], []);
    const created = await scanForAlerts(
      db,
      {
        weather: weatherService({ available: false, reason: 'timeout' }),
        advisories: advisories({ status: 'found', advisory: feedEntry(4) }),
      },
      1,
      TODAY,
    );
    expect(created).toBe(1);
    const types = query.mock.calls
      .filter(([sql]) => String(sql).includes('insert into notifications'))
      .map(([, values]) => (values as unknown[])[1]);
    expect(types).toEqual(['advisory']);
  });

  it('never alerts from the made-up sample advisory used when the State Department is unreachable', async () => {
    const sample = {
      level: 4,
      summary: 'x',
      categories: [],
      source_label: 'Illustrative sample data',
    };
    const { db, query } = mockDb([tripRow], [], [sample]);
    const created = await scanForAlerts(
      db,
      { weather: weatherService(forecast()), advisories: advisories({ status: 'unavailable' }) },
      1,
      TODAY,
    );
    expect(created).toBe(0);
    expect(
      query.mock.calls.some(([sql]) => String(sql).includes('insert into notifications')),
    ).toBe(false);
  });
});
