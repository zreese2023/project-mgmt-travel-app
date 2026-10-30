import { describe, expect, it, vi } from 'vitest';
import { ApiError, buildQuery, createApiClient } from './client';
import { createEndpoints } from './endpoints';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function clientWith(response: Response | (() => Promise<Response>)) {
  const fetch = vi.fn<typeof globalThis.fetch>(async () =>
    typeof response === 'function' ? response() : response.clone(),
  );
  return { fetch, client: createApiClient({ fetch }) };
}

describe('SCRUM-11: query string building', () => {
  it('drops empty values and joins arrays with commas', () => {
    expect(
      buildQuery({
        q: 'tokyo',
        region: ['Asia', 'Europe'],
        budget: [],
        x: undefined,
        y: null,
        z: '',
      }),
    ).toBe('?q=tokyo&region=Asia%2CEurope');
    expect(buildQuery({})).toBe('');
    expect(buildQuery()).toBe('');
    expect(buildQuery({ n: 0, flag: false })).toBe('?n=0&flag=false');
  });
});

describe('API client', () => {
  it('GETs JSON from /api with the query string', async () => {
    const { fetch, client } = clientWith(jsonResponse({ ok: true }));
    expect(await client.get('/destinations', { q: 'a b' })).toEqual({ ok: true });
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/destinations?q=a+b');
    expect(init.method).toBe('GET');
    expect(init.credentials).toBe('same-origin');
    expect(init.body).toBeUndefined();
  });

  it('sends JSON bodies with the right method and content type', async () => {
    const { fetch, client } = clientWith(jsonResponse({}));
    await client.post('/auth/login', { email: 'a@b.co' });
    await client.patch('/me', { name: 'x' });
    await client.put('/x', { a: 1 });
    await client.delete('/x');
    const calls = fetch.mock.calls.map(([, init]) => init as RequestInit);
    expect(calls.map((c) => c.method)).toEqual(['POST', 'PATCH', 'PUT', 'DELETE']);
    expect(calls[0]?.body).toBe('{"email":"a@b.co"}');
    expect(calls[0]?.headers).toEqual({ 'Content-Type': 'application/json' });
  });

  it('posts an empty JSON object when no body is given', async () => {
    const { fetch, client } = clientWith(jsonResponse({}));
    await client.post('/auth/logout');
    expect((fetch.mock.calls[0]?.[1] as RequestInit).body).toBe('{}');
  });

  it('returns undefined for 204 No Content', async () => {
    const { client } = clientWith(new Response(null, { status: 204 }));
    expect(await client.delete('/trips/1')).toBeUndefined();
  });

  it('throws an ApiError with code, message and field details from the server error body', async () => {
    const { client } = clientWith(
      jsonResponse(
        { error: { code: 'validation_error', message: 'Bad', details: { email: 'Invalid' } } },
        422,
      ),
    );
    const error = await client.post('/x').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 422,
      code: 'validation_error',
      message: 'Bad',
      details: { email: 'Invalid' },
    });
  });

  it('falls back to a generic error when the failure body is not JSON', async () => {
    const { client } = clientWith(new Response('<html>oops</html>', { status: 502 }));
    await expect(client.get('/x')).rejects.toMatchObject({
      status: 502,
      code: 'http_error',
      message: 'Request failed (502)',
    });
  });

  it('reports an unexpected non-JSON success response', async () => {
    const { client } = clientWith(new Response('hello', { status: 200 }));
    await expect(client.get('/x')).rejects.toMatchObject({ code: 'bad_response' });
  });

  it('turns a network failure into a friendly ApiError with status 0', async () => {
    const { client } = clientWith(() => Promise.reject(new TypeError('Failed to fetch')));
    await expect(client.get('/x')).rejects.toMatchObject({ status: 0, code: 'network_error' });
  });

  it('supports a custom base URL', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => jsonResponse({}));
    await createApiClient({ fetch, baseUrl: 'http://localhost:3001/api' }).get('/health');
    expect(fetch.mock.calls[0]?.[0]).toBe('http://localhost:3001/api/health');
  });
});

describe('Endpoint functions', () => {
  function endpoints() {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => jsonResponse({}));
    return { fetch, e: createEndpoints(createApiClient({ fetch })) };
  }
  const lastCall = (fetch: ReturnType<typeof endpoints>['fetch']) => {
    const [url, init] = fetch.mock.calls.at(-1) as [string, RequestInit];
    return { url, method: init.method, body: init.body };
  };

  it('maps destination search filters to query parameters', async () => {
    const { fetch, e } = endpoints();
    await e.destinations.search({
      q: 'tokyo',
      region: ['Asia'],
      budget: [1, 2],
      interest: ['food', 'beach'],
    });
    expect(lastCall(fetch).url).toBe(
      '/api/destinations?q=tokyo&region=Asia&budget=1%2C2&interest=food%2Cbeach',
    );
    await e.destinations.search();
    expect(lastCall(fetch).url).toBe('/api/destinations');
  });

  it('encodes slugs and passes the weather unit', async () => {
    const { fetch, e } = endpoints();
    await e.destinations.weather('rio de janeiro', 'C');
    expect(lastCall(fetch).url).toBe('/api/destinations/rio%20de%20janeiro/weather?unit=C');
    await e.destinations.get('tokyo');
    await e.destinations.advisory('tokyo');
    expect(fetch.mock.calls.map(([u]) => u)).toContain('/api/destinations/tokyo/advisory');
    await e.destinations.filters();
  });

  it('calls the flight and hotel search endpoints', async () => {
    const { fetch, e } = endpoints();
    await e.travel.flights({
      origin: 'JFK',
      destination: 'NRT',
      depart: '2026-11-05',
      return: '2026-11-12',
    });
    expect(lastCall(fetch).url).toBe(
      '/api/flights?origin=JFK&destination=NRT&depart=2026-11-05&return=2026-11-12',
    );
    await e.travel.hotels({
      destination: 'tokyo',
      checkIn: '2026-11-05',
      checkOut: '2026-11-08',
      amenity: ['pool', 'spa'],
    });
    expect(lastCall(fetch).url).toContain('amenity=pool%2Cspa');
    await e.travel.airports();
  });

  it('uses the right verbs and paths for auth and trips', async () => {
    const { fetch, e } = endpoints();
    await e.auth.login({ email: 'a@b.co', password: 'x' });
    expect(lastCall(fetch)).toMatchObject({ url: '/api/auth/login', method: 'POST' });
    await e.auth.register({ email: 'a@b.co', name: 'A', password: 'x' });
    await e.auth.logout();
    await e.auth.me();

    await e.trips.list();
    await e.trips.get(3);
    await e.trips.remove(3);
    expect(lastCall(fetch)).toMatchObject({ url: '/api/trips/3', method: 'DELETE' });
    await e.trips.addItem(3, { kind: 'note', title: 'x', day: '2026-11-05' });
    expect(lastCall(fetch)).toMatchObject({ url: '/api/trips/3/items', method: 'POST' });
    await e.trips.updateItem(3, 9, { title: 'y' });
    expect(lastCall(fetch)).toMatchObject({ url: '/api/trips/3/items/9', method: 'PATCH' });
    await e.trips.moveItem(3, 9, 'up');
    expect(lastCall(fetch)).toMatchObject({ url: '/api/trips/3/items/9/move', method: 'POST' });
    expect(lastCall(fetch).body).toBe('{"direction":"up"}');
    await e.trips.removeItem(3, 9);
    expect(lastCall(fetch)).toMatchObject({ url: '/api/trips/3/items/9', method: 'DELETE' });
  });
});
