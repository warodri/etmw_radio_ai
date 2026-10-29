import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { VoiceReferenceController } from './voice-reference.controller.js';

const controller = new VoiceReferenceController();

export const voiceReferenceRoutes = Router();

voiceReferenceRoutes.get(
  '/stations/:slug/voice-references',
  requireAuth,
  controller.list,
);
voiceReferenceRoutes.post(
  '/stations/:slug/voice-references',
  requireAuth,
  controller.upload,
);
voiceReferenceRoutes.get(
  '/stations/:slug/voice-references/:referenceId/audio',
  requireAuth,
  controller.preview,
);
voiceReferenceRoutes.patch(
  '/stations/:slug/hosts/:hostId/voice-reference',
  requireAuth,
  controller.assign,
);
voiceReferenceRoutes.delete(
  '/stations/:slug/hosts/:hostId/voice-reference',
  requireAuth,
  controller.remove,
);
