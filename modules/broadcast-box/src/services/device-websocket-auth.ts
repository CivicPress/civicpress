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
 * Authenticate device WebSocket connection
 *
 * Validates device tokens and verifies device exists and is in valid status.
 * This is used for Broadcast Box device connections.
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

  // Validate device token
  const tokenPayload = await deviceAuthService.validateToken(token);
  if (!tokenPayload) {
    coreWarn('Device WebSocket authentication failed: invalid token', {
      operation: 'broadcast-box:ws-auth:device:invalid-token',
      deviceUuid,
      tokenLength: token.length,
    });
    throw new DeviceAuthenticationError('Invalid device token');
  }

  coreDebug('Device token validated', {
    operation: 'broadcast-box:ws-auth:device:token-validated',
    deviceUuid,
    tokenDeviceUuid: tokenPayload.deviceUuid,
    tokenDeviceId: tokenPayload.deviceId,
  });

  // Critical security check: Verify device UUID in URL matches token payload
  // This prevents token reuse for different devices
  if (tokenPayload.deviceUuid !== deviceUuid) {
    coreWarn('Device WebSocket authentication failed: UUID mismatch', {
      operation: 'broadcast-box:ws-auth:device:uuid-mismatch',
      tokenDeviceUuid: tokenPayload.deviceUuid,
      urlDeviceUuid: deviceUuid,
    });
    throw new DeviceAuthenticationError(
      'Device UUID mismatch',
      'UUID_MISMATCH'
    );
  }

  // Verify device exists in database
  const device = await deviceManager.getDeviceByUuid(deviceUuid);
  if (!device) {
    coreWarn('Device WebSocket connection failed: device not found', {
      operation: 'broadcast-box:ws-auth:device:not-found',
      deviceUuid,
    });
    throw new DeviceAuthenticationError('Device not found', 'DEVICE_NOT_FOUND');
  }

  coreDebug('Device found in database', {
    operation: 'broadcast-box:ws-auth:device:device-found',
    deviceUuid,
    deviceId: device.id,
    deviceStatus: device.status,
  });

  // Verify device is in a valid status for connections
  // Only 'active' and 'enrolled' devices can connect
  if (device.status !== 'active' && device.status !== 'enrolled') {
    coreWarn('Device WebSocket connection denied: invalid device status', {
      operation: 'broadcast-box:ws-auth:device:invalid-status',
      deviceUuid,
      deviceId: device.id,
      status: device.status,
    });
    throw new DeviceAuthenticationError(
      `Device status '${device.status}' does not allow connections`,
      'INVALID_STATUS'
    );
  }

  coreInfo('Device WebSocket connection authenticated', {
    operation: 'broadcast-box:ws-auth:device:success',
    deviceId: device.id,
    deviceUuid: device.deviceUuid,
    organizationId: device.organizationId,
    status: device.status,
  });

  return {
    deviceId: device.id,
    deviceUuid: device.deviceUuid,
    organizationId: device.organizationId,
  };
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
