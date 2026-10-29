import { Response } from 'express';
import { ApiError } from '../../utils/errors.js';
import { AuthenticatedRequest } from '../auth/auth.types.js';
import { ScriptService } from './script.service.js';
import {
  createScriptDraftSchema,
  scriptPageSchema,
  updateScriptDraftSchema,
} from './script.validation.js';

export class ScriptController {
  private readonly scripts = new ScriptService();

  list = async (
    request: AuthenticatedRequest,
    response: Response,
  ): Promise<void> => {
    const query = scriptPageSchema.parse(request.query);
    const result = await this.scripts.list(
      this.userId(request),
      String(request.params['slug'] ?? ''),
      query.page,
      query.pageSize,
    );

    response.json(result);
  };

  rerender = async (
    request: AuthenticatedRequest,
    response: Response,
  ): Promise<void> => {
    const script = await this.scripts.rerender(
      this.userId(request),
      String(request.params['slug'] ?? ''),
      String(request.params['scriptId'] ?? ''),
    );

    response.status(202).json({ script });
  };

  get = async (
    request: AuthenticatedRequest,
    response: Response,
  ): Promise<void> => {
    const script = await this.scripts.get(
      this.userId(request),
      String(request.params['slug'] ?? ''),
      String(request.params['scriptId'] ?? ''),
    );

    response.json({ script });
  };

  createDraft = async (
    request: AuthenticatedRequest,
    response: Response,
  ): Promise<void> => {
    const body = createScriptDraftSchema.parse(request.body);
    const script = await this.scripts.createDraft(
      this.userId(request),
      String(request.params['slug'] ?? ''),
      body,
    );

    response.status(201).json({ script });
  };

  updateDraft = async (
    request: AuthenticatedRequest,
    response: Response,
  ): Promise<void> => {
    const body = updateScriptDraftSchema.parse(request.body);
    const script = await this.scripts.updateDraft(
      this.userId(request),
      String(request.params['slug'] ?? ''),
      String(request.params['scriptId'] ?? ''),
      body,
    );

    response.json({ script });
  };

  approve = async (
    request: AuthenticatedRequest,
    response: Response,
  ): Promise<void> => {
    const script = await this.scripts.approve(
      this.userId(request),
      String(request.params['slug'] ?? ''),
      String(request.params['scriptId'] ?? ''),
    );

    response.status(202).json({ script });
  };

  retry = async (
    request: AuthenticatedRequest,
    response: Response,
  ): Promise<void> => {
    const script = await this.scripts.retry(
      this.userId(request),
      String(request.params['slug'] ?? ''),
      String(request.params['scriptId'] ?? ''),
    );

    response.status(202).json({ script });
  };

  audio = async (
    request: AuthenticatedRequest,
    response: Response,
  ): Promise<void> => {
    const audio = await this.scripts.getAudio(
      this.userId(request),
      String(request.params['slug'] ?? ''),
      String(request.params['scriptId'] ?? ''),
    );

    response.set({
      'Content-Type': audio.mimeType,
      'Cache-Control': 'private, max-age=3600',
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
