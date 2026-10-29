import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../auth/auth.types.js';
import { autoGeneration } from './auto-generation.service.js';

export class AutoGenerationController {
  private readonly generation = autoGeneration;

  get = async (
    request: AuthenticatedRequest,
    response: Response,
  ): Promise<void> => {
    const dashboard = await this.generation.getDashboard(
      this.userId(request),
      String(request.params['slug'] ?? ''),
    );
    response.json(dashboard);
  };

  start = async (
    request: AuthenticatedRequest,
    response: Response,
  ): Promise<void> => {
    const dashboard = await this.generation.startJob(
      this.userId(request),
      String(request.params['slug'] ?? ''),
    );
    response.status(202).json(dashboard);
  };

  status = async (_request: Request, response: Response): Promise<void> => {
    response.json(await this.generation.getActiveStatuses());
  };

  private userId(request: AuthenticatedRequest): string {
    if (!request.user) {
      throw new Error('Authentication is required.');
    }

    return request.user.id;
  }
}
