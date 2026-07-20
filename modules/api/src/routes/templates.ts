/**
 * Templates API Routes
 *
 * REST API endpoints for template management
 */

import { Router, Response } from 'express';
import { HttpError } from '../utils/http-error.js';
import { body, param, query, validationResult } from 'express-validator';
import {
  TemplateService,
  type TemplateId,
  type CreateTemplateRequest,
  type UpdateTemplateRequest,
} from '@civicpress/core';
import { AuthenticatedRequest, requirePermission } from '../middleware/auth.js';
import {
  sendSuccess,
  handleApiError,
  logApiRequest,
  handleValidationError,
} from '../utils/api-logger.js';

/**
 * One TemplateService per CivicPress instance, reused across requests.
 *
 * A plain module-level singleton would be wrong: TemplateService is built from
 * the CivicPress instance's `dataDir` + `cacheManager`, and a single process can
 * host more than one instance (the API test harness builds one per test
 * context). Keying on the CivicPress object itself keeps them separate, and a
 * WeakMap means a discarded instance takes its TemplateService with it.
 *
 * Correction to the backlog framing of this item: the "a new fs watcher per
 * HTTP request, never disposed" leak it describes does NOT occur on this path.
 * `civicPress.getCacheManager()` always resolves the shared manager (it is a
 * container singleton registered in `civic-core-services.ts`, which also
 * registers the `templates` / `templateLists` caches), and
 * `TemplateCacheAdapter` only constructs its OWN FileWatcherCache in the
 * `else` branch taken when NO cacheManager is supplied. With one supplied it
 * borrows the manager's already-watching caches, so no watcher was ever created
 * per request. What per-request construction really cost is a fresh
 * TemplateEngine + TemplateValidator on every call plus a `setKeyMapper()`
 * write into the SHARED cache object from inside a request handler on every
 * call; reusing one instance removes both.
 *
 * Disposal therefore needs no new shutdown hook: the file watchers belong to
 * the cacheManager, and `CivicPress.shutdown()` already shuts that down.
 */
const templateServicesByInstance = new WeakMap<object, TemplateService>();

