/** An error that maps to a specific HTTP response: { error: { code, message, details? } }. */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details: Record<string, string> | undefined;

  constructor(statusCode: number, code: string, message: string, details?: Record<string, string>) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export const notFound = (what: string): AppError =>
  new AppError(404, 'not_found', `${what} not found`);

export const badRequest = (message: string, details?: Record<string, string>): AppError =>
  new AppError(422, 'validation_error', message, details);
