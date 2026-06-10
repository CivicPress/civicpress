import { Router, Response } from 'express';
import { HttpError } from '../../utils/http-error.js';
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
import type { RealtimeServerLike } from '../../realtime-bootstrap.js';

/**
 * Register the realtime-snapshot route on the records router.
 *
 * `POST /api/v1/records/:id/snapshot` lets an editing client force-flush the
 * live collaborative (Yjs) document for a record into a persisted snapshot +
 * the canonical Markdown draft. The actual work happens IN-PROCESS in the
 * realtime server (same process as the API), reached through the narrow
 * {@link RealtimeServerLike} contract — the router never imports realtime types.
 *
 * The realtime server is resolved LAZILY via `getRealtimeServer()` because the
 * routes are wired during API initialize() but the realtime server only starts
 * later in API start(). When realtime is disabled / not started, the provider
 * returns null and we report a graceful no-op snapshot rather than an error.
 *
 * Auth mirrors the sibling lock routes: authMiddleware + records:edit. Note the
 * records router is mounted behind csrfMiddleware, so an unauthenticated browser
 * POST is rejected with 403 (CSRF_TOKEN_MISSING) before reaching this handler.
 */
export function registerSnapshotRoutes(
  router: Router,
  recordsService: RecordsService,
  getRealtimeServer: () => RealtimeServerLike | null
): void {
  // POST /api/v1/records/:id/snapshot - Trigger a realtime snapshot (edit perm)
  router.post(
    '/:id/snapshot',
    authMiddleware(recordsService.getCivicPress()),
    requireRecordPermission('edit'),
    param('id').isString().notEmpty(),
    async (req: AuthenticatedRequest, res: Response) => {
      logApiRequest(req, { operation: 'record_snapshot' });

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return handleRecordsValidationError(
          'record_snapshot',
          errors.array(),
          req,
          res
        );
      }

      try {
        const { id } = req.params;
        const user = req.user;

        if (!user) {
          throw new HttpError(401, 'User authentication required');
        }

        const realtimeServer = getRealtimeServer();

        // Realtime not running (disabled, failed to start, or no in-process
        // server): degrade gracefully — there is no live room to flush.
        if (!realtimeServer) {
          sendSuccess(
            {
              snapshotCreated: false,
              version: null,
              timestamp: Date.now(),
            },
            req,
            res,
            { operation: 'record_snapshot' }
          );
          return;
        }

        const result = await realtimeServer.triggerRecordSnapshot(id);

        sendSuccess(
          {
            snapshotCreated: result.snapshotCreated,
            version: result.version,
            timestamp: result.timestamp,
          },
          req,
          res,
          { operation: 'record_snapshot' }
        );
      } catch (error) {
        handleApiError(
          'record_snapshot',
          error,
          req,
          res,
          'Failed to create record snapshot'
        );
      }
    }
  );
}
