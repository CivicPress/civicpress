/**
 * WebSocket Authentication
 *
 * Handles authentication and authorization for WebSocket connections
 */

import type { AuthService, AuthUser } from '@civicpress/core';
import type { Logger } from '@civicpress/core';
import {
  coreWarn,
  coreInfo,
  coreDebug,
  isCivicPressError,
} from '@civicpress/core';
import {
  AuthenticationFailedError,
  PermissionDeniedError,
} from './errors/realtime-errors.js';

export interface AuthenticatedConnection {
  user: AuthUser;
  permissions: {
    canView: boolean;
    canEdit: boolean;
  };
}

/**
 * Device authentication result
 * Used for device WebSocket connections (Broadcast Box, etc.)
 */
export interface AuthenticatedDeviceConnection {
  deviceId: string;
  deviceUuid: string;
  organizationId: string;
}

/**
 * Authenticate WebSocket connection
 */
export async function authenticateConnection(
  token: string,
  recordId: string,
  authService: AuthService,
  recordManager: any, // RecordManager - avoiding circular dependency
  logger: Logger
): Promise<AuthenticatedConnection> {
  // Validate token
  const user = await authService.validateSession(token);
  if (!user) {
    coreWarn('WebSocket authentication failed: invalid token', {
      operation: 'realtime:auth',
    });
    throw new AuthenticationFailedError();
  }

  // Check if record exists
  const record = await recordManager.getRecord(recordId);
  if (!record) {
    coreWarn('WebSocket connection failed: record not found', {
      operation: 'realtime:auth',
      userId: user.id,
      recordId,
    });
    throw new PermissionDeniedError(recordId, {
      userId: user.id,
      recordId,
      reason: 'record_not_found',
    });
  }

  // Check user permissions (use public userCan method instead of private roleManager)
  const canView = await authService.userCan(user, 'records:view', {
    recordType: record.type,
    action: 'view',
  });

  const canEdit = await authService.userCan(user, 'records:edit', {
    recordType: record.type,
    action: 'edit',
  });

  if (!canView) {
    coreWarn('WebSocket permission denied: no view access', {
      operation: 'realtime:auth',
      userId: user.id,
      recordId,
    });
    throw new PermissionDeniedError(recordId, { userId: user.id, recordId });
  }

  coreInfo('WebSocket connection authenticated', {
    operation: 'realtime:auth',
    userId: user.id,
    username: user.username,
    recordId,
    canEdit,
  });

  return {
    user,
    permissions: {
      canView,
      canEdit,
    },
  };
}

/**
 * Extract token from WebSocket connection
 *
 * Priority order (most secure first):
 * 1. Authorization header (Bearer token) - for Node.js clients
 * 2. Subprotocol header (Sec-WebSocket-Protocol) - for browser clients
 * 3. Query string - deprecated, kept for backward compatibility
 *
 * @param url - WebSocket URL
 * @param headers - Request headers
 * @param protocols - WebSocket subprotocols (from Sec-WebSocket-Protocol header)
 * @returns Token string or null if not found
 */
export function extractToken(
  url: string,
  headers?: Record<string, string>,
  protocols?: string[]
): { token: string | null; method: 'header' | 'subprotocol' | 'query' | null } {
  // 1. Try Authorization header first (most secure, for Node.js clients)
  if (headers) {
    const authHeader = headers.authorization || headers.Authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return { token: authHeader.substring(7), method: 'header' };
    }
  }

  // 2. Try subprotocol (browser-compatible, secure)
  // Format: "auth.<token>" or just the token if it's the only protocol
  if (protocols && protocols.length > 0) {
    for (const protocol of protocols) {
      if (protocol.startsWith('auth.')) {
        return { token: protocol.substring(5), method: 'subprotocol' };
      }
      // If it's a long string that looks like a token, use it
      // Tokens are typically long base64-like strings
      if (
        protocol.length > 20 &&
        !protocol.includes('/') &&
        !protocol.includes(' ')
      ) {
        return { token: protocol, method: 'subprotocol' };
      }
    }
  }

  // 3. Try query string (deprecated, less secure - kept for backward compatibility)
  const urlObj = new URL(url, 'http://localhost');
  const tokenFromQuery = urlObj.searchParams.get('token');
  if (tokenFromQuery) {
    return { token: tokenFromQuery, method: 'query' };
  }

  return { token: null, method: null };
}

/**
 * Authenticate device WebSocket connection
 *
 * Validates device tokens and verifies device exists and is in valid status.
 * This is used for Broadcast Box device connections.
 */
