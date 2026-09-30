import { Router, Response } from 'express';
import { param } from 'express-validator';
import { AuthenticatedRequest, requirePermission } from '../middleware/auth.js';
import { logApiRequest } from '../utils/api-logger.js';

export const hooksRouter = Router();

// api-004 (Critical) — was returning fake 200 OK while looking live to
// callers. Now returns 501 Not Implemented with a clear message. Auth gates
// retained so the surface stays bounded. The message named v0.4.x until
// 2026-09-30, when the programmable engine this would manage was split into
// its own, unscheduled milestone — so it names no release now.
const NOT_IMPLEMENTED = {
  success: false,
  error: {
    message:
      'Hook management is not implemented. It belongs to the programmable workflow engine, which is its own milestone with no release assigned (docs/plans/2026-08-11-v04x-scoping.md). See also docs/audits/2026-05-16-manifesto-fit-findings.md (api-004).',
    code: 'NOT_IMPLEMENTED',
  },
};

// GET /api/v1/hooks - List all hooks
hooksRouter.get(
  '/',
  requirePermission('hooks:view'),
  (req: AuthenticatedRequest, res: Response) => {
    logApiRequest(req, { operation: 'list_hooks', status: 'not_implemented' });
    res.status(501).json(NOT_IMPLEMENTED);
  }
);

// GET /api/v1/hooks/:id - Get a specific hook
hooksRouter.get(
  '/:id',
  requirePermission('hooks:view'),
  param('id').isString().notEmpty(),
  (req: AuthenticatedRequest, res: Response) => {
    logApiRequest(req, { operation: 'get_hook', status: 'not_implemented' });
    res.status(501).json(NOT_IMPLEMENTED);
  }
);

// POST /api/v1/hooks - Create a new hook
hooksRouter.post(
  '/',
  requirePermission('hooks:manage'),
  (req: AuthenticatedRequest, res: Response) => {
    logApiRequest(req, { operation: 'create_hook', status: 'not_implemented' });
    res.status(501).json(NOT_IMPLEMENTED);
  }
);

// PUT /api/v1/hooks/:id - Update a hook
hooksRouter.put(
  '/:id',
  requirePermission('hooks:manage'),
  param('id').isString().notEmpty(),
  (req: AuthenticatedRequest, res: Response) => {
    logApiRequest(req, { operation: 'update_hook', status: 'not_implemented' });
    res.status(501).json(NOT_IMPLEMENTED);
  }
);

// DELETE /api/v1/hooks/:id - Delete a hook
hooksRouter.delete(
  '/:id',
  requirePermission('hooks:manage'),
  param('id').isString().notEmpty(),
  (req: AuthenticatedRequest, res: Response) => {
    logApiRequest(req, { operation: 'delete_hook', status: 'not_implemented' });
    res.status(501).json(NOT_IMPLEMENTED);
  }
);
