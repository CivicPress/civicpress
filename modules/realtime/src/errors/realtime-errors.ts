/**
 * Realtime Module Error Hierarchy
 *
 * Domain-specific errors for the realtime module, extending CivicPressError
 */

import {
  CivicPressError,
  NotFoundError,
  ValidationError,
  UnauthorizedError,
} from '@civicpress/core';

export class RealtimeError extends CivicPressError {
  code = 'REALTIME_ERROR';
  statusCode = 500;

  constructor(message: string, context?: Record<string, any>) {
    super(message, context);
  }
}

export class RoomNotFoundError extends NotFoundError {
  code = 'ROOM_NOT_FOUND';

  constructor(roomId: string, context?: Record<string, any>) {
    super(`Room '${roomId}' not found`, roomId);
    // Store additional context in the error's context property
    if (context) {
      this.context = { roomId, ...context };
    } else {
      this.context = { roomId };
    }
  }
}

export class ConnectionLimitExceededError extends ValidationError {
  code = 'CONNECTION_LIMIT_EXCEEDED';
  statusCode = 429;

  constructor(limit: number, context?: Record<string, any>) {
    super(`Connection limit exceeded: ${limit}`, { limit, ...context });
  }
}

export class InvalidYjsUpdateError extends ValidationError {
  code = 'INVALID_YJS_UPDATE';

  constructor(message: string, context?: Record<string, any>) {
    super(`Invalid yjs update: ${message}`, context);
  }
}

export class AuthenticationFailedError extends UnauthorizedError {
  code = 'AUTH_FAILED';

  constructor(context?: Record<string, any>) {
    super('Authentication failed');
    if (context) {
      this.context = context;
    }
  }
}

export class PermissionDeniedError extends UnauthorizedError {
  code = 'PERMISSION_DENIED';

  constructor(resource: string, context?: Record<string, any>) {
    super(`Permission denied for resource: ${resource}`);
    this.context = { resource, ...context };
  }
}
