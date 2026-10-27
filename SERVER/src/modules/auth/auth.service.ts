import crypto from 'crypto';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { WithId } from 'mongodb';
import { env } from '../../config/env.js';
import { EmailService } from '../../services/email.service.js';
import { ApiError, RateLimitError } from '../../utils/errors.js';
import { PublicUser, toPublicUser, UserDocument } from '../users/user.model.js';
import { UserRepository } from '../users/user.repository.js';
import { AuthRateLimitService, authRateLimitService } from './auth-rate-limit.service.js';
import { JwtPayload, RequestCodeResponse, SessionResponse } from './auth.types.js';
import { OtpRepository } from './otp.repository.js';

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export class AuthService {
  constructor(
    private readonly users = new UserRepository(),
    private readonly otps = new OtpRepository(),
    private readonly emails = new EmailService(),
    private readonly rateLimit: AuthRateLimitService = authRateLimitService,
  ) {}

  async requestCode(
    emailInput: string,
    context: { ip?: string; userAgent?: string } = {},
  ): Promise<RequestCodeResponse> {
    const email = normalizeEmail(emailInput);

    if (!isValidEmail(email)) {
      throw new ApiError(400, 'INVALID_EMAIL', 'Enter a valid email address.');
    }

    const decision = this.rateLimit.check(email, context.ip);

    if (!decision.allowed) {
      throw new RateLimitError(
        'Too many code requests. Please wait a few minutes and try again.',
        decision.retryAfterSeconds,
      );
    }

    const code = crypto.randomBytes(3).toString('hex').toUpperCase();

    await this.otps.saveCode(email, code);

    try {
      await this.emails.sendVerificationCode(email, code);
    } catch {
      await this.otps.deleteCode(email);
      throw new ApiError(
        502,
        'EMAIL_SEND_FAILED',
        'We could not send the code right now. Please try again in a moment.',
      );
    }

    void this.emails.notifyAdminOfCodeRequest({
      email,
      requestedAt: new Date(),
      ip: context.ip,
      userAgent: context.userAgent,
    });

    return {
      success: true,
      message: `Verification code sent to ${email}`,
      expiresInMinutes: env.AUTH_CODE_TTL_MINUTES,
      ...(env.devCodeEnabled ? { devCode: code } : {}),
    };
  }

  async verifyCode(emailInput: string, codeInput: string): Promise<SessionResponse> {
    const email = normalizeEmail(emailInput);
    const code = codeInput.trim().toUpperCase();

    if (!isValidEmail(email)) {
      throw new ApiError(400, 'INVALID_EMAIL', 'Enter a valid email address.');
    }

    if (code.length !== 6) {
      throw new ApiError(400, 'INVALID_CODE', 'Enter the 6-character code from your email.');
    }

    const result = await this.otps.verifyCode(email, code);

    if (result === 'locked') {
      throw new RateLimitError(
        'Too many incorrect attempts. Request a new code and try again.',
        60,
      );
    }

    if (result === 'expired') {
      throw new ApiError(400, 'CODE_EXPIRED', 'That code has expired. Request a new one.');
    }

    if (result !== 'ok') {
      throw new ApiError(400, 'INVALID_CODE', 'That code is not correct. Please try again.');
    }

    const user = await this.findOrCreateUser(email);

    if (user.status !== 'active') {
      throw new ApiError(403, 'ACCOUNT_DISABLED', 'This account is not available.');
    }

    const updated = (await this.users.touchLogin(user._id)) ?? user;

    return this.createSession(toPublicUser(updated));
  }

  verifyUserToken(token: string): JwtPayload {
    try {
      const decoded = jwt.verify(token, env.JWT_SECRET);

      if (typeof decoded === 'string' || typeof decoded.sub !== 'string') {
        throw new Error('Malformed token payload');
      }

      return {
        sub: decoded.sub,
        email: typeof decoded.email === 'string' ? decoded.email : '',
      };
    } catch {
      throw new ApiError(401, 'INVALID_TOKEN', 'Authentication is required.');
    }
  }

  private createSession(user: PublicUser): SessionResponse {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
    };

    const token = jwt.sign(payload, env.JWT_SECRET, {
      expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'],
    });

    return { token, user };
  }

  private async findOrCreateUser(
    email: string,
  ): Promise<WithId<UserDocument>> {
    const existing = await this.users.findByEmail(email);

    if (existing) {
      return existing;
    }

    try {
      return await this.users.create(email);
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 11000) {
        const raced = await this.users.findByEmail(email);

        if (raced) {
          return raced;
        }
      }

      throw error;
    }
  }
}
