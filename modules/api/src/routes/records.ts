import { Router, Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import {
  AuthenticatedRequest,
  requireRecordPermission,
} from '../middleware/auth';
import { RecordsService } from '../services/records-service';
import { Logger } from '@civicpress/core';
import {
  sendSuccess,
  handleApiError,
  logApiRequest,
} from '../utils/api-logger';

const logger = new Logger();

// Custom validation error handler for records API
function handleRecordsValidationError(
  operation: string,
  errors: any[],
  req: any,
  res: any
): void {
  logger.warn(`${operation} validation failed`, {
    operation,
    validationErrors: errors,
    requestId: (req as any).requestId,
    userId: (req as any).user?.id,
    userRole: (req as any).user?.role,
  });

  res.status(400).json({
    success: false,
    error: {
      message: 'Invalid record data',
      details: errors,
    },
  });
}

export function createPublicRecordsRouter(recordsService: RecordsService) {
  const router = Router();

  // GET /public/records - List all records (public access, no auth required)
  router.get('/', async (req: any, res: Response) => {
    logApiRequest(req, { operation: 'list_records_public' });

    try {
      const { type, status, limit, offset } = req.query;

      logger.info('Listing records (public)', {
        type,
        status,
        limit,
        offset,
        requestId: (req as any).requestId,
      });

      const result = await recordsService.listRecords({
        type: type as string,
        status: status as string,
        limit: limit ? parseInt(limit as string) : undefined,
        offset: offset ? parseInt(offset as string) : undefined,
      });

      logger.info('Records listed successfully (public)', {
        totalRecords: result.records?.length || 0,
        requestId: (req as any).requestId,
      });

      sendSuccess(result, req, res, { operation: 'list_records_public' });
    } catch (error) {
      handleApiError(
        'list_records_public',
        error,
        req,
        res,
        'Failed to list records'
      );
    }
  });

  // GET /public/records/:id - Get a specific record (public access)
  router.get(
    '/:id',
    param('id').isString().notEmpty(),
    async (req: any, res: Response) => {
      logApiRequest(req, { operation: 'get_record_public' });

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return handleRecordsValidationError(
          'get_record_public',
          errors.array(),
          req,
          res
        );
      }

      try {
        const { id } = req.params;

        const record = await recordsService.getRecord(id);

        if (!record) {
          const error = new Error('Record not found');
          (error as any).statusCode = 404;
          (error as any).code = 'RECORD_NOT_FOUND';
          throw error;
        }

        sendSuccess(record, req, res, { operation: 'get_record_public' });
      } catch (error) {
        handleApiError(
          'get_record_public',
          error,
          req,
          res,
          'Failed to retrieve record'
        );
      }
    }
  );

  return router;
}

