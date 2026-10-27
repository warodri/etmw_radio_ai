import { Router } from 'express';
import { AuthController } from './auth.controller.js';

const controller = new AuthController();

export const authRoutes = Router();

authRoutes.post('/request-code', controller.requestCode);
authRoutes.post('/verify-code', controller.verifyCode);
