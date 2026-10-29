import { Response } from 'express';
import { ApiError } from '../../utils/errors.js';
import { AuthenticatedRequest } from '../auth/auth.types.js';
import { VoiceReferenceService } from './voice-reference.service.js';
import {
  assignVoiceReferenceSchema,
  createVoiceReferenceSchema,
} from './voice-reference.validation.js';

export class VoiceReferenceController {
  private readonly references = new VoiceReferenceService();

  list = async (
    request: AuthenticatedRequest,
    response: Response,
  ): Promise<void> => {
    response.json({
      references: await this.references.list(
        this.userId(request),
        String(request.params['slug'] ?? ''),
      ),
    });
  };

  upload = async (
    request: AuthenticatedRequest,
    response: Response,
  ): Promise<void> => {
    const body = createVoiceReferenceSchema.parse(request.body);
    const reference = await this.references.upload(
      this.userId(request),
      String(request.params['slug'] ?? ''),
      body,
    );
    response.status(201).json({ reference });
  };

  preview = async (
    request: AuthenticatedRequest,
    response: Response,
  ): Promise<void> => {
    const audio = await this.references.preview(
      this.userId(request),
      String(request.params['slug'] ?? ''),
      String(request.params['referenceId'] ?? ''),
    );

    response.set({
      'Content-Type': audio.mimeType,
      'Cache-Control': 'private, max-age=300',
    });
    response.send(audio.data);
  };

  assign = async (
    request: AuthenticatedRequest,
    response: Response,
  ): Promise<void> => {
    const body = assignVoiceReferenceSchema.parse(request.body);
    const result = await this.references.assignToHost(
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
    const result = await this.references.removeFromHost(
      this.userId(request),
      String(request.params['slug'] ?? ''),
      String(request.params['hostId'] ?? ''),
    );
    response.json(result);
  };

  private userId(request: AuthenticatedRequest): string {
    if (!request.user) {
      throw new ApiError(401, 'AUTH_REQUIRED', 'Authentication is required.');
    }

    return request.user.id;
  }
}