export function createRecordsRouter(recordsService: RecordsService) {
  const router = Router();

  // GET /api/v1/records - List all records
  router.get(
    '/',
    requireRecordPermission('view'),
    async (req: AuthenticatedRequest, res: Response) => {
      logApiRequest(req, { operation: 'list_records' });

      try {
        const { type, status, limit, offset } = req.query;

        logger.info('Listing records', {
          type,
          status,
          limit,
          offset,
          requestId: (req as any).requestId,
          userId: (req as any).user?.id,
          userRole: (req as any).user?.role,
        });

        // Log the raw and decoded values
        logger.info('Filter values received:', {
          rawType: type,
          rawStatus: status,
          decodedType: type as string,
          decodedStatus: status as string,
          requestId: (req as any).requestId,
        });

        const result = await recordsService.listRecords({
          type: type as string,
          status: status as string,
          limit: limit ? parseInt(limit as string) : undefined,
          offset: offset ? parseInt(offset as string) : undefined,
        });

        logger.info('Records listed successfully', {
          totalRecords: result.records?.length || 0,
          requestId: (req as any).requestId,
          userId: (req as any).user?.id,
          userRole: (req as any).user?.role,
        });

        sendSuccess(result, req, res, { operation: 'list_records' });
      } catch (error) {
        handleApiError(
          'list_records',
          error,
          req,
          res,
          'Failed to list records'
        );
      }
    }
  );

  // GET /api/v1/records/:id - Get a specific record
  router.get(
    '/:id',
    requireRecordPermission('view'),
    param('id').isString().notEmpty(),
    async (req: AuthenticatedRequest, res: Response) => {
      logApiRequest(req, { operation: 'get_record' });

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return handleRecordsValidationError(
          'get_record',
          errors.array(),
          req,
          res
        );
      }

      try {
        const { id } = req.params;

        const record = await recordsService.getRecord(id);

        if (!record) {
          const error = new Error('Record not found');
          (error as any).statusCode = 404;
          (error as any).code = 'RECORD_NOT_FOUND';
          throw error;
        }

        sendSuccess(record, req, res, { operation: 'get_record' });
      } catch (error) {
        handleApiError(
          'get_record',
          error,
          req,
          res,
          'Failed to retrieve record'
        );
      }
    }
  );

  // POST /api/v1/records - Create a new record
  router.post(
    '/',
    requireRecordPermission('create'),
    body('title').isString().notEmpty(),
    body('type').isString().notEmpty(),
    body('content').optional().isString(),
    body('role').optional().isString(),
    body('metadata').optional().isObject(),
    async (req: AuthenticatedRequest, res: Response) => {
      logApiRequest(req, { operation: 'create_record' });

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return handleRecordsValidationError(
          'create_record',
          errors.array(),
          req,
          res
        );
      }

      try {
        const { title, type, content, role, metadata } = req.body;
        const userRole = req.user?.role || role || 'unknown';

        const record = await recordsService.createRecord(
          {
            title,
            type,
            content,
            metadata,
          },
          userRole
        );

        sendSuccess(record, req, res, {
          operation: 'create_record',
          statusCode: 201,
        });
      } catch (error) {
        handleApiError(
          'create_record',
          error,
          req,
          res,
          'Failed to create record'
        );
      }
    }
  );

  // PUT /api/v1/records/:id - Update a record
  router.put(
    '/:id',
    requireRecordPermission('edit'),
    param('id').isString().notEmpty(),
    body('title').optional().isString(),
    body('content').optional().isString(),
    body('status').optional().isString(),
    body('metadata').optional().isObject(),
    async (req: AuthenticatedRequest, res: Response) => {
      logApiRequest(req, { operation: 'update_record' });

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return handleRecordsValidationError(
          'update_record',
          errors.array(),
          req,
          res
        );
      }

      try {
        const { id } = req.params;
        const updates = req.body;
        const userRole = req.user?.role || 'unknown';

        const record = await recordsService.updateRecord(id, updates, userRole);

        if (!record) {
          const error = new Error('Record not found');
          (error as any).statusCode = 404;
          (error as any).code = 'RECORD_NOT_FOUND';
          throw error;
        }

        sendSuccess(record, req, res, { operation: 'update_record' });
      } catch (error) {
        handleApiError(
          'update_record',
          error,
          req,
          res,
          'Failed to update record'
        );
      }
    }
  );

  // DELETE /api/v1/records/:id - Archive a record
  router.delete(
    '/:id',
    requireRecordPermission('delete'),
    param('id').isString().notEmpty(),
    async (req: AuthenticatedRequest, res: Response) => {
      logApiRequest(req, { operation: 'delete_record' });

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return handleRecordsValidationError(
          'delete_record',
          errors.array(),
          req,
          res
        );
      }

      try {
        const { id } = req.params;
        const userRole = req.user?.role || 'unknown';

        // First check if record exists
        const existingRecord = await recordsService.getRecord(id);
        if (!existingRecord) {
          const error = new Error('Record not found');
          (error as any).statusCode = 404;
          (error as any).code = 'RECORD_NOT_FOUND';
          throw error;
        }

        const result = await recordsService.deleteRecord(id, userRole);

        if (result) {
          sendSuccess(
            {
              message: `Record ${id} archived successfully`,
              archivedAt: new Date().toISOString(),
              archiveLocation: `archive/${existingRecord.type}/${id}.md`,
              note: 'Record has been moved to archive and is no longer active',
            },
            req,
            res,
            { operation: 'delete_record' }
          );
        } else {
          const error = new Error('Failed to delete record');
          (error as any).statusCode = 500;
          (error as any).code = 'DELETE_FAILED';
          (error as any).details = 'Archive operation failed';
          throw error;
        }
      } catch (error) {
        handleApiError(
          'delete_record',
          error,
          req,
          res,
          'Failed to delete record'
        );
      }
    }
  );

  return router;
}
