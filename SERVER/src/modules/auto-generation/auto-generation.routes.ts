import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { AutoGenerationController } from './auto-generation.controller.js';

const controller = new AutoGenerationController();

export const autoGenerationCreatorRoutes = Router();

autoGenerationCreatorRoutes.get(
  '/stations/:slug/auto-generation',
  requireAuth,
  controller.get,
);
autoGenerationCreatorRoutes.post(
  '/stations/:slug/auto-generation',
  requireAuth,
  controller.start,
);

export const autoGenerationPublicRoutes = Router();

autoGenerationPublicRoutes.get('/status', controller.status);
