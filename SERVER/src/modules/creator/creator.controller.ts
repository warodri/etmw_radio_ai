import { Response } from 'express';
import { ApiError } from '../../utils/errors.js';
import { AuthenticatedRequest } from '../auth/auth.types.js';
import { CreatorService } from './creator.service.js';
import {
  createCreatorSongSchema,
  creatorPageSchema,
} from './creator.validation.js';

export class CreatorController {
  private readonly creator = new CreatorService();

  getDashboard = async (
    request: AuthenticatedRequest,
    response: Response,
  ): Promise<void> => {
    const query = creatorPageSchema.parse(request.query);
    const dashboard = await this.creator.getDashboard(
      this.userId(request),
      String(request.params['slug'] ?? ''),
      query.page,
      query.pageSize,
    );

    response.json(dashboard);
  };

  createSong = async (
    request: AuthenticatedRequest,
    response: Response,
  ): Promise<void> => {
    const body = createCreatorSongSchema.parse(request.body);
    const result = await this.creator.createSong(
      this.userId(request),
      String(request.params['slug'] ?? ''),
      body,
    );

    response.status(202).json(result);
  };

  audio = async (
    request: AuthenticatedRequest,
    response: Response,
  ): Promise<void> => {
    const audio = await this.creator.getAudio(
      this.userId(request),
      String(request.params['slug'] ?? ''),
      String(request.params['songId'] ?? ''),
    );

    response.set({
      'Content-Type': audio.contentType,
      'Cache-Control': 'private, max-age=3600',
      'Cross-Origin-Resource-Policy': 'same-origin',
    });
    response.send(audio.data);
  };

  private userId(request: AuthenticatedRequest): string {
    if (!request.user) {
      throw new ApiError(401, 'AUTH_REQUIRED', 'Authentication is required.');
    }

    return request.user.id;
  }
}
