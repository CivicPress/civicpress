import { Router, Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import {
  AuthenticatedRequest,
  requireRecordPermission,
  authMiddleware,
} from '../../middleware/auth.js';
import { RecordsService } from '../../services/records-service.js';
import {
  sendSuccess,
  handleApiError,
  logApiRequest,
} from '../../utils/api-logger.js';
import { audit, handleRecordsValidationError } from './handlers-common.js';

export function registerWriteRoutes(
  router: Router,
  recordsService: RecordsService
): void {
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
}
