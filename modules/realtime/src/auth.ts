/**
 * WebSocket Authentication
 *
 * Handles authentication and authorization for WebSocket connections
 */

import type { AuthService, AuthUser } from '@civicpress/core';
import type { Logger } from '@civicpress/core';
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
    logger.warn('WebSocket authentication failed: invalid token', {
      operation: 'realtime:auth',
    });
    throw new AuthenticationFailedError();
  }

  // Check if record exists
  const record = await recordManager.getRecord(recordId);
  if (!record) {
    logger.warn('WebSocket connection failed: record not found', {
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
    logger.warn('WebSocket permission denied: no view access', {
      operation: 'realtime:auth',
      userId: user.id,
      recordId,
    });
    throw new PermissionDeniedError(recordId, { userId: user.id, recordId });
  }

  logger.info('WebSocket connection authenticated', {
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
 */
export function extractToken(
  url: string,
  headers?: Record<string, string>
): string | null {
  // Try query string first
  const urlObj = new URL(url, 'http://localhost');
  const tokenFromQuery = urlObj.searchParams.get('token');
  if (tokenFromQuery) {
    return tokenFromQuery;
  }

  // Try Authorization header
  if (headers) {
    const authHeader = headers.authorization || headers.Authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }
  }

  return null;
}

/**
 * Parse room ID from WebSocket URL
 */
export function parseRoomId(
  url: string
): { roomType: string; roomId: string } | null {
  try {
    const urlObj = new URL(url, 'http://localhost');
    const pathParts = urlObj.pathname.split('/').filter(Boolean);

    // Expected format: /realtime/records/:recordId
    // or: /realtime/device/:deviceId (future)
    if (pathParts.length >= 3 && pathParts[0] === 'realtime') {
      const roomType = pathParts[1]; // 'records', 'device', etc.
      const roomId = pathParts[2];
      return { roomType, roomId };
    }

    return null;
  } catch (error) {
    return null;
  }
}
