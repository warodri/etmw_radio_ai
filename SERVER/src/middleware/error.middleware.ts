import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { ApiError, RateLimitError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export function notFoundMiddleware(request: Request, response: Response): void {
  response.status(404).json({
    code: 'NOT_FOUND',
    message: `No route exists for ${request.method} ${request.path}.`,
  });
}

export function errorMiddleware(
  error: unknown,
  _request: Request,
  response: Response,
  _next: NextFunction,
): void {
  if (error instanceof RateLimitError) {
    response.set('Retry-After', String(error.retryAfterSeconds));
    response.status(error.status).json({ code: error.code, message: error.message });
    return;
  }

  if (error instanceof ApiError) {
    response.status(error.status).json({ code: error.code, message: error.message });
    return;
  }

  if (error instanceof ZodError) {
    const firstIssue = error.issues[0]?.message;
    response.status(400).json({
      code: 'VALIDATION_ERROR',
      message: firstIssue || 'Please check the submitted information.',
    });
    return;
  }

  if (error instanceof SyntaxError && 'body' in error) {
    response.status(400).json({ code: 'INVALID_JSON', message: 'The request body is not valid JSON.' });
    return;
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'type' in error &&
    (error as { type?: unknown }).type === 'entity.too.large'
  ) {
    response.status(413).json({
      code: 'PAYLOAD_TOO_LARGE',
      message: 'That upload is too large. Artwork must be 2 MB or smaller.',
    });
    return;
  }

  logger.error('http.unhandled_error', {
    message: error instanceof Error ? error.message : String(error),
  });
  response.status(500).json({
    code: 'INTERNAL_ERROR',
    message: 'The station could not complete that request. Please try again.',
  });
}
