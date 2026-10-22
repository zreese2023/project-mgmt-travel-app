export type QueryValue = string | number | boolean | Array<string | number> | undefined | null;
export type Query = Record<string, QueryValue>;

/** Error thrown for any failed API call; `status` is 0 when the server could not be reached. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: Record<string, string>;

  constructor(status: number, code: string, message: string, details: Record<string, string> = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export interface ApiClientOptions {
  fetch?: typeof fetch;
  baseUrl?: string;
}

/** Builds a query string, dropping empty values and joining arrays with commas. */
export function buildQuery(query: Query = {}): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      if (value.length > 0) params.set(key, value.join(','));
    } else {
      params.set(key, String(value));
    }
  }
  const text = params.toString();
  return text ? `?${text}` : '';
}

interface ErrorBody {
  error?: { code?: string; message?: string; details?: Record<string, string> };
}

export function createApiClient(options: ApiClientOptions = {}) {
  const baseUrl = options.baseUrl ?? '/api';

  async function request<T>(
    method: string,
    path: string,
    body?: unknown,
    query?: Query,
  ): Promise<T> {
    const doFetch = options.fetch ?? fetch;
    let response: Response;
    try {
      response = await doFetch(`${baseUrl}${path}${buildQuery(query)}`, {
        method,
        headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        credentials: 'same-origin',
      });
    } catch {
      throw new ApiError(
        0,
        'network_error',
        'Cannot reach the server. Check your connection and try again.',
      );
    }

    if (response.status === 204) return undefined as T;

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      if (response.ok)
        throw new ApiError(
          response.status,
          'bad_response',
          'The server sent an unexpected response.',
        );
      payload = undefined;
    }

    if (!response.ok) {
      const error = (payload as ErrorBody | undefined)?.error;
      throw new ApiError(
        response.status,
        error?.code ?? 'http_error',
        error?.message ?? `Request failed (${response.status})`,
        error?.details,
      );
    }
    return payload as T;
  }

  return {
    get: <T>(path: string, query?: Query) => request<T>('GET', path, undefined, query),
    post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
    patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
    put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
    delete: <T>(path: string) => request<T>('DELETE', path),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

/** The app-wide client. Tests create their own with a fake `fetch`. */
export const api: ApiClient = createApiClient();
