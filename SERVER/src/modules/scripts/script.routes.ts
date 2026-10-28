import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { ScriptController } from './script.controller.js';

const controller = new ScriptController();

export const scriptRoutes = Router();

scriptRoutes.get('/stations/:slug/scripts', requireAuth, controller.list);
scriptRoutes.post('/stations/:slug/scripts', requireAuth, controller.createDraft);
scriptRoutes.get(
  '/stations/:slug/scripts/:scriptId',
  requireAuth,
  controller.get,
);
scriptRoutes.patch(
  '/stations/:slug/scripts/:scriptId',
  requireAuth,
  controller.updateDraft,
);
scriptRoutes.post(
  '/stations/:slug/scripts/:scriptId/approve',
  requireAuth,
  controller.approve,
);
scriptRoutes.post(
  '/stations/:slug/scripts/:scriptId/retry',
  requireAuth,
  controller.retry,
);
scriptRoutes.get(
  '/stations/:slug/scripts/:scriptId/audio',
  requireAuth,
  controller.audio,
);
