/**
 * Unified Error Handling System
 *
 * Provides a type-safe, hierarchical error system for CivicPress with:
 * - Automatic correlation IDs for tracing
 * - Consistent error codes and status codes
 * - Rich context metadata
 * - Integration with centralized output functions
 */

/**
 * Generate a unique correlation ID for error tracing
 */
function generateCorrelationId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 9);
  return `err_${timestamp}_${random}`;
}

/**
 * Base error class for all CivicPress errors
 *
 * All errors in the system should extend this class to ensure:
 * - Consistent error structure
 * - Automatic correlation ID generation
 * - Type-safe error handling
 * - Integration with centralized output
 */
export abstract class CivicPressError extends Error {
  abstract code: string;
  abstract statusCode: number;
  context?: Record<string, any>;
  readonly correlationId: string;

  constructor(message: string, context?: Record<string, any>) {
    super(message);
    this.name = this.constructor.name;
    this.context = context;
    this.correlationId = generateCorrelationId();

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Serialize error to JSON format
   */
  toJSON(): {
    name: string;
    code: string;
    message: string;
    statusCode: number;
    context?: Record<string, any>;
    correlationId: string;
  } {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      ...(this.context && { context: this.context }),
      correlationId: this.correlationId,
    };
  }

  /**
   * Get error details formatted for centralized output functions
   *
   * Returns format compatible with coreError(), cliError(), and handleApiError()
   */
  getOutputDetails(): {
    message: string;
    code: string;
    details: any;
    context: Record<string, any>;
  } {
    return {
      message: this.message,
      code: this.code,
      details: this.context?.details || this.context,
      context: {
        ...this.context,
        correlationId: this.correlationId,
        errorType: this.name,
        statusCode: this.statusCode,
      },
    };
  }
}

/**
 * Validation Error (400)
 * Used when input validation fails
 */
export class ValidationError extends CivicPressError {
  code = 'VALIDATION_ERROR';
  statusCode = 400;

  constructor(message: string, details?: any) {
    super(message, { details });
  }
}

/**
 * Not Found Error (404)
 * Used when a requested resource is not found
 */
export class NotFoundError extends CivicPressError {
  code = 'NOT_FOUND';
  statusCode = 404;

  constructor(message: string, resourceId?: string) {
    super(message, resourceId ? { resourceId } : undefined);
  }
}

/**
 * Unauthorized Error (401)
 * Used when authentication is required but not provided
 */
export class UnauthorizedError extends CivicPressError {
  code = 'UNAUTHORIZED';
  statusCode = 401;

  constructor(message: string = 'Authentication required') {
    super(message);
  }
}

/**
 * Forbidden Error (403)
 * Used when user is authenticated but lacks required permissions
 */
export class ForbiddenError extends CivicPressError {
  code = 'FORBIDDEN';
  statusCode = 403;

  constructor(message: string = 'Insufficient permissions', resource?: string) {
    super(message, resource ? { resource } : undefined);
  }
}

/**
 * Conflict Error (409)
 * Used when a resource conflict occurs (e.g., already exists)
 */
export class ConflictError extends CivicPressError {
  code = 'CONFLICT';
  statusCode = 409;

  constructor(message: string, resourceId?: string) {
    super(message, resourceId ? { resourceId } : undefined);
  }
}

/**
 * Database Error (500)
 * Used when a database operation fails
 */
export class DatabaseError extends CivicPressError {
  code = 'DATABASE_ERROR';
  statusCode = 500;

  constructor(message: string, operation?: string, details?: any) {
    super(message, {
      operation,
      ...(details && { details }),
    });
  }
}

/**
 * File System Error (500)
 * Used when a file system operation fails
 */
export class FileSystemError extends CivicPressError {
  code = 'FILE_SYSTEM_ERROR';
  statusCode = 500;

  constructor(message: string, path?: string, operation?: string) {
    super(message, {
      ...(path && { path }),
      ...(operation && { operation }),
    });
  }
}

/**
 * Internal Error (500)
 * Used for unexpected internal errors
 */
export class InternalError extends CivicPressError {
  code = 'INTERNAL_ERROR';
  statusCode = 500;

  constructor(message: string, context?: Record<string, any>) {
    super(message, context);
  }
}
