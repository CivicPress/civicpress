import { Router, Response } from 'express';
import { param, validationResult } from 'express-validator';
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
import { handleRecordsValidationError } from './handlers-common.js';

export function registerLockRoutes(
  router: Router,
  recordsService: RecordsService
): void {
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
}