export async function authenticateDeviceConnection(
  token: string,
  deviceUuid: string,
  deviceAuthService: any, // DeviceAuthService - avoiding circular dependency
  deviceManager: any, // DeviceManager - avoiding circular dependency
  logger: Logger
): Promise<AuthenticatedDeviceConnection> {
  coreDebug('Authenticating device connection', {
    operation: 'realtime:auth:device:start',
    deviceUuid,
    tokenLength: token.length,
    tokenPreview: token.substring(0, 30) + '...',
  });

  // Validate device token
  const tokenPayload = await deviceAuthService.validateToken(token);
  if (!tokenPayload) {
    coreWarn('Device WebSocket authentication failed: invalid token', {
      operation: 'realtime:auth:device:invalid-token',
      deviceUuid,
      tokenLength: token.length,
    });
    throw new AuthenticationFailedError();
  }

  coreDebug('Device token validated', {
    operation: 'realtime:auth:device:token-validated',
    deviceUuid,
    tokenDeviceUuid: tokenPayload.deviceUuid,
    tokenDeviceId: tokenPayload.deviceId,
  });

  // Critical security check: Verify device UUID in URL matches token payload
  // This prevents token reuse for different devices
  if (tokenPayload.deviceUuid !== deviceUuid) {
    coreWarn('Device WebSocket authentication failed: UUID mismatch', {
      operation: 'realtime:auth:device:uuid-mismatch',
      tokenDeviceUuid: tokenPayload.deviceUuid,
      urlDeviceUuid: deviceUuid,
    });
    throw new AuthenticationFailedError();
  }

  // Verify device exists in database
  const device = await deviceManager.getDeviceByUuid(deviceUuid);
  if (!device) {
    coreWarn('Device WebSocket connection failed: device not found', {
      operation: 'realtime:auth:device:not-found',
      deviceUuid,
    });
    throw new AuthenticationFailedError();
  }

  coreDebug('Device found in database', {
    operation: 'realtime:auth:device:device-found',
    deviceUuid,
    deviceId: device.id,
    deviceStatus: device.status,
  });

  // Verify device is in a valid status for connections
  // Only 'active' and 'enrolled' devices can connect
  if (device.status !== 'active' && device.status !== 'enrolled') {
    coreWarn('Device WebSocket connection denied: invalid device status', {
      operation: 'realtime:auth:device',
      deviceUuid,
      deviceId: device.id,
      status: device.status,
    });
    throw new AuthenticationFailedError();
  }

  coreInfo('Device WebSocket connection authenticated', {
    operation: 'realtime:auth:device',
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
 */
export async function authenticateUserObservingDevice(
  token: string,
  deviceUuid: string,
  authService: AuthService,
  deviceManager: any, // DeviceManager - avoiding circular dependency
  logger: Logger
): Promise<AuthenticatedConnection> {
  // Validate user token
  const user = await authService.validateSession(token);
  if (!user) {
    coreWarn('User device observation failed: invalid token', {
      operation: 'realtime:auth:user-device',
    });
    throw new AuthenticationFailedError();
  }

  // Verify device exists
  const device = await deviceManager.getDeviceByUuid(deviceUuid);
  if (!device) {
    coreWarn('User device observation failed: device not found', {
      operation: 'realtime:auth:user-device',
      userId: user.id,
      deviceUuid,
    });
    throw new PermissionDeniedError(deviceUuid, {
      userId: user.id,
      deviceUuid,
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
      operation: 'realtime:auth:user-device',
      userId: user.id,
      deviceUuid,
    });
    throw new PermissionDeniedError(deviceUuid, {
      userId: user.id,
      deviceUuid,
    });
  }

  coreInfo('User device observation authenticated', {
    operation: 'realtime:auth:user-device',
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

/**
 * Parse room ID from WebSocket URL
 *
 * Normalizes room types:
 * - '/realtime/devices/:deviceId' -> roomType: 'device', roomId: deviceId
 * - '/realtime/records/:recordId' -> roomType: 'records', roomId: recordId
 */
export function parseRoomId(
  url: string
): { roomType: string; roomId: string } | null {
  try {
    const urlObj = new URL(url, 'http://localhost');
    const pathParts = urlObj.pathname.split('/').filter(Boolean);

    // Expected format: /realtime/records/:recordId
    // or: /realtime/devices/:deviceId (normalized to 'device' room type)
    if (pathParts.length >= 3 && pathParts[0] === 'realtime') {
      let roomType = pathParts[1]; // 'records', 'devices', etc.
      const roomId = pathParts[2];

      // Normalize 'devices' to 'device' for room type consistency
      if (roomType === 'devices') {
        roomType = 'device';
      }

      return { roomType, roomId };
    }

    return null;
  } catch (error) {
    return null;
  }
}