export function createTemplatesRouter() {
  const router = Router();

  /**
   * Get the TemplateService for this request's CivicPress instance,
   * constructing it once and reusing it for every subsequent request.
   */
  function getTemplateService(req: AuthenticatedRequest): TemplateService {
    const civicPress = req.civicPress;
    if (!civicPress) {
      throw new Error('CivicPress not initialized');
    }

    const cached = templateServicesByInstance.get(civicPress);
    if (cached) {
      return cached;
    }

    const dataDir = civicPress.getDataDir();
    const service = new TemplateService({
      dataDir,
      enableCache: true,
      enableWatching: true,
      cacheManager: civicPress.getCacheManager(),
    });
    templateServicesByInstance.set(civicPress, service);
    return service;
  }

  /**
   * GET /api/v1/templates - List all templates
   */
  router.get(
    '/',
    [
      query('type').optional().isString().withMessage('Type must be a string'),
      query('search')
        .optional()
        .isString()
        .withMessage('Search must be a string'),
      query('include')
        .optional()
        .isArray()
        .withMessage('Include must be an array'),
      query('page')
        .optional()
        .isInt({ min: 1 })
        .withMessage('Page must be a positive integer'),
      query('limit')
        .optional()
        .isInt({ min: 1, max: 100 })
        .withMessage('Limit must be between 1 and 100'),
    ],
    requirePermission('templates:view'),
    async (req: AuthenticatedRequest, res: Response) => {
      logApiRequest(req, { operation: 'list_templates' });

      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return handleValidationError(
            'list_templates',
            errors.array(),
            req,
            res
          );
        }

        const templateService = getTemplateService(req);
        const { type, search, include, page, limit } = req.query;

        const filters = {
          type: type as string | undefined,
          search: search as string | undefined,
          include: include as
            | ('metadata' | 'validation' | 'variables')[]
            | undefined,
          page: page ? parseInt(page as string, 10) : undefined,
          limit: limit ? parseInt(limit as string, 10) : undefined,
        };

        const result = await templateService.listTemplates(filters);

        sendSuccess(result, req, res, { operation: 'list_templates' });
      } catch (error) {
        handleApiError(
          'list_templates',
          error,
          req,
          res,
          'Failed to list templates'
        );
      }
    }
  );

  /**
   * GET /api/v1/templates/:id - Get a specific template
   */
  router.get(
    '/:id',
    [
      param('id')
        .isString()
        .notEmpty()
        .withMessage('Template ID is required')
        .custom((value) => {
          // Validate ID format: type/name
          if (!value.includes('/')) {
            throw new Error(
              'Template ID must be in format {type}/{name} (e.g., bylaw/default)'
            );
          }
          return true;
        }),
    ],
    requirePermission('templates:view'),
    async (req: AuthenticatedRequest, res: Response) => {
      logApiRequest(req, { operation: 'get_template' });

      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return handleValidationError(
            'get_template',
            errors.array(),
            req,
            res
          );
        }

        const templateService = getTemplateService(req);
        const { id } = req.params;

        const template = await templateService.getTemplate(id as TemplateId);

        if (!template) {
          const error = new HttpError(404, `Template not found: ${id}`, 'TEMPLATE_NOT_FOUND', { details: { templateId: id } });
    return handleApiError('get_template', error, req, res);
        }

        sendSuccess({ template }, req, res, { operation: 'get_template' });
      } catch (error) {
        handleApiError(
          'get_template',
          error,
          req,
          res,
          'Failed to get template'
        );
      }
    }
  );

  /**
   * POST /api/v1/templates/:id/preview - Preview template with variables
   */
  router.post(
    '/:id/preview',
    [
      param('id').isString().notEmpty().withMessage('Template ID is required'),
      body('variables').isObject().withMessage('Variables must be an object'),
    ],
    requirePermission('templates:view'),
    async (req: AuthenticatedRequest, res: Response) => {
      logApiRequest(req, { operation: 'preview_template' });

      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return handleValidationError(
            'preview_template',
            errors.array(),
            req,
            res
          );
        }

        const templateService = getTemplateService(req);
        const { id } = req.params;
        const { variables } = req.body;

        const result = await templateService.previewTemplate(
          id as TemplateId,
          variables || {}
        );

        sendSuccess(result, req, res, { operation: 'preview_template' });
      } catch (error) {
        handleApiError(
          'preview_template',
          error,
          req,
          res,
          'Failed to preview template'
        );
      }
    }
  );

  /**
   * POST /api/v1/templates - Create a new template
   */
  router.post(
    '/',
    [
      body('type')
        .isString()
        .notEmpty()
        .withMessage('Type is required')
        .matches(/^[a-z0-9_-]+$/i)
        .withMessage(
          'Type must contain only alphanumeric characters, hyphens, and underscores'
        ),
      body('name')
        .isString()
        .notEmpty()
        .withMessage('Name is required')
        .matches(/^[a-z0-9_-]+$/i)
        .withMessage(
          'Name must contain only alphanumeric characters, hyphens, and underscores'
        ),
      body('content').isString().notEmpty().withMessage('Content is required'),
      body('description').optional().isString(),
      body('extends').optional().isString(),
      body('validation').optional().isObject(),
      body('sections').optional().isArray(),
    ],
    requirePermission('templates:manage'),
    async (req: AuthenticatedRequest, res: Response) => {
      logApiRequest(req, { operation: 'create_template' });

      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return handleValidationError(
            'create_template',
            errors.array(),
            req,
            res
          );
        }

        const templateService = getTemplateService(req);
        const requestData: CreateTemplateRequest = {
          type: req.body.type,
          name: req.body.name,
          content: req.body.content,
          description: req.body.description,
          extends: req.body.extends,
          validation: req.body.validation,
          sections: req.body.sections,
        };

        const template = await templateService.createTemplate(requestData);

        sendSuccess({ template }, req, res, {
          operation: 'create_template',
          statusCode: 201,
        });
      } catch (error) {
        // Handle specific error cases
        if (error instanceof Error) {
          if (error.message.includes('already exists')) {
            const apiError = new HttpError(409, error.message, 'TEMPLATE_EXISTS');
            return handleApiError('create_template', apiError, req, res);
          }
          if (error.message.includes('Invalid template ID')) {
            const apiError = new HttpError(400, error.message, 'TEMPLATE_INVALID');
            return handleApiError('create_template', apiError, req, res);
          }
        }

        handleApiError(
          'create_template',
          error,
          req,
          res,
          'Failed to create template'
        );
      }
    }
  );

  /**
   * PUT /api/v1/templates/:id - Update a template
   */
  router.put(
    '/:id',
    [
      param('id').isString().notEmpty().withMessage('Template ID is required'),
      body('description').optional().isString(),
      body('extends').optional().isString(),
      body('content').optional().isString(),
      body('validation').optional().isObject(),
      body('sections').optional().isArray(),
    ],
    requirePermission('templates:manage'),
    async (req: AuthenticatedRequest, res: Response) => {
      logApiRequest(req, { operation: 'update_template' });

      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return handleValidationError(
            'update_template',
            errors.array(),
            req,
            res
          );
        }

        const templateService = getTemplateService(req);
        const { id } = req.params;
        const requestData: UpdateTemplateRequest = {
          description: req.body.description,
          extends: req.body.extends,
          content: req.body.content,
          validation: req.body.validation,
          sections: req.body.sections,
        };

        // Check if at least one field is provided
        if (Object.keys(requestData).length === 0) {
          const error = new HttpError(400, 
            'At least one field must be provided for update'
          , 'VALIDATION_FAILED');
          return handleApiError('update_template', error, req, res);
        }

        const template = await templateService.updateTemplate(
          id as TemplateId,
          requestData
        );

        sendSuccess({ template }, req, res, { operation: 'update_template' });
      } catch (error) {
        // Handle specific error cases
        if (error instanceof Error) {
          if (error.message.includes('not found')) {
            const apiError = new HttpError(404, error.message, 'TEMPLATE_NOT_FOUND');
            return handleApiError('update_template', apiError, req, res);
          }
          if (error.message.includes('system template')) {
            const apiError = new HttpError(403, error.message, 'TEMPLATE_READ_ONLY');
            return handleApiError('update_template', apiError, req, res);
          }
        }

        handleApiError(
          'update_template',
          error,
          req,
          res,
          'Failed to update template'
        );
      }
    }
  );

  /**
   * DELETE /api/v1/templates/:id - Delete a template
   */
  router.delete(
    '/:id',
    [param('id').isString().notEmpty().withMessage('Template ID is required')],
    requirePermission('templates:manage'),
    async (req: AuthenticatedRequest, res: Response) => {
      logApiRequest(req, { operation: 'delete_template' });

      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return handleValidationError(
            'delete_template',
            errors.array(),
            req,
            res
          );
        }

        const templateService = getTemplateService(req);
        const { id } = req.params;

        await templateService.deleteTemplate(id as TemplateId);

        sendSuccess(
          { message: `Template ${id} deleted successfully` },
          req,
          res,
          { operation: 'delete_template' }
        );
      } catch (error) {
        // Handle specific error cases
        if (error instanceof Error) {
          if (error.message.includes('not found')) {
            const apiError = new HttpError(404, error.message, 'TEMPLATE_NOT_FOUND');
            return handleApiError('delete_template', apiError, req, res);
          }
        }

        handleApiError(
          'delete_template',
          error,
          req,
          res,
          'Failed to delete template'
        );
      }
    }
  );

  /**
   * POST /api/v1/templates/:id/validate - Validate a template
   */
  router.post(
    '/:id/validate',
    [param('id').isString().notEmpty().withMessage('Template ID is required')],
    requirePermission('templates:view'),
    async (req: AuthenticatedRequest, res: Response) => {
      logApiRequest(req, { operation: 'validate_template' });

      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return handleValidationError(
            'validate_template',
            errors.array(),
            req,
            res
          );
        }

        const templateService = getTemplateService(req);
        const { id } = req.params;

        const result = await templateService.validateTemplate(id as TemplateId);

        sendSuccess(result, req, res, { operation: 'validate_template' });
      } catch (error) {
        // Handle specific error cases
        if (error instanceof Error) {
          if (error.message.includes('not found')) {
            const apiError = new HttpError(404, error.message, 'TEMPLATE_NOT_FOUND');
            return handleApiError('validate_template', apiError, req, res);
          }
        }

        handleApiError(
          'validate_template',
          error,
          req,
          res,
          'Failed to validate template'
        );
      }
    }
  );

  return router;
}

// Export default router for backward compatibility
export const templatesRouter = createTemplatesRouter();
