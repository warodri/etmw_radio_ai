import { ObjectId } from 'mongodb';
import { env } from '../../config/env.js';

export interface UserDocument {
  _id?: ObjectId;
  email: string;
  status: 'active' | 'blocked';
  createdAt: Date;
  lastLoginAt: Date | null;
}

export interface PublicUser {
  id: string;
  email: string;
  createdAt: string;
  lastLoginAt: string | null;
  isAdmin: boolean;
}

export function isAdminEmail(email: string): boolean {
  return env.adminEmails.includes(email.trim().toLowerCase());
}

export function toPublicUser(user: UserDocument & { _id: ObjectId }): PublicUser {
  return {
    id: user._id.toHexString(),
    email: user.email,
    createdAt: user.createdAt.toISOString(),
    lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
    isAdmin: isAdminEmail(user.email),
  };
}
