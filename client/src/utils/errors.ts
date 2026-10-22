import { ApiError } from '../api/client';

/** A user-facing message for any thrown value. */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return 'Something went wrong. Please try again.';
}

/** Field-level messages from a 422/400 response, or an empty object. */
export function fieldErrors(err: unknown): Record<string, string> {
  return err instanceof ApiError ? err.details : {};
}
