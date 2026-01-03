/**
 * Broadcast Box API Routes
 *
 * Exports API router registration function
 */

import type { Logger } from '@civicpress/core';
import type { DeviceManager } from '../services/device-manager.js';
import type { DeviceAuthService } from '../services/device-auth.js';
import type { DeviceConnectionTracker } from '../services/device-connection-tracker.js';
import type { DeviceCommandService } from '../services/device-command-service.js';
import type { SessionController } from '../services/session-controller.js';
import type { UploadProcessor } from '../services/upload-processor.js';
import { createDevicesRouter } from './devices.js';
import { createSessionsRouter } from './sessions.js';
import { createUploadsRouter } from './uploads.js';
import { DeviceRegistrationRateLimiter } from '../middleware/rate-limiter.js';

/**
 * Register broadcast-box API routes
 *
 * This function should be called from the API module to register
 * broadcast-box routes. The auth middleware should be applied by the
 * calling code (API module).
 *
 * @param app - Express application
 * @param deviceManager - DeviceManager service instance
 * @param deviceAuth - DeviceAuthService instance
 * @param logger - Logger instance
 * @param authMiddleware - Optional auth middleware function
 */
export async function registerBroadcastBoxRoutes(
  app: any,
  deviceManager: DeviceManager,
  deviceAuth: DeviceAuthService,
  logger: Logger,
  authMiddleware?: any,
  connectionTracker?: DeviceConnectionTracker,
  deviceCommandService?: DeviceCommandService,
  sessionController?: SessionController,
  uploadProcessor?: UploadProcessor
): Promise<void> {
  // Create rate limiter for device registration
  const rateLimiter = new DeviceRegistrationRateLimiter(logger);

  const devicesRouter = createDevicesRouter(
    deviceManager,
    deviceAuth,
    logger,
    connectionTracker,
    rateLimiter,
    deviceCommandService
  );

  // Device registration endpoint (POST /) should be public - device uses enrollment code for auth
  // We need to register it separately before applying auth middleware
  if (authMiddleware) {
    // Create a separate public router for device registration
    // This allows devices to register themselves without a token
    const express = await import('express');
    const publicRouter = express.default.Router();

    // Manually create the registration route handler (copy from devicesRouter)
    // We'll import the validation and handler logic
    const { body, validationResult } = await import('express-validator');

    // Helper to get client IP
    const getClientIp = (req: any): string => {
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
    };

    // Apply rate limiting ONLY to the POST registration endpoint
    publicRouter.post(
      '/',
      rateLimiter.middleware(), // Rate limiter applied only to this route
      [
        body('deviceUuid')
          .isUUID()
          .withMessage('Device UUID must be a valid UUID'),
        body('enrollmentCode')
          .isString()
          .notEmpty()
          .withMessage('Enrollment code is required'),
        body('name')
          .isString()
          .notEmpty()
          .withMessage('Device name is required'),
        body('roomLocation').optional().isString(),
        body('capabilities').optional().isObject(),
        body('config').optional().isObject(),
      ],
      async (req: any, res: any) => {
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

          const registrationIp = getClientIp(req);
          const createRequest = {
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
        } catch (error: any) {
          logger.error('Error registering device', {
            operation: 'broadcast-box:api:devices:register',
            error: error instanceof Error ? error.message : String(error),
            ip: getClientIp(req),
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

    // Register public registration endpoint (no auth required)
    app.use('/api/v1/broadcast-box/devices', publicRouter);

    // Apply auth middleware to all other device routes (GET, PATCH, DELETE, etc.)
    app.use('/api/v1/broadcast-box/devices', authMiddleware, devicesRouter);
  } else {
    // No auth middleware - register all routes as public
    app.use('/api/v1/broadcast-box/devices', devicesRouter);
  }

  // Register sessions router if sessionController is provided
  if (sessionController) {
    const sessionsRouter = createSessionsRouter(sessionController, logger);

    if (authMiddleware) {
      app.use('/api/v1/broadcast-box/sessions', authMiddleware, sessionsRouter);
    } else {
      app.use('/api/v1/broadcast-box/sessions', sessionsRouter);
    }
  }

  // Register uploads router if uploadProcessor is provided
  if (uploadProcessor) {
    const uploadsRouter = createUploadsRouter(uploadProcessor, logger);

    if (authMiddleware) {
      app.use('/api/v1/broadcast-box/uploads', authMiddleware, uploadsRouter);
    } else {
      app.use('/api/v1/broadcast-box/uploads', uploadsRouter);
    }
  }
}
