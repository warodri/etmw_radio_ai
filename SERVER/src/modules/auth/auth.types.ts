import { Request } from 'express';
import { PublicUser } from '../users/user.model.js';

export interface AuthenticatedRequest extends Request {
  user?: PublicUser;
}

export interface JwtPayload {
  sub: string;
  email: string;
}

export interface SessionResponse {
  token: string;
  user: PublicUser;
}

export interface RequestCodeResponse {
  success: boolean;
  message: string;
  expiresInMinutes: number;
  devCode?: string;
}
