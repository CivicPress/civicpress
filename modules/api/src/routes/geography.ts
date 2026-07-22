/**
 * Geography API Routes
 *
 * REST API endpoints for geography data management system.
 * Provides CRUD operations for geography files with validation and file management.
 */

import { Router, Request, Response } from 'express';
import { HttpError } from '../utils/http-error.js';
import { body, param, query, validationResult } from 'express-validator';
import {
  GeographyManager,
  listGeographyPresets,
  getGeographyPreset,
  applyGeographyPreset,
} from '@civicpress/core';
import type { GeographyCategory, GeographyFileType } from '@civicpress/core';
import { AuthenticatedRequest, requirePermission } from '../middleware/auth.js';
import { handleApiError, logApiSuccess } from '../utils/api-logger.js';
import type { RecordsService } from '../services/records-service.js';

// (FA-API-014's `LINKED_RECORDS_SCAN_CAP` is gone: it bounded the in-JS scan of
// the record corpus that `/linked-records` used to perform. The endpoint now
// filters SQL-side and only ever materializes one page, so there is no scan
// left to bound — the `limit` validator (max 100) is the memory bound.)

export function createGeographyRouter(
  geographyManager: GeographyManager,
  recordsService: RecordsService
) {
  const router = Router();

  // Helper function to handle API responses
  const handleSuccess = (
    operation: string,
    data: unknown,
    res: Response,
    statusCode: number = 200
  ) => {
    res.status(statusCode).json({
      success: true,
      data,
      message: `${operation} completed successfully`,
    });
  };

  /**
   * `statusCode` is only ever passed for a DELIBERATE client-facing failure —
   * every call site that supplies one pairs it with an author-written message
   * (`new Error('Preset not found')`, 404). Those keep their message.
   *
   * Everything else is an arbitrary error caught by a route's catch block, and
   * it must NOT be relabelled as an author-written HttpError. Doing so used to
   * route it down `createErrorResponse`'s HttpError branch, which returns
   * `error.message` verbatim because an HttpError message is assumed to have
   * been chosen by a developer — so all 11 geography endpoints answered a 500
   * with the raw text of whatever threw: filesystem paths, YAML parse detail.
   * The redaction that the Tier-B sweep added for `config.ts` /
   * `notifications.ts` lives one branch further down and was never reached
   * from here. Hand the original error over untouched and let it apply.
   */
  const handleError = (
    operation: string,
    error: unknown,
    req: Request,
    res: Response,
    statusCode?: number
  ) => {
    if (statusCode !== undefined && statusCode < 500) {
      const message = error instanceof Error ? error.message : String(error);
      const errorObj = new HttpError(statusCode, message, undefined, {
        cause: error,
      });
      handleApiError(operation, errorObj, req, res, `${operation} failed`);
      return;
    }
    handleApiError(operation, error, req, res, `${operation} failed`);
  };

  const handleValidationError = (
    operation: string,
    errors: unknown[],
    res: Response
  ) => {
    // Canonical envelope — matches the shared handleValidationError. Was the
    // outlier `{ error: 'Validation failed', message, details }` (error as a
    // STRING); now `error` is the standard object with a code.
    void operation;
    res.status(400).json({
      success: false,
      error: {
        message: 'Invalid request data',
        code: 'VALIDATION_ERROR',
        details: errors,
      },
    });
  };

  // GET /api/v1/geography - List geography files
  router.get(
    '/',
    query('category')
      .optional()
      .isIn(['zone', 'boundary', 'district', 'facility', 'route']),
    query('type').optional().isIn(['geojson', 'kml', 'gpx', 'shapefile']),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    async (req: Request, res: Response) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return handleValidationError('list_geography', errors.array(), res);
      }

      try {
        const { category, type, page = 1, limit = 10 } = req.query;

        const result = await geographyManager.listGeographyFiles(
          category as GeographyCategory | undefined,
          type as GeographyFileType | undefined,
          parseInt(page as string),
          parseInt(limit as string)
        );

        handleSuccess('list_geography', result, res);
      } catch (error) {
        handleError('list_geography', error, req, res);
      }
    }
  );

  // POST /api/v1/geography - Create geography file
  // FA-API-003: geography (municipal boundaries/zones) is reference data —
  // every write route requires `geography:manage`, not mere authentication.
  router.post(
    '/',
    requirePermission('geography:manage'),
    body('name').isString().notEmpty().withMessage('Name is required'),
    body('type')
      .isIn(['geojson', 'kml', 'gpx', 'shapefile'])
      .withMessage('Invalid type'),
    body('category')
      .isIn(['zone', 'boundary', 'district', 'facility', 'route'])
      .withMessage('Invalid category'),
    body('description')
      .isString()
      .notEmpty()
      .withMessage('Description is required'),
    body('content').isString().notEmpty().withMessage('Content is required'),
    body('srid').optional().isInt({ min: 1 }),
    body('metadata').optional().isObject(),
    async (req: AuthenticatedRequest, res: Response) => {
      // Check authentication
      if (!req.user) {
        return handleError(
          'create_geography',
          new Error('Authentication required'),
          req,
          res,
          401
        );
      }

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return handleValidationError('create_geography', errors.array(), res);
      }

      try {
        const { name, type, category, description, content, srid, metadata } =
          req.body;

        const geographyFile = await geographyManager.createGeographyFile(
          {
            name,
            type,
            category,
            description,
            content,
            srid,
            metadata,
            color_mapping: req.body.color_mapping,
            icon_mapping: req.body.icon_mapping,
          },
          req.user
        );

        logApiSuccess('create_geography', req, {
          geographyFileId: geographyFile.id,
        });

        handleSuccess('create_geography', geographyFile, res, 201);
      } catch (error) {
        handleError('create_geography', error, req, res);
      }
    }
  );

  // POST /api/v1/geography/validate - Validate geography content
  // Must be before /:id route to avoid matching "validate" as an ID
  router.post(
    '/validate',
    body('content').isString().notEmpty().withMessage('Content is required'),
    body('type')
      .isIn(['geojson', 'kml', 'gpx', 'shapefile'])
      .withMessage('Invalid type'),
    async (req: Request, res: Response) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return handleValidationError('validate_geography', errors.array(), res);
      }

      try {
        const { content, type } = req.body;
        const validation = await geographyManager.validateGeographyContent(
          content,
          type
        );

        handleSuccess('validate_geography', validation, res);
      } catch (error) {
        handleError('validate_geography', error, req, res);
      }
    }
  );

  // GET /api/v1/geography/presets - List all available presets
  // Must be before /:id route to avoid matching "presets" as an ID
  router.get('/presets', async (req: Request, res: Response) => {
    try {
      const presets = listGeographyPresets();
      handleSuccess('list_presets', presets, res);
    } catch (error) {
      handleError('list_presets', error, req, res);
    }
  });

  // GET /api/v1/geography/presets/:key - Get a specific preset
  router.get(
    '/presets/:key',
    param('key').isString().notEmpty().withMessage('Invalid preset key'),
    async (req: Request, res: Response) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return handleValidationError('get_preset', errors.array(), res);
      }

      try {
        const { key } = req.params;
        const preset = getGeographyPreset(key);

        if (!preset) {
          return handleError(
            'get_preset',
            new Error('Preset not found'),
            req,
            res,
            404
          );
        }

        // getGeographyPreset returns the preset body without its key; echo the
        // requested key so callers can round-trip it (list → get parity).
        return handleSuccess('get_preset', { key, ...preset }, res);
      } catch (error) {
        return handleError('get_preset', error, req, res);
      }
    }
  );

  // POST /api/v1/geography/presets/:key/apply - Apply a preset
  router.post(
    '/presets/:key/apply',
    param('key').isString().notEmpty().withMessage('Invalid preset key'),
    // Explicit null means "no existing mapping" — treat it as absent, not as a
    // type error (nullable), so callers can pass null to start from scratch.
    body('existing_color_mapping').optional({ nullable: true }).isObject(),
    body('existing_icon_mapping').optional({ nullable: true }).isObject(),
    async (req: Request, res: Response) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return handleValidationError('apply_preset', errors.array(), res);
      }

      try {
        const { key } = req.params;
        const { existing_color_mapping, existing_icon_mapping } = req.body;

        const result = applyGeographyPreset(
          key,
          existing_color_mapping,
          existing_icon_mapping
        );

        handleSuccess('apply_preset', result, res);
      } catch (error) {
        handleError('apply_preset', error, req, res);
      }
    }
  );

  // GET /api/v1/geography/:id - Get geography file
  router.get(
    '/:id',
    param('id').isString().notEmpty().withMessage('Invalid geography ID'),
    async (req: Request, res: Response) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return handleValidationError('get_geography', errors.array(), res);
      }

      try {
        const { id } = req.params;

        const geographyFile = await geographyManager.getGeographyFile(id);

        if (!geographyFile) {
          return handleError(
            'get_geography',
            new Error(`Geography file not found: ${id}`),
            req,
            res,
            404
          );
        }

        handleSuccess('get_geography', geographyFile, res);
      } catch (error) {
        handleError('get_geography', error, req, res);
      }
    }
  );

  // GET /api/v1/geography/:id/raw - Get raw GeoJSON/KML content (for external tools)
  router.get(
    '/:id/raw',
    param('id').isString().notEmpty().withMessage('Invalid geography ID'),
    async (req: Request, res: Response) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return handleValidationError('get_geography_raw', errors.array(), res);
      }

      try {
        const { id } = req.params;
        const rawContent = await geographyManager.getRawContent(id);

        if (!rawContent) {
          return handleError(
            'get_geography_raw',
            new Error('Geography file not found'),
            req,
            res,
            404
          );
        }

        // Determine content type based on file type
        const geographyFile = await geographyManager.getGeographyFile(id);
        const contentType =
          geographyFile?.type === 'kml' || geographyFile?.type === 'gpx'
            ? 'application/xml'
            : 'application/json';

        res.setHeader('Content-Type', contentType);
        res.send(rawContent);
      } catch (error) {
        handleError('get_geography_raw', error, req, res);
      }
    }
  );

  // PUT /api/v1/geography/:id - Update geography file
  router.put(
    '/:id',
    requirePermission('geography:manage'), // FA-API-003
    param('id').isString().notEmpty().withMessage('Invalid geography ID'),
    body('name').optional().isString().notEmpty(),
    body('category')
      .optional()
      .isIn(['zone', 'boundary', 'district', 'facility', 'route']),
    body('description').optional().isString().notEmpty(),
    body('content').optional().isString().notEmpty(),
    body('metadata').optional().isObject(),
    async (req: AuthenticatedRequest, res: Response) => {
      // Check authentication
      if (!req.user) {
        return handleError(
          'update_geography',
          new Error('Authentication required'),
          req,
          res,
          401
        );
      }

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return handleValidationError('update_geography', errors.array(), res);
      }

      try {
        const { id } = req.params;
        const { name, category, description, content, metadata } = req.body;

        const geographyFile = await geographyManager.updateGeographyFile(
          id,
          {
            name,
            category,
            description,
            content,
            metadata,
            color_mapping: req.body.color_mapping,
            icon_mapping: req.body.icon_mapping,
          },
          req.user
        );

        handleSuccess('update_geography', geographyFile, res);
      } catch (error) {
        handleError('update_geography', error, req, res);
      }
    }
  );

  // DELETE /api/v1/geography/:id - Delete geography file
  router.delete(
    '/:id',
    requirePermission('geography:manage'), // FA-API-003
    param('id').isString().notEmpty().withMessage('Invalid geography ID'),
    async (req: AuthenticatedRequest, res: Response) => {
      // Check authentication
      if (!req.user) {
        return handleError(
          'delete_geography',
          new Error('Authentication required'),
          req,
          res,
          401
        );
      }

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return handleValidationError('delete_geography', errors.array(), res);
      }

      try {
        const { id } = req.params;
        await geographyManager.deleteGeographyFile(id, req.user);

        handleSuccess('delete_geography', { id }, res);
      } catch (error: unknown) {
        // Check if it's a GeographyNotFoundError
        const errorCode =
          error instanceof Error
            ? (error as Error & { code?: string }).code
            : undefined;
        const errorName = error instanceof Error ? error.name : undefined;
        if (
          errorCode === 'NOT_FOUND' ||
          errorName === 'GeographyNotFoundError'
        ) {
          return handleError('delete_geography', error, req, res, 404);
        }
        handleError('delete_geography', error, req, res);
      }
    }
  );

  // GET /api/v1/geography/:id/linked-records - Get records linked to this geography file
  router.get(
    '/:id/linked-records',
    param('id').isString().notEmpty().withMessage('Invalid geography ID'),
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    async (req: AuthenticatedRequest, res: Response) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return handleValidationError('get_linked_records', errors.array(), res);
      }

      try {
        const { id } = req.params;
        const page = (req.query.page as unknown as number) || 1;
        const limit = (req.query.limit as unknown as number) || 50;

        // Filter, count and page in ONE query, SQL-side.
        //
        // History of this endpoint: it originally scanned only the first 1000
        // records, so links on any record past the cap were silently dropped
        // and `total` was computed from that truncated subset. Tier-C fixed the
        // correctness by scanning the WHOLE corpus in bounded 1000-row batches
        // and matching `linkedGeographyFiles` in JS — right answers, but every
        // request hydrated every published record into an ApiRecord just to
        // throw nearly all of them away, then sliced the page out in JS.
        //
        // `linkedGeographyId` pushes the match down to a `json_each` EXISTS
        // predicate on `records.linked_geography_files`, so the database does
        // the filtering, returns the exact COUNT, and applies LIMIT/OFFSET.
        // Only the requested page is ever materialized, and `total` /
        // `totalPages` come from that same filtered COUNT — so the numbers mean
        // exactly what they meant after the Tier-C fix.
        const result = await recordsService.listRecords({
          page,
          limit,
          linkedGeographyId: id,
        });

        handleSuccess(
          'get_linked_records',
          {
            records: result.records,
            pagination: {
              page,
              limit,
              total: result.totalCount,
              totalPages: Math.ceil(result.totalCount / limit),
            },
          },
          res
        );
      } catch (error) {
        handleError('get_linked_records', error, req, res);
      }
    }
  );

  return router;
}
