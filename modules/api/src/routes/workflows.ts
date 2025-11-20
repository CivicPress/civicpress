import { Router, Response } from 'express';
import { param } from 'express-validator';
import { AuthenticatedRequest, requirePermission } from '../middleware/auth.js';
import { sendSuccess, logApiRequest } from '../utils/api-logger.js';

export const workflowsRouter = Router();

// GET /api/v1/workflows - List all workflows
workflowsRouter.get(
  '/',
  requirePermission('workflows:view'),
  (req: AuthenticatedRequest, res: Response) => {
    logApiRequest(req, { operation: 'list_workflows' });

    sendSuccess(
      {
        workflows: [],
        total: 0,
      },
      req,
      res,
      { operation: 'list_workflows' }
    );
  }
);

// GET /api/v1/workflows/:id - Get a specific workflow
workflowsRouter.get(
  '/:id',
  requirePermission('workflows:view'),
  param('id').isString().notEmpty(),
  (req: AuthenticatedRequest, res: Response) => {
    logApiRequest(req, { operation: 'get_workflow' });

    const { id } = req.params;
    sendSuccess(
      {
        id,
        name: 'Sample Workflow',
        status: 'active',
      },
      req,
      res,
      { operation: 'get_workflow' }
    );
  }
);

// POST /api/v1/workflows - Create a new workflow
workflowsRouter.post(
  '/',
  requirePermission('workflows:manage'),
  (req: AuthenticatedRequest, res: Response) => {
    logApiRequest(req, { operation: 'create_workflow' });

    sendSuccess(
      {
        message: 'Workflow created successfully',
      },
      req,
      res,
      {
        operation: 'create_workflow',
        statusCode: 201,
      }
    );
  }
);

// PUT /api/v1/workflows/:id - Update a workflow
workflowsRouter.put(
  '/:id',
  requirePermission('workflows:manage'),
  param('id').isString().notEmpty(),
  (req: AuthenticatedRequest, res: Response) => {
    logApiRequest(req, { operation: 'update_workflow' });

    const { id } = req.params;
    sendSuccess(
      {
        message: `Workflow ${id} updated successfully`,
      },
      req,
      res,
      { operation: 'update_workflow' }
    );
  }
);

// DELETE /api/v1/workflows/:id - Delete a workflow
workflowsRouter.delete(
  '/:id',
  requirePermission('workflows:manage'),
  param('id').isString().notEmpty(),
  (req: AuthenticatedRequest, res: Response) => {
    logApiRequest(req, { operation: 'delete_workflow' });

    const { id } = req.params;
    sendSuccess(
      {
        message: `Workflow ${id} deleted successfully`,
      },
      req,
      res,
      { operation: 'delete_workflow' }
    );
  }
);
