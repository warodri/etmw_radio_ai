import { Response } from 'express';
import { ApiError } from '../../utils/errors.js';
import { AuthenticatedRequest } from '../auth/auth.types.js';
import { StationService } from './station.service.js';
import {
  createStationSchema,
  updateStationSchema,
} from './station.validation.js';

export class StationController {
  private readonly stations = new StationService();

  listPublic = async (_request: AuthenticatedRequest, response: Response): Promise<void> => {
    const stations = await this.stations.listPublic();
    response.json({ stations });
  };

  listMine = async (request: AuthenticatedRequest, response: Response): Promise<void> => {
    const stations = await this.stations.listMine(this.userId(request));
    response.json({ stations });
  };

  getBySlug = async (request: AuthenticatedRequest, response: Response): Promise<void> => {
    const station = await this.stations.getVisibleBySlug(
      String(request.params['slug'] ?? ''),
      request.user?.id,
    );

    response.json({ station });
  };

  create = async (request: AuthenticatedRequest, response: Response): Promise<void> => {
    const body = createStationSchema.parse(request.body);
    const station = await this.stations.create(this.userId(request), body);

    response.status(201).json({ station });
  };

  update = async (request: AuthenticatedRequest, response: Response): Promise<void> => {
    const body = updateStationSchema.parse(request.body);
    const station = await this.stations.update(
      this.userId(request),
      String(request.params['id'] ?? ''),
      body,
    );

    response.json({ station });
  };

  remove = async (request: AuthenticatedRequest, response: Response): Promise<void> => {
    await this.stations.delete(
      this.userId(request),
      String(request.params['id'] ?? ''),
    );

    response.json({ success: true });
  };

  artwork = async (request: AuthenticatedRequest, response: Response): Promise<void> => {
    const artwork = await this.stations.getArtwork(
      String(request.params['id'] ?? ''),
    );

    if (!artwork) {
      throw new ApiError(404, 'ARTWORK_NOT_FOUND', 'That artwork does not exist.');
    }

    response.set({
      'Content-Type': artwork.mimeType,
      'Cache-Control': 'public, max-age=86400, immutable',
      'Cross-Origin-Resource-Policy': 'cross-origin',
    });
    response.send(artwork.data);
  };

  private userId(request: AuthenticatedRequest): string {
    if (!request.user) {
      throw new ApiError(401, 'AUTH_REQUIRED', 'Authentication is required.');
    }

    return request.user.id;
  }
}
