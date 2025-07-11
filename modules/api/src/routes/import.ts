import { Router, Response } from 'express';
import { AuthenticatedRequest, requirePermission } from '../middleware/auth';
import { sendSuccess, logApiRequest } from '../utils/api-logger';

export const importRouter = Router();

// POST /api/v1/import - Import data
importRouter.post(
  '/',
  requirePermission('records:import'),
  (req: AuthenticatedRequest, res: Response) => {
    logApiRequest(req, { operation: 'import_data' });

    sendSuccess(
      {
        message: 'Import functionality',
        formats: ['json', 'csv', 'markdown'],
      },
      req,
      res,
      { operation: 'import_data' }
    );
  }
);
