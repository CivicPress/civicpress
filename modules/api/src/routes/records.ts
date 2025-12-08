import { Router, Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import {
  AuthenticatedRequest,
  requireRecordPermission,
  authMiddleware,
  optionalAuth,
} from '../middleware/auth.js';
import { RecordsService } from '../services/records-service.js';
import { Logger } from '@civicpress/core';
import { AuditLogger } from '@civicpress/core';
import {
  sendSuccess,
  handleApiError,
  logApiRequest,
} from '../utils/api-logger.js';

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

  // GET /api/records/summary - Aggregate counts
  router.get('/summary', async (req: any, res: Response) => {
    const isAuthenticated = (req as any).user !== undefined;
    const operation = isAuthenticated
      ? 'records_summary_authenticated'
      : 'records_summary_public';

    logApiRequest(req, { operation });

    try {
      const { type, status } = req.query;

      logger.info(
        `Fetching record summary (${isAuthenticated ? 'authenticated' : 'public'})`,
        {
          type,
          status,
          requestId: (req as any).requestId,
          userId: (req as any).user?.id,
          userRole: (req as any).user?.role,
          isAuthenticated,
        }
      );

      const summary = await recordsService.getRecordSummary({
        type: type as string,
        status: status as string,
      });

      sendSuccess(summary, req, res, { operation });
    } catch (error) {
      handleApiError(
        operation,
        error,
        req,
        res,
        'Failed to get record summary'
      );
    }
  });

  // GET /api/records/drafts - Get user's draft records (authenticated only)
  // NOTE: This must come BEFORE /:id route to avoid matching "drafts" as an ID
  router.get(
    '/drafts',
    authMiddleware(recordsService.getCivicPress()),
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

        // List drafts from record_drafts table, optionally filtered by user
        const userId = req.user?.id?.toString() || req.user?.username;
        const result = await recordsService.listDrafts({
          type: type as string,
          created_by: userId, // Filter by current user
          limit: limit ? parseInt(limit as string) : undefined,
          offset: offset ? parseInt(offset as string) : undefined,
        });

        logger.info('User drafts listed successfully', {
          totalRecords: result.drafts?.length || 0,
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

  // GET /api/records/:id/frontmatter - Get frontmatter YAML for a record (handles both public and authenticated access)
  // NOTE: This must come BEFORE /:id route to avoid matching "frontmatter" as an ID
  router.get(
    '/:id/frontmatter',
    param('id').isString().notEmpty(),
    optionalAuth(recordsService.getCivicPress()),
    async (req: any, res: Response) => {
      const isAuthenticated = (req as any).user !== undefined;
      const operation = isAuthenticated
        ? 'get_frontmatter_authenticated'
        : 'get_frontmatter_public';

      logApiRequest(req, { operation });

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return handleRecordsValidationError(
          'get_frontmatter',
          errors.array(),
          req,
          res
        );
      }

      try {
        const { id } = req.params;

        logger.info(
          `Getting frontmatter YAML for record ${id} (${isAuthenticated ? 'authenticated' : 'public'})`,
          {
            recordId: id,
            requestId: (req as any).requestId,
            userId: (req as any).user?.id,
            userRole: (req as any).user?.role,
            isAuthenticated,
          }
        );

        const yaml = await recordsService.getFrontmatterYaml(
          id,
          (req as any).user
        );

        if (!yaml) {
          const error = new Error('Record not found');
          (error as any).statusCode = 404;
          (error as any).code = 'RECORD_NOT_FOUND';
          throw error;
        }

        logger.info(
          `Frontmatter YAML for record ${id} retrieved successfully (${isAuthenticated ? 'authenticated' : 'public'})`,
          {
            recordId: id,
            requestId: (req as any).requestId,
            userId: (req as any).user?.id,
            userRole: (req as any).user?.role,
            isAuthenticated,
          }
        );

        // Return as plain text YAML (not JSON)
        res.setHeader('Content-Type', 'text/yaml; charset=utf-8');
        res.status(200).send(yaml);
      } catch (error) {
        handleApiError(
          operation,
          error,
          req,
          res,
          'Failed to get frontmatter YAML'
        );
      }
    }
  );

  // GET /api/records/:id - Get a specific record (handles both public and authenticated access)
  // Uses optional auth middleware - if user is authenticated, they can see drafts
  router.get(
    '/:id',
    param('id').isString().notEmpty(),
    // Optional auth - attach user if token is present, but don't require it
    optionalAuth(recordsService.getCivicPress()),
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

        // Check drafts first (if user can edit), then published records
        const user = (req as any).user;
        const record = await recordsService.getDraftOrRecord(id, user || {});

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

  // POST /api/records - Create a new record (authenticated only)
  router.post(
    '/',
    authMiddleware(recordsService.getCivicPress()),
    requireRecordPermission('create'),
    body('title').isString().notEmpty(),
    body('type').isString().notEmpty(),
    body('content').optional().isString(),
    body('status').optional().isString(), // Legal status (stored in YAML + DB)
    body('workflowState').optional().isString(), // Internal editorial status (DB-only, never in YAML)
    body('role').optional().isString(),
    body('metadata').optional().isObject(),
    body('geography').optional().isObject(),
    body('attachedFiles').optional().isArray(),
    body('linkedRecords').optional().isArray(),
    body('linkedGeographyFiles').optional().isArray(),
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
        const {
          title,
          type,
          content,
          metadata,
          geography,
          attachedFiles,
          linkedRecords,
          linkedGeographyFiles,
          authors,
          source,
        } = req.body;
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

        // Create draft instead of published record (no file created until publish)
        const record = await recordsService.createDraft(
          {
            title,
            type,
            status: req.body.status || 'draft', // Legal status (stored in YAML + DB)
            workflowState: req.body.workflowState || 'draft', // Internal editorial status (DB-only, never in YAML)
            markdownBody: content, // Map 'content' to 'markdownBody' for drafts
            metadata,
            geography,
            attachedFiles,
            linkedRecords,
            linkedGeographyFiles,
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
  // TODO: Remove this endpoint once all work is complete. All updates should go through /:id/draft
  // and only be written to .md files on publish. This direct update endpoint writes to .md immediately.
  router.put(
    '/:id',
    authMiddleware(recordsService.getCivicPress()),
    requireRecordPermission('edit'),
    param('id').isString().notEmpty(),
    body('title').optional().isString(),
    body('content').optional().isString(),
    body('status').optional().isString(), // Legal status (stored in YAML + DB)
    body('workflowState').optional().isString(), // Internal editorial status (DB-only, never in YAML)
    body('metadata').optional().isObject(),
    body('geography').optional().isObject(),
    body('attachedFiles').optional().isArray(),
    body('linkedRecords').optional().isArray(),
    body('linkedGeographyFiles').optional().isArray(),
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

  // DELETE /api/v1/records/:id/draft - Delete draft (authenticated only)
  router.delete(
    '/:id/draft',
    authMiddleware(recordsService.getCivicPress()),
    requireRecordPermission('edit'),
    param('id').isString().notEmpty(),
    async (req: AuthenticatedRequest, res: Response) => {
      logApiRequest(req, { operation: 'delete_draft' });

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return handleRecordsValidationError(
          'delete_draft',
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

        // Check if draft exists and belongs to user
        const draft = await recordsService.getDraftOrRecord(id, user);
        if (!draft || !draft.isDraft) {
          const error = new Error('Draft not found');
          (error as any).statusCode = 404;
          (error as any).code = 'DRAFT_NOT_FOUND';
          throw error;
        }

        // Verify ownership (optional - can be removed if admins should delete any draft)
        if (
          draft.created_by !== user.id?.toString() &&
          draft.created_by !== user.username
        ) {
          const error = new Error(
            'Permission denied: You can only delete your own drafts'
          );
          (error as any).statusCode = 403;
          throw error;
        }

        // Delete draft
        await recordsService.deleteDraft(id);

        sendSuccess({ message: 'Draft deleted successfully', id }, req, res, {
          operation: 'delete_draft',
        });
        await audit.log({
          source: 'api',
          actor: {
            id: user.id,
            username: (user as any).username,
            role: user.role,
          },
          action: 'records:delete_draft',
          target: { type: 'draft', id },
          outcome: 'success',
        });
      } catch (error) {
        const user = (req as any).user || {};
        const id = (req as any).params?.id;
        await audit.log({
          source: 'api',
          actor: { id: user.id, username: user.username, role: user.role },
          action: 'records:delete_draft',
          target: { type: 'draft', id },
          outcome: 'failure',
          message: String(error),
        });
        handleApiError(
          'delete_draft',
          error,
          req,
          res,
          'Failed to delete draft'
        );
      }
    }
  );

  // PUT /api/v1/records/:id/draft - Save draft (authenticated only)
  router.put(
    '/:id/draft',
    authMiddleware(recordsService.getCivicPress()),
    requireRecordPermission('edit'),
    param('id').isString().notEmpty(),
    body('title').optional().isString(),
    body('markdownBody').optional().isString(),
    body('status').optional().isString(), // Legal status (stored in YAML + DB)
    body('workflowState').optional().isString(), // Internal editorial status (DB-only, never in YAML)
    body('metadata').optional().isObject(),
    body('geography').optional().isObject(),
    body('attachedFiles').optional().isArray(),
    body('linkedRecords').optional().isArray(),
    body('linkedGeographyFiles').optional().isArray(),
    async (req: AuthenticatedRequest, res: Response) => {
      logApiRequest(req, { operation: 'save_draft' });

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return handleRecordsValidationError(
          'save_draft',
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

        // Check if draft exists, update it; otherwise create it
        const existingDraft = await recordsService.getDraftOrRecord(id, user);
        let draft;

        if (existingDraft?.isDraft) {
          // Update existing draft
          draft = await recordsService.updateDraft(id, updates, user);
        } else {
          // Create new draft (if record exists, we'll create a draft from it)
          // For now, we'll require the full data for creation
          if (!updates.title || !updates.type) {
            const error = new Error(
              'Title and type are required for new drafts'
            );
            (error as any).statusCode = 400;
            throw error;
          }
          draft = await recordsService.createDraft(
            {
              title: updates.title,
              type: updates.type,
              status: updates.status,
              workflowState: updates.workflowState, // Internal editorial status (DB-only, never in YAML)
              markdownBody: updates.markdownBody,
              metadata: updates.metadata,
              geography: updates.geography,
              attachedFiles: updates.attachedFiles,
              linkedRecords: updates.linkedRecords,
              linkedGeographyFiles: updates.linkedGeographyFiles,
            },
            user,
            id // Use the ID from URL
          );
        }

        sendSuccess(draft, req, res, { operation: 'save_draft' });
        await audit.log({
          source: 'api',
          actor: {
            id: user.id,
            username: (user as any).username,
            role: user.role,
          },
          action: 'records:save_draft',
          target: { type: 'record', id },
          outcome: 'success',
        });
      } catch (error) {
        const user = (req as any).user || {};
        const id = (req as any).params?.id;
        await audit.log({
          source: 'api',
          actor: { id: user.id, username: user.username, role: user.role },
          action: 'records:save_draft',
          target: { type: 'record', id },
          outcome: 'failure',
          message: String(error),
        });
        handleApiError('save_draft', error, req, res, 'Failed to save draft');
      }
    }
  );

  // POST /api/v1/records/:id/publish - Publish draft (authenticated only)
  router.post(
    '/:id/publish',
    authMiddleware(recordsService.getCivicPress()),
    requireRecordPermission('edit'),
    param('id').isString().notEmpty(),
    body('status').optional().isString(),
    async (req: AuthenticatedRequest, res: Response) => {
      logApiRequest(req, { operation: 'publish_record' });

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return handleRecordsValidationError(
          'publish_record',
          errors.array(),
          req,
          res
        );
      }

      try {
        const { id } = req.params;
        const { status } = req.body;
        const user = req.user;

        if (!user) {
          const error = new Error('User authentication required');
          (error as any).statusCode = 401;
          throw error;
        }

        const record = await recordsService.publishDraft(id, user, status);

        sendSuccess(record, req, res, {
          operation: 'publish_record',
          statusCode: 201,
        });
        await audit.log({
          source: 'api',
          actor: {
            id: user.id,
            username: (user as any).username,
            role: user.role,
          },
          action: 'records:publish',
          target: { type: 'record', id },
          outcome: 'success',
        });
      } catch (error) {
        const user = (req as any).user || {};
        const id = (req as any).params?.id;
        await audit.log({
          source: 'api',
          actor: { id: user.id, username: user.username, role: user.role },
          action: 'records:publish',
          target: { type: 'record', id },
          outcome: 'failure',
          message: String(error),
        });
        handleApiError(
          'publish_record',
          error,
          req,
          res,
          'Failed to publish record'
        );
      }
    }
  );

  // POST /api/v1/records/:id/lock - Acquire lock (authenticated only)
  router.post(
    '/:id/lock',
    authMiddleware(recordsService.getCivicPress()),
    requireRecordPermission('edit'),
    param('id').isString().notEmpty(),
    async (req: AuthenticatedRequest, res: Response) => {
      logApiRequest(req, { operation: 'acquire_lock' });

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return handleRecordsValidationError(
          'acquire_lock',
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

        const acquired = await recordsService.acquireLock(id, user);

        if (!acquired) {
          const lock = await recordsService.getLock(id);
          const error = new Error(
            `Record is locked by ${lock?.locked_by || 'another user'}`
          );
          (error as any).statusCode = 409;
          (error as any).code = 'RECORD_LOCKED';
          (error as any).lockedBy = lock?.locked_by;
          (error as any).expiresAt = lock?.expires_at;
          throw error;
        }

        sendSuccess({ locked: true, recordId: id }, req, res, {
          operation: 'acquire_lock',
        });
      } catch (error) {
        handleApiError(
          'acquire_lock',
          error,
          req,
          res,
          'Failed to acquire lock'
        );
      }
    }
  );

  // DELETE /api/v1/records/:id/lock - Release lock (authenticated only)
  router.delete(
    '/:id/lock',
    authMiddleware(recordsService.getCivicPress()),
    requireRecordPermission('edit'),
    param('id').isString().notEmpty(),
    async (req: AuthenticatedRequest, res: Response) => {
      logApiRequest(req, { operation: 'release_lock' });

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return handleRecordsValidationError(
          'release_lock',
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

        const released = await recordsService.releaseLock(id, user);

        sendSuccess({ locked: !released, recordId: id }, req, res, {
          operation: 'release_lock',
        });
      } catch (error) {
        handleApiError(
          'release_lock',
          error,
          req,
          res,
          'Failed to release lock'
        );
      }
    }
  );

  // GET /api/v1/records/:id/lock - Get lock status (authenticated only)
  router.get(
    '/:id/lock',
    authMiddleware(recordsService.getCivicPress()),
    requireRecordPermission('edit'),
    param('id').isString().notEmpty(),
    async (req: AuthenticatedRequest, res: Response) => {
      logApiRequest(req, { operation: 'get_lock' });

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return handleRecordsValidationError(
          'get_lock',
          errors.array(),
          req,
          res
        );
      }

      try {
        const { id } = req.params;
        const lock = await recordsService.getLock(id);

        sendSuccess(
          {
            locked: !!lock,
            lockedBy: lock?.locked_by || null,
            lockedAt: lock?.locked_at || null,
            expiresAt: lock?.expires_at || null,
          },
          req,
          res,
          { operation: 'get_lock' }
        );
      } catch (error) {
        handleApiError(
          'get_lock',
          error,
          req,
          res,
          'Failed to get lock status'
        );
      }
    }
  );

  return router;
}
