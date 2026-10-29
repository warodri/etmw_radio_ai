import { Request, Response } from 'express';
import { radioStream } from '../../services/radio-stream.service.js';
import { logger } from '../../utils/logger.js';
import { AuthenticatedRequest } from '../auth/auth.types.js';
import { PlaylistService } from './playlist.service.js';
import {
  previewPlaylistSchema,
  savePlaylistSchema,
} from './playlist.validation.js';

export class PlaylistController {
  private readonly playlists = new PlaylistService();

  get = async (
    request: AuthenticatedRequest,
    response: Response,
  ): Promise<void> => {
    const result = await this.playlists.getEditor(
      this.userId(request),
      String(request.params['slug'] ?? ''),
    );
    response.json(result);
  };

  save = async (
    request: AuthenticatedRequest,
    response: Response,
  ): Promise<void> => {
    const body = savePlaylistSchema.parse(request.body);
    const result = await this.playlists.save(
      this.userId(request),
      String(request.params['slug'] ?? ''),
      body,
    );
    response.json(result);
  };

  preview = async (
    request: AuthenticatedRequest,
    response: Response,
  ): Promise<void> => {
    const query = previewPlaylistSchema.parse(request.query);
    const audio = await this.playlists.renderPreview(
      this.userId(request),
      String(request.params['slug'] ?? ''),
      query.at,
      query.duration,
    );

    response.set({
      'Content-Type': 'audio/mpeg',
      'Cache-Control': 'private, no-store',
      'Content-Length': String(audio.length),
    });
    response.send(audio);
  };

  radio = async (request: Request, response: Response): Promise<void> => {
    const result = await this.playlists.getPublicRadio(
      String(request.params['slug'] ?? ''),
    );
    response.json(result);
  };

  stream = async (request: Request, response: Response): Promise<void> => {
    const context = await this.playlists.getPublicStreamContext(
      String(request.params['slug'] ?? ''),
    );
    const requestedStart = Number(request.query['start']);
    const startAt =
      Number.isFinite(requestedStart) && requestedStart >= 0
        ? requestedStart
        : null;

    this.setStreamHeaders(response, context.station.name, context.station.genres);
    response.status(200);
    response.flushHeaders();

    try {
      await radioStream.stream(context, response, startAt);
    } catch (error) {
      logger.error('radio.stream_failed', {
        slug: context.station.slug,
        message: error instanceof Error ? error.message : String(error),
      });
      response.destroy();
    }
  };

  head = async (request: Request, response: Response): Promise<void> => {
    const context = await this.playlists.getPublicStreamContext(
      String(request.params['slug'] ?? ''),
    );

    this.setStreamHeaders(response, context.station.name, context.station.genres);
    response.status(200).end();
  };

  private setStreamHeaders(
    response: Response,
    name: string,
    genres: string[],
  ): void {
    response.set({
      'Content-Type': 'audio/mpeg',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      'icy-name': name,
      'icy-genre': genres.join(' '),
      'icy-br': '128',
      'Access-Control-Allow-Origin': '*',
      'Cross-Origin-Resource-Policy': 'cross-origin',
    });
  }

  private userId(request: AuthenticatedRequest): string {
    if (!request.user) {
      throw new Error('Authentication is required.');
    }

    return request.user.id;
  }
}
