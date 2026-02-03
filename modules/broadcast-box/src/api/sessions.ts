/**
 * Session Management API Routes
 *
 * REST API endpoints for Broadcast Box session control
 */

import { Router, Response, Request } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import type { Logger } from '@civicpress/core';

// Type for authenticated requests
interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    username: string;
    role: string;
  };
}

import type { SessionController } from '../services/session-controller.js';
import type { StartSessionRequest, SessionStatus } from '../types/index.js';

export function createSessionsRouter(
  sessionController: SessionController,
  logger: Logger
): Router {
  const router = Router();

  /**
   * POST /api/v1/broadcast-box/sessions
   * Start a recording session
   */
  router.post(
    '/',
    [
      body('deviceId').isUUID().withMessage('Device ID must be a valid UUID'),
      body('civicpressSessionId')
        .isString()
        .notEmpty()
        .withMessage('CivicPress session ID is required'),
      body('metadata').optional().isObject(),
      body('metadata.videoSource').optional().isString(),
      body('metadata.audioSource').optional().isString(),
      body('metadata.quality').optional().isString(),
      body('metadata.pip').optional().isObject(),
    ],
    // TODO: Add authMiddleware
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({
            success: false,
            error: {
              message: 'Validation failed',
              details: errors.array(),
            },
          });
        }

        // Check permissions
        // TODO: Add permission check for broadcast-box:sessions:create

        const request: StartSessionRequest = {
          deviceId: req.body.deviceId,
          civicpressSessionId: req.body.civicpressSessionId,
          metadata: req.body.metadata || {},
        };

        const session = await sessionController.startSession(request);

        res.status(201).json({
          success: true,
          session,
        });
      } catch (error) {
        logger.error('Error starting session', {
          operation: 'broadcast-box:api:sessions:start',
          error: error instanceof Error ? error.message : String(error),
        });

        const statusCode =
          error instanceof Error && error.message.includes('not found')
            ? 404
            : (error instanceof Error &&
                  error.message.includes('not active')) ||
                (error instanceof Error &&
                  error.message.includes('not connected')) ||
                (error instanceof Error &&
                  error.message.includes('already recording'))
              ? 409
              : 500;

        res.status(statusCode).json({
          success: false,
          error: {
            message:
              error instanceof Error
                ? error.message
                : 'Failed to start session',
          },
        });
      }
    }
  );

  /**
   * POST /api/v1/broadcast-box/sessions/:id/stop
   * Stop a recording session
   */
  router.post(
    '/:id/stop',
    [param('id').isUUID().withMessage('Session ID must be a valid UUID')],
    // TODO: Add authMiddleware
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({
            success: false,
            error: {
              message: 'Validation failed',
              details: errors.array(),
            },
          });
        }

        // Check permissions
        // TODO: Add permission check for broadcast-box:sessions:stop

        const session = await sessionController.stopSession(req.params.id);

        res.json({
          success: true,
          session,
        });
      } catch (error) {
        logger.error('Error stopping session', {
          operation: 'broadcast-box:api:sessions:stop',
          sessionId: req.params.id,
          error: error instanceof Error ? error.message : String(error),
        });

        const statusCode =
          error instanceof Error && error.message.includes('not found')
            ? 404
            : error instanceof Error && error.message.includes('not recording')
              ? 409
              : 500;

        res.status(statusCode).json({
          success: false,
          error: {
            message:
              error instanceof Error ? error.message : 'Failed to stop session',
          },
        });
      }
    }
  );

  /**
   * DELETE /api/v1/broadcast-box/sessions/:id
   * Delete a broadcast session (removes from list)
   */
  router.delete(
    '/:id',
    [param('id').isUUID().withMessage('Session ID must be a valid UUID')],
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({
            success: false,
            error: {
              message: 'Validation failed',
              details: errors.array(),
            },
          });
        }

        await sessionController.deleteSession(req.params.id);

        res.status(200).json({
          success: true,
        });
      } catch (error) {
        logger.error('Error deleting session', {
          operation: 'broadcast-box:api:sessions:delete',
          sessionId: req.params.id,
          error: error instanceof Error ? error.message : String(error),
        });

        const statusCode =
          error instanceof Error && error.message.includes('not found')
            ? 404
            : 500;

        res.status(statusCode).json({
          success: false,
          error: {
            message:
              error instanceof Error
                ? error.message
                : 'Failed to delete session',
          },
        });
      }
    }
  );

  /**
   * GET /api/v1/broadcast-box/sessions/:id
   * Get session details
   */
  router.get(
    '/:id',
    [param('id').isUUID().withMessage('Session ID must be a valid UUID')],
    // TODO: Add authMiddleware
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({
            success: false,
            error: {
              message: 'Validation failed',
              details: errors.array(),
            },
          });
        }

        // Check permissions
        // TODO: Add permission check for broadcast-box:sessions:view

        const session = await sessionController.getSession(req.params.id);

        if (!session) {
          return res.status(404).json({
            success: false,
            error: {
              message: 'Session not found',
            },
          });
        }

        // TODO: Add upload information
        res.json({
          success: true,
          session,
        });
      } catch (error) {
        logger.error('Error getting session', {
          operation: 'broadcast-box:api:sessions:get',
          sessionId: req.params.id,
          error: error instanceof Error ? error.message : String(error),
        });
        res.status(500).json({
          success: false,
          error: {
            message: 'Failed to get session',
          },
        });
      }
    }
  );

  /**
   * GET /api/v1/broadcast-box/sessions
   * List sessions with filters
   */
  router.get(
    '/',
    [
      query('deviceId').optional().isUUID(),
      query('civicpressSessionId').optional().isString(),
      query('status').optional().isString(),
      query('limit').optional().isInt({ min: 1, max: 100 }),
      query('offset').optional().isInt({ min: 0 }),
    ],
    // TODO: Add authMiddleware
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({
            success: false,
            error: {
              message: 'Validation failed',
              details: errors.array(),
            },
          });
        }

        // Check permissions
        // TODO: Add permission check for broadcast-box:sessions:list

        const filters = {
          deviceId: req.query.deviceId as string | undefined,
          civicpressSessionId: req.query.civicpressSessionId as
            | string
            | undefined,
          status:
            (req.query.status as SessionStatus | undefined) &&
            [
              'pending',
              'recording',
              'stopping',
              'encoding',
              'uploading',
              'complete',
              'failed',
            ].includes(req.query.status as string)
              ? (req.query.status as SessionStatus)
              : undefined,
          limit: req.query.limit
            ? parseInt(req.query.limit as string)
            : undefined,
          offset: req.query.offset
            ? parseInt(req.query.offset as string)
            : undefined,
        };

        const sessions = await sessionController.listSessions(filters);

        res.json({
          success: true,
          sessions,
        });
      } catch (error) {
        logger.error('Error listing sessions', {
          operation: 'broadcast-box:api:sessions:list',
          error: error instanceof Error ? error.message : String(error),
        });
        res.status(500).json({
          success: false,
          error: {
            message: 'Failed to list sessions',
          },
        });
      }
    }
  );

  return router;
}
