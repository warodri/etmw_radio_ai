import { Request } from 'express';

export function getClientIp(request: Request): string | undefined {
  const forwarded = request.headers['x-forwarded-for'];

  if (typeof forwarded === 'string' && forwarded.trim().length > 0) {
    return forwarded.split(',')[0]?.trim();
  }

  return request.ip || request.socket.remoteAddress || undefined;
}
