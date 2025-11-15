/**
 * Geography API Routes
 *
 * REST API endpoints for geography data management system.
 * Provides CRUD operations for geography files with validation and file management.
 */

import { Router, Request, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { GeographyManager } from '@civicpress/core';
import { AuthenticatedRequest } from '../middleware/auth.js';

export function createGeographyRouter(geographyManager: GeographyManager) {
  const router = Router();

  // Helper function to handle API responses
  const handleSuccess = (operation: string, data: any, res: Response) => {
    res.json({
      success: true,
      data,
      message: `${operation} completed successfully`,
    });
  };

  const handleError = (
    operation: string,
    error: any,
    res: Response,
    statusCode: number = 500
  ) => {
    console.error(`Geography API ${operation} error:`, error);
    res.status(statusCode).json({
      success: false,
      error: error.message || 'An error occurred',
      message: `${operation} failed`,
    });
  };

  const handleValidationError = (
    operation: string,
    errors: any[],
    res: Response
  ) => {
    res.status(400).json({
      success: false,
      error: 'Validation failed',
      message: `${operation} validation failed`,
      details: errors,
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
          category as any,
          type as any,
          parseInt(page as string),
          parseInt(limit as string)
        );

        handleSuccess('list_geography', result, res);
      } catch (error) {
        handleError('list_geography', error, res);
      }
    }
  );

  // POST /api/v1/geography - Create geography file
  router.post(
    '/',
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
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return handleValidationError('create_geography', errors.array(), res);
      }

      try {
        const { name, type, category, description, content, srid, metadata } =
          req.body;

        console.log('API: Creating geography file:', { name, type, category });

        const geographyFile = await geographyManager.createGeographyFile(
          {
            name,
            type,
            category,
            description,
            content,
            srid,
            metadata,
          },
          req.user
        );

        console.log('API: Geography file created:', geographyFile.id);

        handleSuccess('create_geography', geographyFile, res);
      } catch (error) {
        handleError('create_geography', error, res);
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
            new Error('Geography file not found'),
            res,
            404
          );
        }

        handleSuccess('get_geography', geographyFile, res);
      } catch (error) {
        handleError('get_geography', error, res);
      }
    }
  );

  // PUT /api/v1/geography/:id - Update geography file
  router.put(
    '/:id',
    param('id').isString().notEmpty().withMessage('Invalid geography ID'),
    body('name').optional().isString().notEmpty(),
    body('category')
      .optional()
      .isIn(['zone', 'boundary', 'district', 'facility', 'route']),
    body('description').optional().isString().notEmpty(),
    body('content').optional().isString().notEmpty(),
    body('metadata').optional().isObject(),
    async (req: AuthenticatedRequest, res: Response) => {
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
          },
          req.user
        );

        handleSuccess('update_geography', geographyFile, res);
      } catch (error) {
        handleError('update_geography', error, res);
      }
    }
  );

  // DELETE /api/v1/geography/:id - Delete geography file
  router.delete(
    '/:id',
    param('id').isString().notEmpty().withMessage('Invalid geography ID'),
    async (req: AuthenticatedRequest, res: Response) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return handleValidationError('delete_geography', errors.array(), res);
      }

      try {
        const { id } = req.params;
        await geographyManager.deleteGeographyFile(id, req.user);

        handleSuccess('delete_geography', { id }, res);
      } catch (error) {
        handleError('delete_geography', error, res);
      }
    }
  );

  // GET /api/v1/geography/:id/linked-records - Get records linked to this geography file
  router.get(
    '/:id/linked-records',
    param('id').isString().notEmpty().withMessage('Invalid geography ID'),
    async (req: AuthenticatedRequest, res: Response) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return handleValidationError('get_linked_records', errors.array(), res);
      }

      try {
        const { id } = req.params;

        // Get CivicPress instance from request (injected by middleware)
        const civicPress = (req as any).civicPress;
        if (!civicPress) {
          throw new Error('CivicPress instance not available');
        }

        // Import and create RecordsService using the existing CivicPress instance
        const { RecordsService } = await import(
          '../services/records-service.js'
        );
        const recordsService = new RecordsService(civicPress);

        // Get all records and filter those that link to this geography file
        const allRecords = await recordsService.listRecords({ limit: 1000 });
        const linkedRecords = allRecords.records.filter((record: any) =>
          record.linkedGeographyFiles?.some((link: any) => link.id === id)
        );

        handleSuccess('get_linked_records', linkedRecords, res);
      } catch (error) {
        handleError('get_linked_records', error, res);
      }
    }
  );

  // POST /api/v1/geography/validate - Validate geography content
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
        handleError('validate_geography', error, res);
      }
    }
  );

  return router;
}
