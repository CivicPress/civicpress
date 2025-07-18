import { Router, Response } from 'express';
import { AuthenticatedRequest, requirePermission } from '../middleware/auth';
import { sendSuccess, logApiRequest } from '../utils/api-logger';

export const searchRouter = Router();

// GET /api/v1/search - Search records
searchRouter.get(
  '/',
  requirePermission('records:view'),
  (req: AuthenticatedRequest, res: Response) => {
    logApiRequest(req, { operation: 'search_records' });

    sendSuccess(
      {
        results: [],
        total: 0,
        query: req.query.q || '',
      },
      req,
      res,
      { operation: 'search_records' }
    );
  }
);
