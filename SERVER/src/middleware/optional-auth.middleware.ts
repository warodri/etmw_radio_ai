import { NextFunction, Response } from 'express';
import { AuthService } from '../modules/auth/auth.service.js';
import { AuthenticatedRequest } from '../modules/auth/auth.types.js';
import { toPublicUser } from '../modules/users/user.model.js';
import { UserRepository } from '../modules/users/user.repository.js';

const authService = new AuthService();
const users = new UserRepository();

/**
 * Attaches the user when a valid bearer token is present, but never blocks the
 * request. Public pages use this so owners can preview unpublished stations.
 */
export async function optionalAuth(
  request: AuthenticatedRequest,
  _response: Response,
  next: NextFunction,
): Promise<void> {
  const header = request.header('authorization') ?? '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    next();
    return;
  }

  try {
    const payload = authService.verifyUserToken(token);
    const user = await users.findById(payload.sub);

    if (user && user.status === 'active') {
      request.user = toPublicUser(user);
    }
  } catch {
    // An invalid token simply means the request stays anonymous.
  }

  next();
}
