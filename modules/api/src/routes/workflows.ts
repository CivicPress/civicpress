import { Router, Response } from 'express';
import { param } from 'express-validator';
import { AuthenticatedRequest, requirePermission } from '../middleware/auth.js';
import { logApiRequest } from '../utils/api-logger.js';

export const workflowsRouter = Router();

// api-004 (Critical) — was returning fake 200 OK while looking live to
// callers. Now returns 501 Not Implemented with a clear message and
// planned milestone. Auth gates retained so the surface stays bounded.
const NOT_IMPLEMENTED = {
  error: 'not_implemented',
  code: 'NOT_IMPLEMENTED',
  message:
    'Workflow management is planned for v0.4.x. See docs/audits/2026-05-16-manifesto-fit-findings.md (api-004).',
  retry_after_milestone: 'v0.4.x',
};

// GET /api/v1/workflows - List all workflows
workflowsRouter.get(
  '/',
  requirePermission('workflows:view'),
  (req: AuthenticatedRequest, res: Response) => {
    logApiRequest(req, { operation: 'list_workflows', status: 'not_implemented' });
    res.status(501).json(NOT_IMPLEMENTED);
  }
);

// GET /api/v1/workflows/:id - Get a specific workflow
workflowsRouter.get(
  '/:id',
  requirePermission('workflows:view'),
  param('id').isString().notEmpty(),
  (req: AuthenticatedRequest, res: Response) => {
    logApiRequest(req, { operation: 'get_workflow', status: 'not_implemented' });
    res.status(501).json(NOT_IMPLEMENTED);
  }
);

// POST /api/v1/workflows - Create a new workflow
workflowsRouter.post(
  '/',
  requirePermission('workflows:manage'),
  (req: AuthenticatedRequest, res: Response) => {
    logApiRequest(req, { operation: 'create_workflow', status: 'not_implemented' });
    res.status(501).json(NOT_IMPLEMENTED);
  }
);

// PUT /api/v1/workflows/:id - Update a workflow
workflowsRouter.put(
  '/:id',
  requirePermission('workflows:manage'),
  param('id').isString().notEmpty(),
  (req: AuthenticatedRequest, res: Response) => {
    logApiRequest(req, { operation: 'update_workflow', status: 'not_implemented' });
    res.status(501).json(NOT_IMPLEMENTED);
  }
);

// DELETE /api/v1/workflows/:id - Delete a workflow
workflowsRouter.delete(
  '/:id',
  requirePermission('workflows:manage'),
  param('id').isString().notEmpty(),
  (req: AuthenticatedRequest, res: Response) => {
    logApiRequest(req, { operation: 'delete_workflow', status: 'not_implemented' });
    res.status(501).json(NOT_IMPLEMENTED);
  }
);
