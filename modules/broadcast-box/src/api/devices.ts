/**
 * Device Management API Routes
 *
 * REST API endpoints for Broadcast Box device management
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
import { DeviceManager } from '../services/device-manager.js';
import { DeviceAuthService } from '../services/device-auth.js';
import type { DeviceConnectionTracker } from '../services/device-connection-tracker.js';
import type {
  CreateDeviceRequest,
  UpdateDeviceRequest,
} from '../types/index.js';

export function createDevicesRouter(
  deviceManager: DeviceManager,
  deviceAuth: DeviceAuthService,
  logger: Logger,
  connectionTracker?: DeviceConnectionTracker
): Router {
  const router = Router();

  /**
   * GET /api/v1/broadcast-box/devices
   * List all devices
   */
  router.get(
    '/',
    [
      query('status').optional().isString(),
      query('room').optional().isString(),
      query('limit').optional().isInt({ min: 1, max: 100 }),
      query('offset').optional().isInt({ min: 0 }),
    ],
    // TODO: Add authMiddleware from @civicpress/api
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
        // TODO: Add permission check for broadcast-box:devices:list

        const filters = {
          status: req.query.status as string | undefined,
          limit: req.query.limit
            ? parseInt(req.query.limit as string)
            : undefined,
          offset: req.query.offset
            ? parseInt(req.query.offset as string)
            : undefined,
        };

        const devices = await deviceManager.listDevices(filters);

        res.json({
          success: true,
          devices,
        });
      } catch (error) {
        logger.error('Error listing devices', {
          operation: 'broadcast-box:api:devices:list',
          error: error instanceof Error ? error.message : String(error),
        });
        res.status(500).json({
          success: false,
          error: {
            message: 'Failed to list devices',
          },
        });
      }
    }
  );

  /**
   * GET /api/v1/broadcast-box/devices/:id
   * Get device details
   */
  router.get(
    '/:id',
    [param('id').isUUID().withMessage('Device ID must be a valid UUID')],
    // TODO: Add authMiddleware from @civicpress/api
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
        // TODO: Add permission check for broadcast-box:devices:view

        const device = await deviceManager.getDevice(req.params.id);

        if (!device) {
          return res.status(404).json({
            success: false,
            error: {
              message: 'Device not found',
            },
          });
        }

        // Get connection state if tracker is available
        const connectionState = connectionTracker
          ? connectionTracker.getConnectionState(device.id)
          : null;

        res.json({
          success: true,
          device,
          connection: connectionState
            ? {
                connected: connectionState.connected,
                endpoint: connectionState.endpoint,
                lastHeartbeat: connectionState.lastHeartbeat?.toISOString(),
                state: connectionState.state,
              }
            : undefined,
          // TODO: Add recent sessions
        });
      } catch (error) {
        logger.error('Error getting device', {
          operation: 'broadcast-box:api:devices:get',
          deviceId: req.params.id,
          error: error instanceof Error ? error.message : String(error),
        });
        res.status(500).json({
          success: false,
          error: {
            message: 'Failed to get device',
          },
        });
      }
    }
  );

  /**
   * POST /api/v1/broadcast-box/devices
   * Register new device (enrollment)
   */
  router.post(
    '/',
    [
      body('deviceUuid')
        .isUUID()
        .withMessage('Device UUID must be a valid UUID'),
      body('enrollmentCode')
        .isString()
        .notEmpty()
        .withMessage('Enrollment code is required'),
      body('name').isString().notEmpty().withMessage('Device name is required'),
      body('roomLocation').optional().isString(),
      body('capabilities').optional().isObject(),
      body('config').optional().isObject(),
    ],
    // TODO: Add authMiddleware from @civicpress/api
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
        // TODO: Add permission check for broadcast-box:devices:create

        const createRequest: CreateDeviceRequest & { enrollmentCode: string } =
          {
            deviceUuid: req.body.deviceUuid,
            enrollmentCode: req.body.enrollmentCode,
            name: req.body.name,
            roomLocation: req.body.roomLocation,
            capabilities: req.body.capabilities,
            config: req.body.config,
          };

        // Register device
        const device = await deviceManager.registerDevice(createRequest);

        // Activate device
        const activated = await deviceManager.activateDevice(device.id);

        // Generate device token
        const tokenResult = await deviceAuth.generateToken({
          deviceId: activated.id,
          deviceUuid: activated.deviceUuid,
          organizationId: activated.organizationId,
        });

        res.status(201).json({
          success: true,
          device: activated,
          credentials: {
            token: tokenResult.token,
            expiresAt: tokenResult.expiresAt.toISOString(),
          },
        });
      } catch (error) {
        logger.error('Error registering device', {
          operation: 'broadcast-box:api:devices:register',
          error: error instanceof Error ? error.message : String(error),
        });

        const statusCode =
          error instanceof Error && error.message.includes('already registered')
            ? 409
            : 500;

        res.status(statusCode).json({
          success: false,
          error: {
            message:
              error instanceof Error
                ? error.message
                : 'Failed to register device',
          },
        });
      }
    }
  );

  /**
   * PATCH /api/v1/broadcast-box/devices/:id
   * Update device configuration
   */
  router.patch(
    '/:id',
    [
      param('id').isUUID().withMessage('Device ID must be a valid UUID'),
      body('name').optional().isString(),
      body('roomLocation').optional().isString(),
      body('config').optional().isObject(),
      body('status')
        .optional()
        .isIn(['enrolled', 'active', 'suspended', 'revoked']),
    ],
    // TODO: Add authMiddleware from @civicpress/api
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
        // TODO: Add permission check for broadcast-box:devices:update

        const updateRequest: UpdateDeviceRequest = {
          name: req.body.name,
          roomLocation: req.body.roomLocation,
          config: req.body.config,
          status: req.body.status,
        };

        const device = await deviceManager.updateDevice(
          req.params.id,
          updateRequest
        );

        res.json({
          success: true,
          device,
        });
      } catch (error) {
        logger.error('Error updating device', {
          operation: 'broadcast-box:api:devices:update',
          deviceId: req.params.id,
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
                : 'Failed to update device',
          },
        });
      }
    }
  );

  /**
   * DELETE /api/v1/broadcast-box/devices/:id
   * Revoke device
   */
  router.delete(
    '/:id',
    [param('id').isUUID().withMessage('Device ID must be a valid UUID')],
    // TODO: Add authMiddleware from @civicpress/api
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
        // TODO: Add permission check for broadcast-box:devices:delete

        await deviceManager.revokeDevice(req.params.id);

        res.json({
          success: true,
          message: 'Device revoked successfully',
        });
      } catch (error) {
        logger.error('Error revoking device', {
          operation: 'broadcast-box:api:devices:revoke',
          deviceId: req.params.id,
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
                : 'Failed to revoke device',
          },
        });
      }
    }
  );

  /**
   * GET /api/v1/broadcast-box/devices/:id/health
   * Get device health status
   */
  router.get(
    '/:id/health',
    [param('id').isUUID().withMessage('Device ID must be a valid UUID')],
    // TODO: Add authMiddleware from @civicpress/api
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
        // TODO: Add permission check for broadcast-box:devices:view

        const device = await deviceManager.getDevice(req.params.id);

        if (!device) {
          return res.status(404).json({
            success: false,
            error: {
              message: 'Device not found',
            },
          });
        }

        // Get connection state if tracker is available
        const connectionState = connectionTracker
          ? connectionTracker.getConnectionState(device.id)
          : null;

        res.json({
          success: true,
          health: {
            score: 100, // Placeholder - will be populated from device events
            status: 'healthy', // Placeholder
            metrics: {
              memoryPercent: 0,
              cpuPercent: 0,
              diskPercent: 0,
            },
          },
          connection: {
            connected: connectionState?.connected || false,
            endpoint: connectionState?.endpoint,
            lastHeartbeat:
              connectionState?.lastHeartbeat?.toISOString() ||
              device.lastSeenAt?.toISOString(),
            state: connectionState?.state,
          },
          lastUpdated: new Date().toISOString(),
        });
      } catch (error) {
        logger.error('Error getting device health', {
          operation: 'broadcast-box:api:devices:health',
          deviceId: req.params.id,
          error: error instanceof Error ? error.message : String(error),
        });
        res.status(500).json({
          success: false,
          error: {
            message: 'Failed to get device health',
          },
        });
      }
    }
  );

  return router;
}
