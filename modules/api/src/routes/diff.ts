import { Router } from 'express';
import { registerDiffRoutes } from './diff/handlers.js';

export function createDiffRouter(): Router {
  const router = Router();
  registerDiffRoutes(router);
  return router;
}
