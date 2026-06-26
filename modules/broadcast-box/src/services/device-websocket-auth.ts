/**
 * Device WebSocket Authentication
 *
 * Handles authentication for device WebSocket connections.
 * This module provides the authentication functions that are used by the
 * device room handler when processing device connections.
 *
 * Extracted from realtime module to decouple broadcast-box specific logic.
 */

import type { Logger, AuthService, AuthUser } from '@civicpress/core';
import { coreWarn, coreInfo, coreDebug } from '@civicpress/core';
import type { DeviceAuthService, DeviceTokenPayload } from './device-auth.js';
import type { DeviceManager } from './device-manager.js';

/**
 * Device authentication result
 */
export interface AuthenticatedDeviceConnection {
  deviceId: string;
  deviceUuid: string;
  organizationId: string;
}

/**
 * User authentication result for device room observers
 */
export interface AuthenticatedUserObserver {
  user: AuthUser;
  permissions: {
    canView: boolean;
    canEdit: boolean;
  };
}

/**
 * Authentication error for WebSocket connections
 */
export class DeviceAuthenticationError extends Error {
  public readonly code: string;

  constructor(message: string, code: string = 'AUTH_FAILED') {
    super(message);
    this.name = 'DeviceAuthenticationError';
    this.code = code;
  }
}

/**
 * Permission error for WebSocket connections
 */
export class DevicePermissionError extends Error {
  public readonly code: string;
  public readonly context: Record<string, unknown>;

  constructor(
    resourceId: string,
    context: Record<string, unknown> = {},
    message?: string
  ) {
    super(message || `Permission denied for resource: ${resourceId}`);
    this.name = 'DevicePermissionError';
    this.code = 'PERMISSION_DENIED';
    this.context = { resourceId, ...context };
  }
}

/**
 * Validate a device bearer token and resolve the authenticated device.
 *
 * The shared core of device authentication, with no transport-specific checks:
 * validate the token (signature / expiry / `type === 'device'`), load the
 * device, and verify it is in a status that may connect or upload
 * (`active` / `enrolled`). Both the WebSocket path
 * (`authenticateDeviceConnection`, which additionally matches the URL device
 * UUID) and the HTTP upload path (`deviceAuthMiddleware`) build on this, so the
 * "what counts as an authenticated device" rule has a single source of truth.
 *
 * @param token - Device authentication token (the bearer credential)
 * @param deviceAuthService - Device authentication service
 * @param deviceManager - Device manager service
 * @param logger - Logger instance
 * @returns Authenticated device connection info
 * @throws DeviceAuthenticationError if authentication fails
 */
export async function authenticateDeviceToken(
  token: string,
  deviceAuthService: DeviceAuthService,
  deviceManager: DeviceManager,
  logger: Logger
): Promise<AuthenticatedDeviceConnection> {
  // Validate the device token (signature, expiry, type === 'device').
  const tokenPayload = await deviceAuthService.validateToken(token);
  if (!tokenPayload) {
    coreWarn('Device authentication failed: invalid token', {
      operation: 'broadcast-box:device-auth:invalid-token',
      tokenLength: token.length,
    });
    throw new DeviceAuthenticationError('Invalid device token');
  }

  // Verify the device still exists.
  const device = await deviceManager.getDeviceByUuid(tokenPayload.deviceUuid);
  if (!device) {
    coreWarn('Device authentication failed: device not found', {
      operation: 'broadcast-box:device-auth:device-not-found',
      deviceUuid: tokenPayload.deviceUuid,
    });
    throw new DeviceAuthenticationError('Device not found', 'DEVICE_NOT_FOUND');
  }

  // Only 'active' and 'enrolled' devices may connect or upload.
  if (device.status !== 'active' && device.status !== 'enrolled') {
    coreWarn('Device authentication denied: invalid device status', {
      operation: 'broadcast-box:device-auth:invalid-status',
      deviceUuid: device.deviceUuid,
      deviceId: device.id,
      status: device.status,
    });
    throw new DeviceAuthenticationError(
      `Device status '${device.status}' does not allow connections`,
      'INVALID_STATUS'
    );
  }

  return {
    deviceId: device.id,
    deviceUuid: device.deviceUuid,
    organizationId: device.organizationId,
  };
}

