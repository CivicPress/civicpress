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
import { deviceAuthMiddleware } from '../middleware/device-auth.js';
import { isValidEd25519PublicKeyPem } from '../services/manifest-signature.js';
import { requirePermission } from '../middleware/require-permission.js';

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

  // Admin endpoint to reset rate limits (for development/testing)
  // In production, this should require proper admin authentication
  const resetRateLimitsHandler = (req: any, res: any) => {
    try {
      rateLimiter.clearAll();
      logger.info('Rate limits cleared via admin endpoint', {
        operation: 'broadcast-box:admin:reset-rate-limits',
        userId: req.user?.id,
        ip: req.ip,
      });
      res.json({
        success: true,
        message: 'All rate limits have been cleared',
      });
    } catch (error) {
      logger.error('Failed to clear rate limits', {
        operation: 'broadcast-box:admin:reset-rate-limits-error',
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to clear rate limits',
          code: 'INTERNAL_ERROR',
        },
      });
    }
  };

  // Fail-closed user auth for operator-facing routes: if no auth middleware was
  // provided, mount a deny-all guard rather than leaving routes public.
  const auth: any =
    authMiddleware ??
    ((_req: any, res: any) =>
      res.status(503).json({
        success: false,
        error: {
          message: 'Broadcast Box authentication is not configured',
          code: 'AUTH_NOT_CONFIGURED',
        },
      }));
  if (!authMiddleware) {
    logger.warn(
      'Broadcast Box auth middleware not provided - operator routes deny all (fail-closed)',
      { operation: 'broadcast-box:auth:not-configured' }
    );
  }

  // Admin endpoint (reset rate limits) - authenticated + permissioned.
  app.post(
    '/api/v1/broadcast-box/admin/reset-rate-limits',
    auth,
    requirePermission('broadcast-box:admin', logger),
    resetRateLimitsHandler
  );

  // Device registration (POST /) is a DEVICE surface: the device presents its
  // one-time enrollment code (not a user token), like uploads. Mounted publicly
  // + rate-limited, before the authenticated operator device routes below.
  {
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
        // FA-BB-001: optional Ed25519 manifest-signing key (PEM/SPKI).
        body('publicKey').optional().isString().isLength({ max: 4096 }),
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

          // A malformed key must fail HERE, not silently disable signing.
          if (
            req.body.publicKey &&
            !isValidEd25519PublicKeyPem(req.body.publicKey)
          ) {
            return res.status(400).json({
              success: false,
              error: {
                message:
                  'publicKey must be a PEM (SPKI) Ed25519 public key',
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
            publicKey: req.body.publicKey,
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
              statusCode = 422;
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

    // Register the public registration endpoint (enrollment-code auth).
    app.use('/api/v1/broadcast-box/devices', publicRouter);
  }

  // All other device routes (list/view/enroll/update/delete/command/health) are
  // operator routes: authenticated + per-route permissions (enforced in the router).
  app.use('/api/v1/broadcast-box/devices', auth, devicesRouter);

  // Sessions router - operator routes: authenticated + per-route permissions.
  if (sessionController) {
    const sessionsRouter = createSessionsRouter(sessionController, logger);
    app.use('/api/v1/broadcast-box/sessions', auth, sessionsRouter);
  }

  // Register uploads router if uploadProcessor is provided. Uploads are a
  // device surface (the appliance pushes its own recording), so they
  // authenticate with the device's bearer token via deviceAuthMiddleware — NOT
  // the user authMiddleware used by the operator-facing device/session routes.
  // The middleware is always applied: an unauthenticated upload is never
  // allowed (the device + session ownership is then enforced per-route).
  if (uploadProcessor) {
    const uploadsRouter = createUploadsRouter(uploadProcessor, logger);
    app.use(
      '/api/v1/broadcast-box/uploads',
      deviceAuthMiddleware(deviceAuth, deviceManager, logger),
      uploadsRouter
    );
  }
}
