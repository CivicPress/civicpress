import { Router, Response } from 'express';
import { param } from 'express-validator';
import { AuthenticatedRequest, requirePermission } from '../middleware/auth';
import { sendSuccess, logApiRequest } from '../utils/api-logger';

export const hooksRouter = Router();

// GET /api/v1/hooks - List all hooks
hooksRouter.get(
  '/',
  requirePermission('hooks:view'),
  (req: AuthenticatedRequest, res: Response) => {
    logApiRequest(req, { operation: 'list_hooks' });

    sendSuccess(
      {
        hooks: [],
        total: 0,
      },
      req,
      res,
      { operation: 'list_hooks' }
    );
  }
);

// GET /api/v1/hooks/:id - Get a specific hook
hooksRouter.get(
  '/:id',
  requirePermission('hooks:view'),
  param('id').isString().notEmpty(),
  (req: AuthenticatedRequest, res: Response) => {
    logApiRequest(req, { operation: 'get_hook' });

    const { id } = req.params;
    sendSuccess(
      {
        id,
        name: 'Sample Hook',
        event: 'record:created',
      },
      req,
      res,
      { operation: 'get_hook' }
    );
  }
);

// POST /api/v1/hooks - Create a new hook
hooksRouter.post(
  '/',
  requirePermission('hooks:manage'),
  (req: AuthenticatedRequest, res: Response) => {
    logApiRequest(req, { operation: 'create_hook' });

    sendSuccess(
      {
        message: 'Hook created successfully',
      },
      req,
      res,
      {
        operation: 'create_hook',
        statusCode: 201,
      }
    );
  }
);

// PUT /api/v1/hooks/:id - Update a hook
hooksRouter.put(
  '/:id',
  requirePermission('hooks:manage'),
  param('id').isString().notEmpty(),
  (req: AuthenticatedRequest, res: Response) => {
    logApiRequest(req, { operation: 'update_hook' });

    const { id } = req.params;
    sendSuccess(
      {
        message: `Hook ${id} updated successfully`,
      },
      req,
      res,
      { operation: 'update_hook' }
    );
  }
);

// DELETE /api/v1/hooks/:id - Delete a hook
hooksRouter.delete(
  '/:id',
  requirePermission('hooks:manage'),
  param('id').isString().notEmpty(),
  (req: AuthenticatedRequest, res: Response) => {
    logApiRequest(req, { operation: 'delete_hook' });

    const { id } = req.params;
    sendSuccess(
      {
        message: `Hook ${id} deleted successfully`,
      },
      req,
      res,
      { operation: 'delete_hook' }
    );
  }
);
