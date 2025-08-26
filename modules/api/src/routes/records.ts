import { Router, Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import {
  AuthenticatedRequest,
  requireRecordPermission,
  authMiddleware,
} from '../middleware/auth';
import { RecordsService } from '../services/records-service';
import { Logger } from '@civicpress/core';
import { AuditLogger } from '@civicpress/core';
import {
  sendSuccess,
  handleApiError,
  logApiRequest,
} from '../utils/api-logger';

const logger = new Logger();
const audit = new AuditLogger();

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

export function createRecordsRouter(recordsService: RecordsService) {
  const router = Router();

  // GET /api/records - List records (handles both public and authenticated access)
  router.get('/', async (req: any, res: Response) => {
    const isAuthenticated = (req as any).user !== undefined;
    const operation = isAuthenticated
      ? 'list_records_authenticated'
      : 'list_records_public';

    logApiRequest(req, { operation });

    try {
      const { type, status, limit, cursor } = req.query;

      logger.info(
        `Listing records (${isAuthenticated ? 'authenticated' : 'public'})`,
        {
          type,
          status,
          limit,
          cursor: cursor ? '***' : undefined, // Don't log the actual cursor
          requestId: (req as any).requestId,
          userId: (req as any).user?.id,
          userRole: (req as any).user?.role,
          isAuthenticated,
        }
      );

      const result = await recordsService.listRecords({
        type: type as string,
        status: status as string,
        limit: limit ? parseInt(limit as string) : 20,
        cursor: cursor as string,
      });

      logger.info(
        `Records listed successfully (${isAuthenticated ? 'authenticated' : 'public'})`,
        {
          totalRecords: result.records?.length || 0,
          hasMore: result.hasMore,
          requestId: (req as any).requestId,
          userId: (req as any).user?.id,
          userRole: (req as any).user?.role,
          isAuthenticated,
        }
      );

      sendSuccess(result, req, res, { operation });
    } catch (error) {
      handleApiError(operation, error, req, res, 'Failed to list records');
    }
  });

  // GET /api/records/:id - Get a specific record (handles both public and authenticated access)
  router.get(
    '/:id',
    param('id').isString().notEmpty(),
    async (req: any, res: Response) => {
      const isAuthenticated = (req as any).user !== undefined;
      const operation = isAuthenticated
        ? 'get_record_authenticated'
        : 'get_record_public';

      logApiRequest(req, { operation });

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

        logger.info(
          `Getting record ${id} (${isAuthenticated ? 'authenticated' : 'public'})`,
          {
            recordId: id,
            requestId: (req as any).requestId,
            userId: (req as any).user?.id,
            userRole: (req as any).user?.role,
            isAuthenticated,
          }
        );

        const record = await recordsService.getRecord(id);

        if (!record) {
          const error = new Error('Record not found');
          (error as any).statusCode = 404;
          (error as any).code = 'RECORD_NOT_FOUND';
          throw error;
        }

        logger.info(
          `Record ${id} retrieved successfully (${isAuthenticated ? 'authenticated' : 'public'})`,
          {
            recordId: id,
            recordType: record.type,
            recordStatus: record.status,
            requestId: (req as any).requestId,
            userId: (req as any).user?.id,
            userRole: (req as any).user?.role,
            isAuthenticated,
          }
        );

        sendSuccess(record, req, res, { operation });
      } catch (error) {
        handleApiError(operation, error, req, res, 'Failed to get record');
      }
    }
  );

  // GET /api/records/:id/raw - Get raw file content for a record (including frontmatter)
  router.get(
    '/:id/raw',
    param('id').isString().notEmpty(),
    async (req: any, res: Response) => {
      const isAuthenticated = (req as any).user !== undefined;
      const operation = isAuthenticated
        ? 'get_raw_record_authenticated'
        : 'get_raw_record_public';

      logApiRequest(req, { operation });

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return handleRecordsValidationError(
          'get_raw_record',
          errors.array(),
          req,
          res
        );
      }

      try {
        const { id } = req.params;

        logger.info(
          `Getting raw record ${id} (${isAuthenticated ? 'authenticated' : 'public'})`,
          {
            recordId: id,
            requestId: (req as any).requestId,
            userId: (req as any).user?.id,
            userRole: (req as any).user?.role,
            isAuthenticated,
          }
        );

        const record = await recordsService.getRawRecord(id);

        if (!record) {
          const error = new Error('Record not found');
          (error as any).statusCode = 404;
          (error as any).code = 'RECORD_NOT_FOUND';
          throw error;
        }

        logger.info(
          `Raw record ${id} retrieved successfully (${isAuthenticated ? 'authenticated' : 'public'})`,
          {
            recordId: id,
            recordType: record.type,
            recordStatus: record.status,
            requestId: (req as any).requestId,
            userId: (req as any).user?.id,
            userRole: (req as any).user?.role,
            isAuthenticated,
          }
        );

        sendSuccess(record, req, res, { operation });
      } catch (error) {
        handleApiError(operation, error, req, res, 'Failed to get raw record');
      }
    }
  );

  // GET /api/records/drafts - Get user's draft records (authenticated only)
  router.get(
    '/drafts',
    requireRecordPermission('view'),
    async (req: AuthenticatedRequest, res: Response) => {
      logApiRequest(req, { operation: 'list_drafts' });

      try {
        const { type, limit, offset } = req.query;

        logger.info('Listing user drafts', {
          type,
          limit,
          offset,
          requestId: (req as any).requestId,
          userId: req.user?.id,
          userRole: req.user?.role,
        });

        // For now, return all records with status 'draft'
        // In the future, this could be filtered by user ownership
        const result = await recordsService.listRecords({
          type: type as string,
          status: 'draft',
          limit: limit ? parseInt(limit as string) : undefined,
        });

        logger.info('User drafts listed successfully', {
          totalRecords: result.records?.length || 0,
          requestId: (req as any).requestId,
          userId: req.user?.id,
          userRole: req.user?.role,
        });

        sendSuccess(result, req, res, { operation: 'list_drafts' });
      } catch (error) {
        handleApiError('list_drafts', error, req, res, 'Failed to list drafts');
      }
    }
  );

  // POST /api/records - Create a new record (authenticated only)
  router.post(
    '/',
    authMiddleware(recordsService.getCivicPress()),
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
        const { title, type, content, metadata } = req.body;
        const user = req.user;

        if (!user) {
          const error = new Error('User authentication required');
          (error as any).statusCode = 401;
          throw error;
        }

        // Extract username correctly - handle case where user.username might be the full object
        let username = 'unknown';
        if (typeof user.username === 'string') {
          username = user.username;
        } else if (
          typeof user.username === 'object' &&
          user.username !== null
        ) {
          // If user.username is an object, try to extract the username from it
          const usernameObj = user.username as any;
          if (typeof usernameObj.username === 'string') {
            username = usernameObj.username;
          } else if (typeof usernameObj === 'object' && usernameObj !== null) {
            // Try to find any string property that might be the username
            for (const [key, value] of Object.entries(usernameObj)) {
              if (
                typeof value === 'string' &&
                (key === 'username' || key === 'name' || key === 'id')
              ) {
                username = value;
                break;
              }
            }
          }
        }

        // Ensure user object has correct structure
        const cleanUser = {
          id: user.id,
          username: username,
          role: user.role,
          email: user.email,
          name: user.name,
        };

        const record = await recordsService.createRecord(
          {
            title,
            type,
            content,
            metadata,
          },
          cleanUser
        );

        sendSuccess(record, req, res, {
          operation: 'create_record',
          statusCode: 201,
        });
        await audit.log({
          source: 'api',
          actor: {
            id: user.id,
            username: (user as any).username,
            role: user.role,
          },
          action: 'records:create',
          target: {
            type: 'record',
            id: (record as any)?.id,
            name: (record as any)?.title,
          },
          outcome: 'success',
        });
      } catch (error) {
        const user = (req as any).user || {};
        await audit.log({
          source: 'api',
          actor: { id: user.id, username: user.username, role: user.role },
          action: 'records:create',
          target: { type: 'record' },
          outcome: 'failure',
          message: String(error),
        });
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

  // PUT /api/records/:id - Update a record (authenticated only)
  router.put(
    '/:id',
    authMiddleware(recordsService.getCivicPress()),
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
        const user = req.user;

        if (!user) {
          const error = new Error('User authentication required');
          (error as any).statusCode = 401;
          throw error;
        }

        const record = await recordsService.updateRecord(id, updates, user);

        if (!record) {
          const error = new Error('Record not found');
          (error as any).statusCode = 404;
          (error as any).code = 'RECORD_NOT_FOUND';
          throw error;
        }

        sendSuccess(record, req, res, { operation: 'update_record' });
        await audit.log({
          source: 'api',
          actor: {
            id: user.id,
            username: (user as any).username,
            role: user.role,
          },
          action: 'records:update',
          target: { type: 'record', id: id },
          outcome: 'success',
        });
      } catch (error) {
        const user = (req as any).user || {};
        const id = (req as any).params?.id;
        await audit.log({
          source: 'api',
          actor: { id: user.id, username: user.username, role: user.role },
          action: 'records:update',
          target: { type: 'record', id },
          outcome: 'failure',
          message: String(error),
        });
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

  // DELETE /api/records/:id - Archive a record (authenticated only)
  router.delete(
    '/:id',
    authMiddleware(recordsService.getCivicPress()),
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
        const user = req.user;

        if (!user) {
          const error = new Error('User authentication required');
          (error as any).statusCode = 401;
          throw error;
        }

        // First check if record exists
        const existingRecord = await recordsService.getRecord(id);
        if (!existingRecord) {
          const error = new Error('Record not found');
          (error as any).statusCode = 404;
          (error as any).code = 'RECORD_NOT_FOUND';
          throw error;
        }

        const result = await recordsService.deleteRecord(id, user);

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
          await audit.log({
            source: 'api',
            actor: {
              id: user.id,
              username: (user as any).username,
              role: user.role,
            },
            action: 'records:delete',
            target: { type: 'record', id },
            outcome: 'success',
          });
        } else {
          const error = new Error('Failed to delete record');
          (error as any).statusCode = 500;
          (error as any).code = 'DELETE_FAILED';
          (error as any).details = 'Archive operation failed';
          throw error;
        }
      } catch (error) {
        const user = (req as any).user || {};
        const id = (req as any).params?.id;
        await audit.log({
          source: 'api',
          actor: { id: user.id, username: user.username, role: user.role },
          action: 'records:delete',
          target: { type: 'record', id },
          outcome: 'failure',
          message: String(error),
        });
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

  // POST /api/records/:id/status - Change record status with workflow validation
  router.post(
    '/:id/status',
    authMiddleware(recordsService.getCivicPress()),
    requireRecordPermission('edit'),
    param('id').isString().notEmpty(),
    body('status').isString().notEmpty(),
    body('comment').optional().isString(),
    async (req: AuthenticatedRequest, res: Response) => {
      logApiRequest(req, { operation: 'change_record_status' });

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return handleRecordsValidationError(
          'change_record_status',
          errors.array(),
          req,
          res
        );
      }

      try {
        const { id } = req.params;
        const { status, comment } = req.body;
        const user = req.user;

        if (!user) {
          const error = new Error('User authentication required');
          (error as any).statusCode = 401;
          throw error;
        }

        // First check if record exists
        const existingRecord = await recordsService.getRecord(id);
        if (!existingRecord) {
          const error = new Error('Record not found');
          (error as any).statusCode = 404;
          (error as any).code = 'RECORD_NOT_FOUND';
          throw error;
        }

        const result = await recordsService.changeRecordStatus(
          id,
          status,
          user,
          comment
        );

        if (result.success) {
          sendSuccess(
            {
              message: `Record status changed to ${status}`,
              record: result.record,
              previousStatus: existingRecord.status,
              newStatus: status,
              changedBy: user.username,
              changedAt: new Date().toISOString(),
              comment: comment || null,
            },
            req,
            res,
            { operation: 'change_record_status' }
          );
          await audit.log({
            source: 'api',
            actor: {
              id: user.id,
              username: (user as any).username,
              role: user.role,
            },
            action: 'records:status',
            target: { type: 'record', id },
            outcome: 'success',
            metadata: {
              previousStatus: existingRecord.status,
              newStatus: status,
            },
          });
        } else {
          const error = new Error(
            result.error || 'Failed to change record status'
          );
          (error as any).statusCode = 400;
          (error as any).code = 'STATUS_CHANGE_FAILED';
          (error as any).details = result.error;
          throw error;
        }
      } catch (error) {
        const user = (req as any).user || {};
        const id = (req as any).params?.id;
        await audit.log({
          source: 'api',
          actor: { id: user.id, username: user.username, role: user.role },
          action: 'records:status',
          target: { type: 'record', id },
          outcome: 'failure',
          message: String(error),
        });
        handleApiError(
          'change_record_status',
          error,
          req,
          res,
          'Failed to change record status'
        );
      }
    }
  );

  // GET /api/records/:id/transitions - List allowed transitions for current user
  router.get(
    '/:id/transitions',
    authMiddleware(recordsService.getCivicPress()),
    param('id').isString().notEmpty(),
    async (req: AuthenticatedRequest, res: Response) => {
      logApiRequest(req, { operation: 'list_allowed_transitions' });

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return handleRecordsValidationError(
          'list_allowed_transitions',
          errors.array(),
          req,
          res
        );
      }

      try {
        const { id } = req.params as any;
        const user = req.user as any;

        if (!user) {
          const error = new Error('User authentication required');
          (error as any).statusCode = 401;
          throw error;
        }

        const allowed = await recordsService.getAllowedTransitions(id, user);
        sendSuccess({ transitions: allowed }, req, res, {
          operation: 'list_allowed_transitions',
        });
      } catch (error) {
        handleApiError(
          'list_allowed_transitions',
          error,
          req,
          res,
          'Failed to list allowed transitions'
        );
      }
    }
  );

  return router;
}
