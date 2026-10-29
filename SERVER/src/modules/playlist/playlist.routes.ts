import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { PlaylistController } from './playlist.controller.js';

const controller = new PlaylistController();

export const playlistCreatorRoutes = Router();

playlistCreatorRoutes.get(
  '/stations/:slug/playlist',
  requireAuth,
  controller.get,
);
playlistCreatorRoutes.put(
  '/stations/:slug/playlist',
  requireAuth,
  controller.save,
);
playlistCreatorRoutes.get(
  '/stations/:slug/playlist/preview',
  requireAuth,
  controller.preview,
);

export const radioPublicRoutes = Router();

radioPublicRoutes.get('/:slug/radio', controller.radio);
radioPublicRoutes.head('/:slug/stream.mp3', controller.head);
radioPublicRoutes.get('/:slug/stream.mp3', controller.stream);
