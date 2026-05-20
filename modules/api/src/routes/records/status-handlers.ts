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

export function registerStatusRoutes(
  router: Router,
  recordsService: RecordsService
): void {
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
}
