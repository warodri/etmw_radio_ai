import { Response } from 'express';
import { z } from 'zod';
import { getClientIp } from '../../utils/client-ip.js';
import { AuthenticatedRequest } from './auth.types.js';
import { AuthService } from './auth.service.js';

const emailField = z
  .string()
  .trim()
  .min(1, 'Enter your email address.')
  .max(254, 'That email address is too long.')
  .email('Enter a valid email address.');

const requestCodeSchema = z.object({
  email: emailField,
});

const verifyCodeSchema = z.object({
  email: emailField,
  code: z.string().trim().length(6, 'The code must be 6 characters.'),
});

export class AuthController {
  private readonly auth = new AuthService();

  requestCode = async (request: AuthenticatedRequest, response: Response): Promise<void> => {
    const body = requestCodeSchema.parse(request.body);
    const result = await this.auth.requestCode(body.email, {
      ip: getClientIp(request),
      userAgent: request.headers['user-agent'],
    });

    response.json(result);
  };

  verifyCode = async (request: AuthenticatedRequest, response: Response): Promise<void> => {
    const body = verifyCodeSchema.parse(request.body);
    const result = await this.auth.verifyCode(body.email, body.code);

    response.json(result);
  };

  me = async (request: AuthenticatedRequest, response: Response): Promise<void> => {
    response.json({ user: request.user });
  };
}
