import type { FastifyError, FastifyInstance } from 'fastify';
import { AppError } from '../lib/errors.js';

export interface ErrorBody {
  error: { code: string; message: string; details?: Record<string, string> };
}

/** One error shape for the whole API: { error: { code, message, details? } }. */
export function registerErrorHandling(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError | AppError, request, reply) => {
    if (error instanceof AppError) {
      const body: ErrorBody = {
        error: {
          code: error.code,
          message: error.message,
          ...(error.details ? { details: error.details } : {}),
        },
      };
      return reply.status(error.statusCode).send(body);
    }

    if ('validation' in error && error.validation) {
      const details: Record<string, string> = {};
      for (const issue of error.validation) {
        const field =
          (issue.instancePath || '/').replace(/^\//, '').replace(/\//g, '.') ||
          String((issue.params as { missingProperty?: string }).missingProperty ?? 'request');
        details[field] = issue.message ?? 'Invalid value';
      }
      const body: ErrorBody = {
        error: { code: 'validation_error', message: 'The request is not valid', details },
      };
      return reply.status(400).send(body);
    }

    const status = error.statusCode ?? 500;
    if (status < 500) {
      const body: ErrorBody = { error: { code: 'bad_request', message: error.message } };
      return reply.status(status).send(body);
    }
    request.log.error(error);
    const body: ErrorBody = { error: { code: 'internal_error', message: 'Something went wrong' } };
    return reply.status(500).send(body);
  });

  app.setNotFoundHandler((_request, reply) => {
    const body: ErrorBody = { error: { code: 'not_found', message: 'Route not found' } };
    return reply.status(404).send(body);
  });
}
