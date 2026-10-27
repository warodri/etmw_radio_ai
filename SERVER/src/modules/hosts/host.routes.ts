import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { HostController } from './host.controller.js';

const controller = new HostController();

export const hostCreatorRoutes = Router();

hostCreatorRoutes.get('/stations/:slug/hosts', requireAuth, controller.list);
hostCreatorRoutes.post(
  '/stations/:slug/hosts/avatar/generate',
  requireAuth,
  controller.generateAvatar,
);
hostCreatorRoutes.post('/stations/:slug/hosts', requireAuth, controller.create);
hostCreatorRoutes.patch(
  '/stations/:slug/hosts/:hostId',
  requireAuth,
  controller.update,
);
hostCreatorRoutes.delete(
  '/stations/:slug/hosts/:hostId',
  requireAuth,
  controller.remove,
);

export const hostPublicRoutes = Router();

hostPublicRoutes.get('/:hostId/avatar', controller.avatar);
