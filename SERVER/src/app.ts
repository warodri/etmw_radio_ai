import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from './config/env.js';
import { requireAuth } from './middleware/auth.middleware.js';
import { errorMiddleware, notFoundMiddleware } from './middleware/error.middleware.js';
import { AuthController } from './modules/auth/auth.controller.js';
import { autoGenerationCreatorRoutes, autoGenerationPublicRoutes } from './modules/auto-generation/auto-generation.routes.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { creatorRoutes } from './modules/creator/creator.routes.js';
import { hostCreatorRoutes, hostPublicRoutes } from './modules/hosts/host.routes.js';
import { playlistCreatorRoutes, radioPublicRoutes } from './modules/playlist/playlist.routes.js';
import { scriptRoutes } from './modules/scripts/script.routes.js';
import { stationRoutes } from './modules/stations/station.routes.js';

const authController = new AuthController();

export function createApp(): express.Application {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY);

  app.use(helmet());
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || env.corsOrigins.includes(origin)) {
          callback(null, true);
          return;
        }

        callback(null, false);
      },
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      maxAge: 86400,
    }),
  );

  app.get('/api/health', (_request, response) => {
    response.json({
      ok: true,
      service: 'etmw-radio-ai',
      timestamp: new Date().toISOString(),
    });
  });

  app.use(express.json({ limit: '8mb' }));

  app.use('/api/auth', authRoutes);
  app.use('/api/generation', autoGenerationPublicRoutes);
  app.get('/api/me', requireAuth, authController.me);
  app.use('/api/stations', stationRoutes);
  app.use('/api/stations', radioPublicRoutes);
  app.use('/api/creator', creatorRoutes);
  app.use('/api/creator', hostCreatorRoutes);
  app.use('/api/creator', scriptRoutes);
  app.use('/api/creator', playlistCreatorRoutes);
  app.use('/api/creator', autoGenerationCreatorRoutes);
  app.use('/api/hosts', hostPublicRoutes);

  app.use(notFoundMiddleware);
  app.use(errorMiddleware);

  return app;
}
