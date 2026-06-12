/**
 * WebSocket Authentication
 *
 * Handles authentication and authorization for WebSocket connections
 */

import type {
  AuthService,
  AuthUser,
  Logger,
  RecordManager,
  DatabaseService,
} from '@civicpress/core';
import { coreWarn, coreInfo } from '@civicpress/core';
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
 * Authenticate a user WebSocket connection to a record room.
 *
 * Validates the session, confirms the record exists (published or draft), and
 * checks view/edit permission. Record-room authorization is being re-homed into
 * RecordRoomHandler.onConnect in W5; this helper is the reference implementation
 * the handler will call.
 */
export async function authenticateConnection(
  token: string,
  recordId: string,
  authService: AuthService,
  recordManager: RecordManager,
  logger: Logger,
  databaseService?: DatabaseService
): Promise<AuthenticatedConnection> {
  // Validate token
  const user = await authService.validateSession(token);
  if (!user) {
    coreWarn('WebSocket authentication failed: invalid token', {
      operation: 'realtime:auth',
    });
    throw new AuthenticationFailedError();
  }

  // Check if record exists (published records or drafts). Only `type` is read
  // downstream, and a published record and a draft row expose it differently,
  // so the lookup is narrowed to the shared shape.
  let record: { type: string } | null = await recordManager.getRecord(recordId);
  if (!record && databaseService?.getDraft) {
    // Record may be a draft that hasn't been published yet
    record = await databaseService.getDraft(recordId);
  }
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

      // Normalize singular 'record' → plural 'records' (canonical internal key)
      if (roomType === 'record') {
        roomType = 'records';
      }

      return { roomType, roomId };
    }

    return null;
  } catch {
    return null;
  }
}
