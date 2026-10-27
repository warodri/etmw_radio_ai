import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { CreatorController } from './creator.controller.js';

const controller = new CreatorController();

export const creatorRoutes = Router();

creatorRoutes.get('/stations/:slug', requireAuth, controller.getDashboard);
creatorRoutes.post('/stations/:slug/songs', requireAuth, controller.createSong);
creatorRoutes.get(
  '/stations/:slug/songs/:songId/audio',
  requireAuth,
  controller.audio,
);
