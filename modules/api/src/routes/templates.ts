import { Router, Response } from 'express';
import { param } from 'express-validator';
import { AuthenticatedRequest, requirePermission } from '../middleware/auth.js';
import { sendSuccess, logApiRequest } from '../utils/api-logger.js';

export const templatesRouter = Router();

// GET /api/v1/templates - List all templates
templatesRouter.get(
  '/',
  requirePermission('templates:view'),
  (req: AuthenticatedRequest, res: Response) => {
    logApiRequest(req, { operation: 'list_templates' });

    sendSuccess(
      {
        templates: [],
        total: 0,
      },
      req,
      res,
      { operation: 'list_templates' }
    );
  }
);

// GET /api/v1/templates/:id - Get a specific template
templatesRouter.get(
  '/:id',
  requirePermission('templates:view'),
  param('id').isString().notEmpty(),
  (req: AuthenticatedRequest, res: Response) => {
    logApiRequest(req, { operation: 'get_template' });

    const { id } = req.params;
    sendSuccess(
      {
        id,
        name: 'Sample Template',
        content: 'Template content here',
      },
      req,
      res,
      { operation: 'get_template' }
    );
  }
);

// POST /api/v1/templates - Create a new template
templatesRouter.post(
  '/',
  requirePermission('templates:manage'),
  (req: AuthenticatedRequest, res: Response) => {
    logApiRequest(req, { operation: 'create_template' });

    sendSuccess(
      {
        message: 'Template created successfully',
      },
      req,
      res,
      {
        operation: 'create_template',
        statusCode: 201,
      }
    );
  }
);

// PUT /api/v1/templates/:id - Update a template
templatesRouter.put(
  '/:id',
  requirePermission('templates:manage'),
  param('id').isString().notEmpty(),
  (req: AuthenticatedRequest, res: Response) => {
    logApiRequest(req, { operation: 'update_template' });

    const { id } = req.params;
    sendSuccess(
      {
        message: `Template ${id} updated successfully`,
      },
      req,
      res,
      { operation: 'update_template' }
    );
  }
);

// DELETE /api/v1/templates/:id - Delete a template
templatesRouter.delete(
  '/:id',
  requirePermission('templates:manage'),
  param('id').isString().notEmpty(),
  (req: AuthenticatedRequest, res: Response) => {
    logApiRequest(req, { operation: 'delete_template' });

    const { id } = req.params;
    sendSuccess(
      {
        message: `Template ${id} deleted successfully`,
      },
      req,
      res,
      { operation: 'delete_template' }
    );
  }
);
