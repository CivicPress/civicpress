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
import type { DeviceCommandService } from '../services/device-command-service.js';
import type { DeviceRegistrationRateLimiter } from '../middleware/rate-limiter.js';
import type {
  CreateDeviceRequest,
  UpdateDeviceRequest,
  DeviceStatus,
} from '../types/index.js';

// Helper to get client IP
function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const ips = Array.isArray(forwarded)
      ? forwarded[0]
      : forwarded.split(',')[0];
    return ips.trim();
  }
  const realIp = req.headers['x-real-ip'];
  if (realIp) {
    return Array.isArray(realIp) ? realIp[0] : realIp;
  }
  return req.socket.remoteAddress || 'unknown';
}

export function createDevicesRouter(
  deviceManager: DeviceManager,
  deviceAuth: DeviceAuthService,
  logger: Logger,
  connectionTracker?: DeviceConnectionTracker,
  rateLimiter?: DeviceRegistrationRateLimiter,
  deviceCommandService?: DeviceCommandService
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

        // Validate and cast status to DeviceStatus type
        const status = req.query.status as string | undefined;
        const validStatuses = [
          'enrolled',
          'active',
          'suspended',
          'revoked',
        ] as const;
        const deviceStatus =
          status && validStatuses.includes(status as any)
            ? (status as DeviceStatus)
            : undefined;

        const filters = {
          status: deviceStatus,
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

        // Try to find device by UUID first (most common case)
        // If that fails, try by database ID (for backward compatibility)
        // The URL parameter could be either a device UUID or a database ID
        let device = await deviceManager.getDeviceByUuid(req.params.id);

        // If not found by UUID, try by database ID
        if (!device) {
          device = await deviceManager.getDevice(req.params.id);
        }

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

        // Get enrollment code status (gracefully handle errors)
        let enrollmentStatus = {
          exists: false,
          isExpired: false,
          isUsed: false,
          expiresAt: null as Date | null,
          createdAt: null as Date | null,
          usedAt: null as Date | null,
        };

        try {
          enrollmentStatus = await deviceManager.getEnrollmentCodeStatus(
            device.deviceUuid
          );
        } catch (err) {
          // Log but don't fail the request if enrollment code lookup fails
          logger.warn('Failed to get enrollment code status', {
            operation: 'broadcast-box:api:devices:get:enrollment-status',
            deviceId: req.params.id,
            deviceUuid: device.deviceUuid,
            error: err instanceof Error ? err.message : String(err),
          });
        }

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
          enrollmentCode: enrollmentStatus.exists
            ? {
                exists: true,
                isExpired: enrollmentStatus.isExpired,
                isUsed: enrollmentStatus.isUsed,
                expiresAt: enrollmentStatus.expiresAt?.toISOString() || null,
                createdAt: enrollmentStatus.createdAt?.toISOString() || null,
                usedAt: enrollmentStatus.usedAt?.toISOString() || null,
              }
            : {
                exists: false,
                isExpired: false,
                isUsed: false,
                expiresAt: null,
                createdAt: null,
                usedAt: null,
              },
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
   * POST /api/v1/broadcast-box/devices/enroll
   * Enroll a new device (generate device UUID and enrollment code)
   */
  // Add error handling wrapper for validation middleware
  const enrollValidation = [
    body('name').isString().notEmpty().withMessage('Device name is required'),
    body('roomLocation').optional().isString(),
    // Add a handler to check validation results
    (req: any, res: any, next: any) => {
      console.log('=== VALIDATION MIDDLEWARE RUNNING ===');
      console.log('Request body:', JSON.stringify(req.body, null, 2));
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        console.error('=== VALIDATION ERRORS FOUND ===');
        console.error('Errors:', JSON.stringify(errors.array(), null, 2));
        console.error('===============================');
        return res.status(400).json({
          success: false,
          error: {
            message: 'Validation failed',
            details: errors.array(),
          },
        });
      }
      console.log('Validation passed, calling next()');
      next();
    },
  ];

  router.post(
    '/enroll',
    enrollValidation,
    // TODO: Add authMiddleware from @civicpress/api
    async (req: AuthenticatedRequest, res: Response, next: any) => {
      try {
        console.log('=== ENROLL ENDPOINT CALLED ===');
        console.log('Request body:', JSON.stringify(req.body, null, 2));
        console.log('Body type:', typeof req.body);
        console.log('Has body:', !!req.body);
        console.log('Request method:', req.method);
        console.log('Request path:', req.path);
        console.log('==============================');

        logger.info('Enroll endpoint called', {
          operation: 'broadcast-box:api:devices:enroll',
          body: req.body,
          bodyType: typeof req.body,
          hasBody: !!req.body,
        });

        // Check validation errors
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          logger.warn('Validation errors found', {
            operation: 'broadcast-box:api:devices:enroll',
            errors: errors.array(),
          });
          return res.status(400).json({
            success: false,
            error: {
              message: 'Validation failed',
              details: errors.array(),
            },
          });
        }

        // Check permissions
        // TODO: Add permission check for broadcast-box:devices:enroll

        // Validate request body exists
        if (!req.body) {
          logger.warn('Request body missing', {
            operation: 'broadcast-box:api:devices:enroll',
          });
          return res.status(400).json({
            success: false,
            error: {
              message: 'Request body is required',
            },
          });
        }

        // Validate name exists and is a string
        if (!req.body.name || typeof req.body.name !== 'string') {
          logger.warn('Invalid name field', {
            operation: 'broadcast-box:api:devices:enroll',
            name: req.body.name,
            nameType: typeof req.body.name,
          });
          return res.status(400).json({
            success: false,
            error: {
              message: 'Device name is required and must be a string',
            },
          });
        }

        logger.info('Enrolling device', {
          operation: 'broadcast-box:api:devices:enroll',
          name: req.body.name,
          roomLocation: req.body.roomLocation,
        });

        // Get client IP and user ID (if authenticated)
        const ipAddress = getClientIp(req);
        const userId = (req as AuthenticatedRequest).user?.id || null;

        const enrollment = await deviceManager.enrollDevice({
          name: req.body.name,
          roomLocation: req.body.roomLocation,
          createdByUserId: userId,
          ipAddress,
        });

        logger.info('Device enrolled successfully', {
          operation: 'broadcast-box:api:devices:enroll',
          deviceUuid: enrollment.deviceUuid,
        });

        res.status(201).json({
          success: true,
          enrollment: {
            deviceUuid: enrollment.deviceUuid,
            enrollmentCode: enrollment.enrollmentCode,
            expiresAt: enrollment.expiresAt.toISOString(),
          },
        });
      } catch (error) {
        // Log the error with full details BEFORE passing to error handler
        const errorObj =
          error instanceof Error ? error : new Error(String(error));

        // Log to console directly for immediate visibility
        console.error('=== BROADCAST BOX ENROLL ERROR ===');
        console.error('Error type:', typeof error);
        console.error('Error constructor:', error?.constructor?.name);
        console.error('Error name:', errorObj.name);
        console.error('Error message:', errorObj.message);
        console.error('Error stack:', errorObj.stack);
        console.error('Request body:', JSON.stringify(req.body, null, 2));
        if ((error as any).code) {
          console.error('Error code:', (error as any).code);
        }
        console.error('===================================');

        logger.error('Error enrolling device - full details', {
          operation: 'broadcast-box:api:devices:enroll',
          error: {
            message: errorObj.message,
            name: errorObj.name,
            stack: errorObj.stack,
            ...((error as any).code && { code: (error as any).code }),
          },
          body: req.body,
          bodyStringified: JSON.stringify(req.body),
          errorType: typeof error,
          errorConstructor: error?.constructor?.name,
        });

        // Set status code on error object
        (errorObj as any).statusCode = 500;

        // Pass error to next middleware (error handler)
        next(errorObj);
      }
    }
  );

  /**
   * POST /api/v1/broadcast-box/devices
   * Register new device (after enrollment)
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

        // Get client IP for audit logging
        const registrationIp = getClientIp(req);

        const createRequest: CreateDeviceRequest & {
          enrollmentCode: string;
          registrationIp?: string | null;
        } = {
          deviceUuid: req.body.deviceUuid,
          enrollmentCode: req.body.enrollmentCode,
          name: req.body.name,
          roomLocation: req.body.roomLocation,
          capabilities: req.body.capabilities,
          config: req.body.config,
          registrationIp,
        };

        // Register device (returns existing device if already registered)
        // Device is created with status 'enrolled' - activation happens on first connection
        const device = await deviceManager.registerDevice(createRequest);

        // Generate device token (always generate new token for re-registration)
        // Note: Device activation happens on first WebSocket connection or health check
        const tokenResult = await deviceAuth.generateToken({
          deviceId: device.id,
          deviceUuid: device.deviceUuid,
          organizationId: device.organizationId,
        });

        res.status(201).json({
          success: true,
          device: device,
          credentials: {
            token: tokenResult.token,
            expiresAt: tokenResult.expiresAt.toISOString(),
          },
        });
      } catch (error) {
        const registrationIp = getClientIp(req);
        logger.error('Error registering device', {
          operation: 'broadcast-box:api:devices:register',
          error: error instanceof Error ? error.message : String(error),
          ip: registrationIp,
        });

        // Return generic error message for security (don't leak code existence)
        let statusCode = 500;
        let errorMessage = 'Failed to register device';

        if (error instanceof Error) {
          if (error.message.includes('already registered')) {
            statusCode = 409;
            errorMessage = 'Device already registered';
          } else if (
            error.message.includes('Invalid enrollment code') ||
            error.message.includes('Enrollment code expired') ||
            error.message.includes('Enrollment code already used') ||
            error.message.includes('Device UUID mismatch')
          ) {
            statusCode = 401;
            errorMessage = 'Invalid enrollment credentials';
          }
        }

        res.status(statusCode).json({
          success: false,
          error: {
            message: errorMessage,
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

        // Try to find device by UUID first, then by database ID
        let device = await deviceManager.getDeviceByUuid(req.params.id);
        if (!device) {
          device = await deviceManager.getDevice(req.params.id);
        }

        if (!device) {
          return res.status(404).json({
            success: false,
            error: {
              message: 'Device not found',
            },
          });
        }

        const updateRequest: UpdateDeviceRequest = {
          name: req.body.name,
          roomLocation: req.body.roomLocation,
          config: req.body.config,
          status: req.body.status,
        };

        const updatedDevice = await deviceManager.updateDevice(
          device.id, // Use database ID for update
          updateRequest
        );

        res.json({
          success: true,
          device: updatedDevice,
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

        // Try to find device by UUID first, then by database ID
        let device = await deviceManager.getDeviceByUuid(req.params.id);
        if (!device) {
          device = await deviceManager.getDevice(req.params.id);
        }

        if (!device) {
          return res.status(404).json({
            success: false,
            error: {
              message: 'Device not found',
            },
          });
        }

        await deviceManager.revokeDevice(device.id); // Use database ID for revoke

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
   * POST /api/v1/broadcast-box/devices/:id/enroll
   * Regenerate enrollment code for an existing device
   */
  router.post(
    '/:id/enroll',
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
        // TODO: Add permission check for broadcast-box:devices:enroll

        // Try to find device by UUID first, then by database ID
        let device = await deviceManager.getDeviceByUuid(req.params.id);
        if (!device) {
          device = await deviceManager.getDevice(req.params.id);
        }

        if (!device) {
          return res.status(404).json({
            success: false,
            error: {
              message: 'Device not found',
            },
          });
        }

        // Get client IP and user ID (if authenticated)
        const ipAddress = getClientIp(req);
        const userId = (req as AuthenticatedRequest).user?.id || null;

        // Verify method exists (for debugging)
        if (typeof deviceManager.regenerateEnrollmentCode !== 'function') {
          const availableMethods = Object.getOwnPropertyNames(
            Object.getPrototypeOf(deviceManager)
          ).filter(
            (name) =>
              name !== 'constructor' &&
              typeof (deviceManager as any)[name] === 'function'
          );

          logger.error(
            'regenerateEnrollmentCode method not found on deviceManager',
            {
              operation: 'broadcast-box:api:devices:regenerate-enroll',
              deviceId: device.id,
              deviceUuid: device.deviceUuid,
              deviceManagerType: deviceManager.constructor.name,
              availableMethods: availableMethods,
              hasEnrollDevice: typeof deviceManager.enrollDevice === 'function',
              hasRegisterDevice:
                typeof deviceManager.registerDevice === 'function',
              hasActivateDevice:
                typeof deviceManager.activateDevice === 'function',
            }
          );
          return res.status(500).json({
            success: false,
            error: {
              message:
                'Enrollment code regeneration not available. Please restart the server.',
              details:
                'The regenerateEnrollmentCode method is not available on the DeviceManager instance. This usually means the server is running old code. Available methods: ' +
                availableMethods.join(', '),
            },
          });
        }

        const enrollment = await deviceManager.regenerateEnrollmentCode(
          device.id, // Use database ID for regenerate
          {
            createdByUserId: userId,
            ipAddress,
          }
        );

        logger.info('Enrollment code regenerated successfully', {
          operation: 'broadcast-box:api:devices:regenerate-enroll',
          deviceId: req.params.id,
          deviceUuid: enrollment.deviceUuid,
        });

        res.json({
          success: true,
          enrollment: {
            deviceUuid: enrollment.deviceUuid,
            enrollmentCode: enrollment.enrollmentCode,
            expiresAt: enrollment.expiresAt.toISOString(),
          },
        });
      } catch (error) {
        logger.error('Error regenerating enrollment code', {
          operation: 'broadcast-box:api:devices:regenerate-enroll',
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
                : 'Failed to regenerate enrollment code',
          },
        });
      }
    }
  );

  /**
   * POST /api/v1/broadcast-box/devices/:id/command
   * Execute a command on a device
   */
  router.post(
    '/:id/command',
    [
      param('id').isUUID().withMessage('Device ID must be a valid UUID'),
      body('action')
        .isString()
        .notEmpty()
        .withMessage('Command action is required'),
      body('payload')
        .optional()
        .isObject()
        .withMessage('Payload must be an object'),
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
        // TODO: Add permission check for broadcast-box:devices:control

        // Check if DeviceCommandService is available
        if (!deviceCommandService) {
          return res.status(503).json({
            success: false,
            error: {
              message: 'Device command service not available',
            },
          });
        }

        // Validate device exists
        // Try to find device by UUID first (most common case)
        // If that fails, try by database ID (for backward compatibility)
        let device = await deviceManager.getDeviceByUuid(req.params.id);

        // If not found by UUID, try by database ID
        if (!device) {
          device = await deviceManager.getDevice(req.params.id);
        }

        if (!device) {
          return res.status(404).json({
            success: false,
            error: {
              message: 'Device not found',
            },
          });
        }

        // Use device UUID for command execution (DeviceCommandService expects UUID)
        const deviceUuid = device.deviceUuid;

        // Validate action is one of allowed actions
        const allowedActions = [
          'switch_source',
          'set_pip',
          'configure_pip',
          'update_config',
          'get_status',
          'list_sources',
          'start_session',
          'stop_session',
        ];
        if (!allowedActions.includes(req.body.action)) {
          return res.status(400).json({
            success: false,
            error: {
              message: `Invalid action: ${req.body.action}. Allowed actions: ${allowedActions.join(', ')}`,
            },
          });
        }

        // Extract user info for command source
        const userId = req.user?.id;
        if (!userId) {
          return res.status(401).json({
            success: false,
            error: {
              message: 'Authentication required',
            },
          });
        }

        // Execute command
        // Use device UUID for command execution (DeviceCommandService expects UUID)
        const commandResponse = await deviceCommandService.executeCommand({
          deviceId: deviceUuid, // Use device UUID, not the URL parameter
          action: req.body.action,
          payload: req.body.payload || {},
          source: {
            type: 'user',
            userId,
            metadata: {
              ip: getClientIp(req),
              userAgent: req.headers['user-agent'],
            },
          },
        });

        // Return response
        if (commandResponse.success) {
          res.json({
            success: true,
            commandId: commandResponse.commandId,
            ack: commandResponse.ack,
            timestamp: commandResponse.timestamp.toISOString(),
          });
        } else {
          res.status(500).json({
            success: false,
            error: {
              message: commandResponse.error || 'Command execution failed',
            },
            commandId: commandResponse.commandId,
            timestamp: commandResponse.timestamp.toISOString(),
          });
        }
      } catch (error) {
        logger.error('Error executing device command', {
          operation: 'broadcast-box:api:devices:command',
          deviceId: req.params.id,
          action: req.body?.action,
          error: error instanceof Error ? error.message : String(error),
        });
        res.status(500).json({
          success: false,
          error: {
            message: 'Failed to execute device command',
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

        // Try to find device by UUID first (most common case)
        // If that fails, try by database ID (for backward compatibility)
        let device = await deviceManager.getDeviceByUuid(req.params.id);

        // If not found by UUID, try by database ID
        if (!device) {
          device = await deviceManager.getDevice(req.params.id);
        }

        if (!device) {
          return res.status(404).json({
            success: false,
            error: {
              message: 'Device not found',
            },
          });
        }

        // Activate device on first health check if enrolled (safety net for HTTP-only connections)
        if (device.status === 'enrolled') {
          try {
            await deviceManager.activateDevice(device.id);
            logger.debug('Device activated on first health check', {
              operation: 'broadcast-box:api:devices:health:activated',
              deviceId: device.id,
            });
            // Refresh device data after activation
            const refreshedDevice = await deviceManager.getDevice(device.id);
            if (refreshedDevice) {
              device.status = refreshedDevice.status;
            }
          } catch (error) {
            // Log but don't fail the health check
            logger.warn('Failed to activate device on health check', {
              operation: 'broadcast-box:api:devices:health:activation-failed',
              deviceId: device.id,
              error: error instanceof Error ? error.message : String(error),
            });
          }
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
