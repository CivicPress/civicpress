/**
 * Device Authentication Middleware (HTTP)
 *
 * Express middleware that authenticates Broadcast Box devices on the HTTP upload
 * routes using their device bearer token — the same credential the device uses
 * for its WebSocket connection. It mirrors the WS path (validate token → load
 * device → check status) via the shared `authenticateDeviceToken` helper, so the
 * two transports share one definition of "an authenticated device".
 *
 * Devices send `Authorization: Bearer <deviceToken>` (header-only, per
 * BB-HW-010). On success the authenticated device identity is attached to
 * `req.device`; on any failure the request is rejected with 401 (or 500 for an
 * unexpected error) using the module's standard error envelope.
 */

import type { Request, Response, NextFunction } from 'express';
import type { Logger } from '@civicpress/core';
import type { DeviceAuthService } from '../services/device-auth.js';
import type { DeviceManager } from '../services/device-manager.js';
import {
  authenticateDeviceToken,
  DeviceAuthenticationError,
  type AuthenticatedDeviceConnection,
} from '../services/device-websocket-auth.js';

/**
 * An Express request carrying the authenticated device (set by
 * `deviceAuthMiddleware`). Distinct from the user-auth `req.user`: the upload
 * routes are a device surface, authenticated by device token rather than by a
 * user session.
 */
export interface DeviceAuthenticatedRequest extends Request {
  device?: AuthenticatedDeviceConnection;
}

function unauthorized(res: Response, message: string, code: string): void {
  res.status(401).json({
    success: false,
    error: { message, code },
  });
}

/**
 * Build the device-auth middleware from the device services.
 *
 * @param deviceAuthService - validates the device bearer token
 * @param deviceManager - resolves + status-checks the device
 * @param logger - logger for unexpected failures
 */
export function deviceAuthMiddleware(
  deviceAuthService: DeviceAuthService,
  deviceManager: DeviceManager,
  logger: Logger
) {
  return async (
    req: DeviceAuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      unauthorized(res, 'Device authentication required', 'UNAUTHENTICATED');
      return;
    }

    const [scheme, token] = authHeader.split(' ');
    if (!scheme || scheme.toLowerCase() !== 'bearer' || !token) {
      unauthorized(
        res,
        'Use Bearer device-token authentication',
        'INVALID_AUTH_SCHEME'
      );
      return;
    }

    try {
      const device = await authenticateDeviceToken(
        token,
        deviceAuthService,
        deviceManager,
        logger
      );
      req.device = device;
      next();
    } catch (error) {
      // Expected auth failures (bad token / unknown device / wrong status) →
      // 401, surfacing the specific code from the shared helper.
      if (error instanceof DeviceAuthenticationError) {
        unauthorized(res, error.message, error.code);
        return;
      }
      // Anything else is unexpected — log and fail closed.
      logger.error('Device auth middleware error', {
        operation: 'broadcast-box:device-auth:middleware-error',
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        success: false,
        error: { message: 'Authentication error', code: 'AUTH_ERROR' },
      });
    }
  };
}
