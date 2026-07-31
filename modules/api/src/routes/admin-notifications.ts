/**
 * Operator notification center (the "inbox") — admin API.
 *
 * Read/ack surface over the OperatorNotifier: list, unread count, mark read,
 * mark-all read, dismiss. Mounted behind authMiddleware + requirePermission
 * ('system:admin'); req.civicPress is injected at the mount.
 *
 * This is the durable, channel-free operator feed: undeliverable password-reset
 * requests, plus system signal (backup failed, security alerts, updates).
 */

import { Router, Request, Response } from 'express';
import {
  CivicPress,
  type ListOperatorNotificationsOptions,
  type OperatorNotificationStatus,
  type OperatorNotificationSeverity,
} from '@civicpress/core';
import {
  sendSuccess,
  handleApiError,
  logApiRequest,
} from '../utils/api-logger.js';
import { HttpError } from '../utils/http-error.js';

const STATUSES: OperatorNotificationStatus[] = ['unread', 'read', 'dismissed'];
const SEVERITIES: OperatorNotificationSeverity[] = [
  'info',
  'warning',
  'critical',
  'action',
];

/** Parse and clamp a positive integer query param. */
function parsePositiveInt(
  value: unknown,
  fallback: number,
  max: number
): number {
  const n = typeof value === 'string' ? parseInt(value, 10) : NaN;
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(n, max);
}

/** Validate a route :id as a positive integer, or throw a 400. */
function requireId(raw: string): number {
  const id = parseInt(raw, 10);
  if (!Number.isFinite(id) || id <= 0) {
    throw new HttpError(400, 'Invalid notification id', 'INVALID_ID');
  }
  return id;
}

export function createAdminNotificationsRouter(): Router {
  const router = Router();

  /**
   * GET /api/v1/admin/notifications
   * List operator notifications. Query: status, type, severity, limit, offset.
   */
  router.get('/', async (req: Request, res: Response) => {
    logApiRequest(req, { operation: 'admin_notifications_list' });
    try {
      const civicPress = req.civicPress as CivicPress;
      const notifier = civicPress.getOperatorNotifier();

      const { status, type, severity } = req.query;
      const options: ListOperatorNotificationsOptions = {
        limit: parsePositiveInt(req.query.limit, 50, 200),
        offset: parsePositiveInt(req.query.offset, 0, Number.MAX_SAFE_INTEGER),
      };
      // offset defaults to 0 (parsePositiveInt returns fallback 0 for absent).
      if (options.offset === 0) delete options.offset;
      if (typeof status === 'string' && STATUSES.includes(status as never)) {
        options.status = status as OperatorNotificationStatus;
      }
      if (typeof type === 'string') options.type = type;
      if (
        typeof severity === 'string' &&
        SEVERITIES.includes(severity as never)
      ) {
        options.severity = severity as OperatorNotificationSeverity;
      }

      const result = await notifier.list(options);
      sendSuccess(result, req, res, {
        operation: 'admin_notifications_list',
      });
    } catch (error) {
      handleApiError('admin_notifications_list', error, req, res);
    }
  });

  /**
   * GET /api/v1/admin/notifications/unread-count
   * The bell badge count.
   */
  router.get('/unread-count', async (req: Request, res: Response) => {
    try {
      const civicPress = req.civicPress as CivicPress;
      const unread = await civicPress.getOperatorNotifier().countUnread();
      sendSuccess({ unread }, req, res, {
        operation: 'admin_notifications_unread_count',
      });
    } catch (error) {
      handleApiError('admin_notifications_unread_count', error, req, res);
    }
  });

  /**
   * POST /api/v1/admin/notifications/read-all
   * Mark every unread notification read.
   */
  router.post('/read-all', async (req: Request, res: Response) => {
    logApiRequest(req, { operation: 'admin_notifications_read_all' });
    try {
      const civicPress = req.civicPress as CivicPress;
      const updated = await civicPress.getOperatorNotifier().markAllRead();
      sendSuccess({ updated }, req, res, {
        operation: 'admin_notifications_read_all',
      });
    } catch (error) {
      handleApiError('admin_notifications_read_all', error, req, res);
    }
  });

  /**
   * POST /api/v1/admin/notifications/:id/read
   */
  router.post('/:id/read', async (req: Request, res: Response) => {
    logApiRequest(req, { operation: 'admin_notifications_read' });
    try {
      const id = requireId(req.params.id);
      const civicPress = req.civicPress as CivicPress;
      const changed = await civicPress.getOperatorNotifier().markRead(id);
      sendSuccess({ id, changed }, req, res, {
        operation: 'admin_notifications_read',
      });
    } catch (error) {
      handleApiError('admin_notifications_read', error, req, res);
    }
  });

  /**
   * POST /api/v1/admin/notifications/:id/dismiss
   */
  router.post('/:id/dismiss', async (req: Request, res: Response) => {
    logApiRequest(req, { operation: 'admin_notifications_dismiss' });
    try {
      const id = requireId(req.params.id);
      const civicPress = req.civicPress as CivicPress;
      const changed = await civicPress.getOperatorNotifier().dismiss(id);
      sendSuccess({ id, changed }, req, res, {
        operation: 'admin_notifications_dismiss',
      });
    } catch (error) {
      handleApiError('admin_notifications_dismiss', error, req, res);
    }
  });

  return router;
}