/**
 * Authenticate device WebSocket connection
 *
 * Validates the device token + device status (via `authenticateDeviceToken`),
 * then enforces that the device UUID in the connection URL matches the token's
 * device. This prevents using one device's token on another device's WS
 * endpoint.
 *
 * @param token - Device authentication token
 * @param deviceUuid - Device UUID from the connection URL
 * @param deviceAuthService - Device authentication service
 * @param deviceManager - Device manager service
 * @param logger - Logger instance
 * @returns Authenticated device connection info
 * @throws DeviceAuthenticationError if authentication fails
 */
export async function authenticateDeviceConnection(
  token: string,
  deviceUuid: string,
  deviceAuthService: DeviceAuthService,
  deviceManager: DeviceManager,
  logger: Logger
): Promise<AuthenticatedDeviceConnection> {
  coreDebug('Authenticating device connection', {
    operation: 'broadcast-box:ws-auth:device:start',
    deviceUuid,
    tokenLength: token.length,
    tokenPreview: token.substring(0, 30) + '...',
  });

  // Validate token + load device + status check (shared with the HTTP upload
  // path). Returns the token's device identity.
  const connection = await authenticateDeviceToken(
    token,
    deviceAuthService,
    deviceManager,
    logger
  );

  // Critical security check: the device UUID in the URL must match the token's
  // device. This prevents token reuse for different devices.
  if (connection.deviceUuid !== deviceUuid) {
    coreWarn('Device WebSocket authentication failed: UUID mismatch', {
      operation: 'broadcast-box:ws-auth:device:uuid-mismatch',
      tokenDeviceUuid: connection.deviceUuid,
      urlDeviceUuid: deviceUuid,
    });
    throw new DeviceAuthenticationError('Device UUID mismatch', 'UUID_MISMATCH');
  }

  coreInfo('Device WebSocket connection authenticated', {
    operation: 'broadcast-box:ws-auth:device:success',
    deviceId: connection.deviceId,
    deviceUuid: connection.deviceUuid,
    organizationId: connection.organizationId,
  });

  return connection;
}

/**
 * Authenticate user observing device room
 *
 * Allows users to connect to device rooms as observers (read-only).
 * Checks user permissions for broadcast-box:devices:view.
 *
 * @param token - User authentication token (session token)
 * @param deviceUuid - Device UUID from the connection URL
 * @param authService - Auth service for user validation
 * @param deviceManager - Device manager service
 * @param logger - Logger instance
 * @returns Authenticated user connection info
 * @throws DeviceAuthenticationError if authentication fails
 * @throws DevicePermissionError if permission denied
 */
export async function authenticateUserObservingDevice(
  token: string,
  deviceUuid: string,
  authService: AuthService,
  deviceManager: DeviceManager,
  logger: Logger
): Promise<AuthenticatedUserObserver> {
  // Validate user token
  const user = await authService.validateSession(token);
  if (!user) {
    coreWarn('User device observation failed: invalid token', {
      operation: 'broadcast-box:ws-auth:user-device:invalid-token',
    });
    throw new DeviceAuthenticationError('Invalid user session');
  }

  // Verify device exists
  const device = await deviceManager.getDeviceByUuid(deviceUuid);
  if (!device) {
    coreWarn('User device observation failed: device not found', {
      operation: 'broadcast-box:ws-auth:user-device:device-not-found',
      userId: user.id,
      deviceUuid,
    });
    throw new DevicePermissionError(deviceUuid, {
      userId: user.id,
      reason: 'device_not_found',
    });
  }

  // Check user permissions (users need broadcast-box:devices:view permission)
  const canView = await authService.userCan(
    user,
    'broadcast-box:devices:view',
    {
      action: 'view',
    }
  );

  if (!canView) {
    coreWarn('User device observation denied: no view access', {
      operation: 'broadcast-box:ws-auth:user-device:permission-denied',
      userId: user.id,
      deviceUuid,
    });
    throw new DevicePermissionError(deviceUuid, {
      userId: user.id,
      deviceUuid,
    });
  }

  coreInfo('User device observation authenticated', {
    operation: 'broadcast-box:ws-auth:user-device:success',
    userId: user.id,
    username: user.username,
    deviceUuid,
  });

  return {
    user,
    permissions: {
      canView: true,
      canEdit: false, // Users observing device rooms are read-only
    },
  };
}
