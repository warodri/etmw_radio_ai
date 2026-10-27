import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { optionalAuth } from '../../middleware/optional-auth.middleware.js';
import { StationController } from './station.controller.js';

const controller = new StationController();

export const stationRoutes = Router();

stationRoutes.get('/public', controller.listPublic);
stationRoutes.get('/mine', requireAuth, controller.listMine);
stationRoutes.get('/:id/artwork', controller.artwork);

stationRoutes.post('/', requireAuth, controller.create);
stationRoutes.get('/:slug', optionalAuth, controller.getBySlug);
stationRoutes.patch('/:id', requireAuth, controller.update);
stationRoutes.delete('/:id', requireAuth, controller.remove);
