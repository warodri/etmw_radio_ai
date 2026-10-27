import { NextFunction, Response } from 'express';
import { AuthService } from '../modules/auth/auth.service.js';
import { AuthenticatedRequest } from '../modules/auth/auth.types.js';
import { toPublicUser } from '../modules/users/user.model.js';
import { UserRepository } from '../modules/users/user.repository.js';
import { ApiError } from '../utils/errors.js';

const authService = new AuthService();
const users = new UserRepository();

export async function requireAuth(
  request: AuthenticatedRequest,
  _response: Response,
  next: NextFunction,
): Promise<void> {
  const header = request.header('authorization') ?? '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    next(new ApiError(401, 'AUTH_REQUIRED', 'Authentication is required.'));
    return;
  }

  try {
    const payload = authService.verifyUserToken(token);
    const user = await users.findById(payload.sub);

    if (!user || user.status !== 'active') {
      next(new ApiError(401, 'AUTH_REQUIRED', 'Authentication is required.'));
      return;
    }

    request.user = toPublicUser(user);
    next();
  } catch (error) {
    next(error);
  }
}
