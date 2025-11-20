import { Router, Response } from 'express';
import { AuthenticatedRequest, requirePermission } from '../middleware/auth.js';
import { sendSuccess, logApiRequest } from '../utils/api-logger.js';

export const exportRouter = Router();

// GET /api/v1/export - Export data
exportRouter.get(
  '/',
  requirePermission('records:export'),
  (req: AuthenticatedRequest, res: Response) => {
    logApiRequest(req, { operation: 'export_data' });

    sendSuccess(
      {
        message: 'Export functionality',
        formats: ['json', 'csv', 'markdown'],
      },
      req,
      res,
      { operation: 'export_data' }
    );
  }
);
