import { Response } from 'express';
import { ApiError } from '../../utils/errors.js';
import { AuthenticatedRequest } from '../auth/auth.types.js';
import { HostService } from './host.service.js';
import {
  createHostSchema,
  generateHostAvatarSchema,
  updateHostSchema,
} from './host.validation.js';

export class HostController {
  private readonly hosts = new HostService();

  list = async (
    request: AuthenticatedRequest,
    response: Response,
  ): Promise<void> => {
    const result = await this.hosts.list(
      this.userId(request),
      String(request.params['slug'] ?? ''),
    );

    response.json(result);
  };

  create = async (
    request: AuthenticatedRequest,
    response: Response,
  ): Promise<void> => {
    const body = createHostSchema.parse(request.body);
    const result = await this.hosts.create(
      this.userId(request),
      String(request.params['slug'] ?? ''),
      body,
    );

    response.status(201).json(result);
  };

  update = async (
    request: AuthenticatedRequest,
    response: Response,
  ): Promise<void> => {
    const body = updateHostSchema.parse(request.body);
    const result = await this.hosts.update(
      this.userId(request),
      String(request.params['slug'] ?? ''),
      String(request.params['hostId'] ?? ''),
      body,
    );

    response.json(result);
  };

  remove = async (
    request: AuthenticatedRequest,
    response: Response,
  ): Promise<void> => {
    await this.hosts.remove(
      this.userId(request),
      String(request.params['slug'] ?? ''),
      String(request.params['hostId'] ?? ''),
    );

    response.json({ success: true });
  };

  generateAvatar = async (
    request: AuthenticatedRequest,
    response: Response,
  ): Promise<void> => {
    const body = generateHostAvatarSchema.parse(request.body);
    const result = await this.hosts.generateAvatar(
      this.userId(request),
      String(request.params['slug'] ?? ''),
      body,
    );

    response.json(result);
  };

  avatar = async (
    request: AuthenticatedRequest,
    response: Response,
  ): Promise<void> => {
    const avatar = await this.hosts.avatar(
      String(request.params['hostId'] ?? ''),
    );

    if (!avatar) {
      throw new ApiError(404, 'AVATAR_NOT_FOUND', 'That host avatar does not exist.');
    }

    response.set({
      'Content-Type': avatar.mimeType,
      'Cache-Control': 'public, max-age=86400, immutable',
      'Cross-Origin-Resource-Policy': 'cross-origin',
    });
    response.send(avatar.data);
  };

  private userId(request: AuthenticatedRequest): string {
    if (!request.user) {
      throw new ApiError(401, 'AUTH_REQUIRED', 'Authentication is required.');
    }

    return request.user.id;
  }
}
