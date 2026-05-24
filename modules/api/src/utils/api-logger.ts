import { Request, Response } from 'express';
import {
  Logger,
  CivicPressError,
  isCivicPressError,
  getErrorCode,
  getStatusCode,
  getCorrelationId,
} from '@civicpress/core';
import { HttpError } from './http-error.js';

export interface LogContext {
  requestId?: string;
  userId?: string;
  userRole?: string;
  method?: string;
  path?: string;
  [key: string]: unknown;
}

export interface SuccessResponse<T = unknown> {
  success: true;
  data: T;
  message?: string;
  meta?: {
    total?: number;
    page?: number;
    limit?: number;
    [key: string]: unknown;
  };
}

export interface ErrorResponse {
  success: false;
  error: {
    message: string;
    code?: string;
    details?: unknown;
  };
}

export class ApiLogger {
  private static instance: ApiLogger;
  private logger: Logger;

  private constructor() {
    this.logger = new Logger();
  }

  static getInstance(): ApiLogger {
    if (!ApiLogger.instance) {
      ApiLogger.instance = new ApiLogger();
    }
    return ApiLogger.instance;
  }

  // Log API request start
  logRequest(req: Request, context: LogContext = {}): void {
    const requestContext = {
      method: req.method,
      path: req.path,
      ip: req.ip || req.connection.remoteAddress || 'unknown',
      userAgent: req.get('User-Agent') || 'unknown',
      userId: req.user?.id,
      userRole: req.user?.role,
      requestId: req.requestId,
      ...context,
    };

    this.logger.info('API Request', requestContext);
  }

  // Log API response
  logResponse(req: Request, res: Response, context: LogContext = {}): void {
    const responseContext = {
      statusCode: res.statusCode,
      requestId: req.requestId,
      method: req.method,
      path: req.path,
      ...context,
    };

    this.logger.info('API Response', responseContext);
  }

  // Log successful operation
  logSuccess(operation: string, req: Request, context: LogContext = {}): void {
    const successContext = {
      operation,
      requestId: req.requestId,
      userId: req.user?.id,
      userRole: req.user?.role,
      ...context,
    };

    this.logger.info(`${operation} completed successfully`, successContext);
  }

  // Log warning
  logWarning(message: string, req: Request, context: LogContext = {}): void {
    const warningContext = {
      message,
      requestId: req.requestId,
      userId: req.user?.id,
      userRole: req.user?.role,
      ...context,
    };

    this.logger.warn(message, warningContext);
  }

  // Log error with full context
  logError(
    operation: string,
    error: unknown,
    req: Request,
    context: LogContext = {}
  ): void {
    // Extract error details - prioritize CivicPressError
    let errorName: string;
    let errorMessage: string;
    let errorCode: string | undefined;
    let correlationId: string | undefined;

    if (isCivicPressError(error)) {
      errorName = error.name;
      errorMessage = error.message;
      errorCode = error.code;
      correlationId = error.correlationId;
    } else if (error instanceof Error) {
      errorName = error.name || 'UnknownError';
      errorMessage = error.message || 'Unknown error';
      errorCode = (error as Error & { code?: string }).code;
    } else {
      errorName = 'UnknownError';
      errorMessage = typeof error === 'string' ? error : 'Unknown error';
      errorCode = undefined;
    }

    const errorContext = {
      operation,
      error: {
        name: errorName,
        message: errorMessage,
        code: errorCode,
        stack: error instanceof Error ? error.stack : undefined,
        ...(correlationId && { correlationId }),
      },
      requestId: req.requestId,
      userId: req.user?.id,
      userRole: req.user?.role,
      method: req.method,
      path: req.path,
      ...context,
    };

    this.logger.error(`${operation} failed`, errorContext);
  }

  // Log validation errors
  logValidationError(
    operation: string,
    errors: unknown[],
    req: Request,
    context: LogContext = {}
  ): void {
    const validationContext = {
      operation,
      validationErrors: errors,
      requestId: req.requestId,
      userId: req.user?.id,
      userRole: req.user?.role,
      ...context,
    };

    this.logger.warn(`${operation} validation failed`, validationContext);
  }

  // Log database operations
  logDatabaseOperation(
    operation: string,
    req: Request,
    context: LogContext = {}
  ): void {
    const dbContext = {
      operation,
      requestId: req.requestId,
      userId: req.user?.id,
      userRole: req.user?.role,
      ...context,
    };

    this.logger.info(`Database operation: ${operation}`, dbContext);
  }

  // Log authentication/authorization events
  logAuthEvent(
    event: string,
    req: Request,
    success: boolean,
    context: LogContext = {}
  ): void {
    const authContext = {
      event,
      success,
      requestId: req.requestId,
      userId: req.user?.id,
      userRole: req.user?.role,
      ip: req.ip || req.connection.remoteAddress || 'unknown',
      userAgent: req.get('User-Agent') || 'unknown',
      ...context,
    };

    if (success) {
      this.logger.info(`Auth event: ${event}`, authContext);
    } else {
      this.logger.warn(`Auth event failed: ${event}`, authContext);
    }
  }

  // Log performance metrics
  logPerformance(
    operation: string,
    duration: number,
    req: Request,
    context: LogContext = {}
  ): void {
    const perfContext = {
      operation,
      duration,
      requestId: req.requestId,
      userId: req.user?.id,
      userRole: req.user?.role,
      ...context,
    };

    this.logger.info(
      `Performance: ${operation} took ${duration}ms`,
      perfContext
    );
  }

  // Create standardized error response
  createErrorResponse(
    error: unknown,
    req: Request,
    defaultMessage: string = 'Operation failed'
  ): {
    statusCode: number;
    success: false;
    error: {
      message: string;
      code?: string;
      statusCode?: number;
      details?: unknown;
      operation?: string;
      timestamp?: string;
      correlationId?: string;
    };
  } {
    // Prioritize CivicPressError
    if (isCivicPressError(error)) {
      const outputDetails = error.getOutputDetails();
      return {
        statusCode: error.statusCode,
        success: false,
        error: {
          message: outputDetails.message,
          code: outputDetails.code,
          ...(outputDetails.details !== undefined && outputDetails.details !== null
            ? { details: outputDetails.details }
            : {}),
          correlationId: error.correlationId,
        },
      };
    }

    // Typed HttpError path (post Phase 2d W3-T2).
    if (error instanceof HttpError) {
      return {
        statusCode: error.statusCode,
        success: false,
        error: {
          message: error.message,
          code: error.code ?? 'API_ERROR',
          ...(error.details && { details: error.details }),
        },
      };
    }

    // Fallback for legacy errors that carry `statusCode` as a runtime
    // property without being a typed HttpError (e.g. third-party libs).
    if (error instanceof Error && 'statusCode' in error) {
      const legacy = error as Error & {
        statusCode?: number;
        code?: string;
      };
      return {
        statusCode: legacy.statusCode ?? 500,
        success: false,
        error: {
          message: error.message,
          code: legacy.code ?? 'API_ERROR',
        },
      };
    }

    return {
      statusCode: 500,
      success: false,
      error: {
        message: defaultMessage,
        details: error instanceof Error ? error.message : 'Unknown error',
      },
    };
  }

  // Handle errors with logging and response
  handleError(
    operation: string,
    error: unknown,
    req: Request,
    res: Response,
    defaultMessage: string = 'Operation failed'
  ): void {
    this.logError(operation, error, req);

    const errorResponse = this.createErrorResponse(error, req, defaultMessage);
    res.status(errorResponse.statusCode).json(errorResponse);
  }

  // Handle validation errors
  handleValidationError(
    operation: string,
    errors: unknown[],
    req: Request,
    res: Response
  ): void {
    this.logValidationError(operation, errors, req);

    res.status(400).json({
      success: false,
      error: {
        message: 'Invalid request data',
        details: errors,
      },
    });
  }

  // Send standardized success response
  sendSuccess<T>(
    data: T,
    req: Request,
    res: Response,
    options: {
      statusCode?: number;
      message?: string;
      meta?: SuccessResponse<T>['meta'];
      operation?: string;
    } = {}
  ): void {
    const {
      statusCode = 200,
      message,
      meta,
      operation = 'API operation',
    } = options;

    // Log the success
    this.logSuccess(operation, req, { dataType: typeof data });

    // Create standardized response
    const response: SuccessResponse<T> = {
      success: true,
      data,
      ...(message && { message }),
      ...(meta && { meta }),
    };

    res.status(statusCode).json(response);
  }
}

// Export singleton instance
export const apiLogger = ApiLogger.getInstance();

// Convenience functions for common patterns
export function logApiRequest(req: Request, context?: LogContext): void {
  apiLogger.logRequest(req, context);
}

export function logApiResponse(
  req: Request,
  res: Response,
  context?: LogContext
): void {
  apiLogger.logResponse(req, res, context);
}

export function logApiSuccess(
  operation: string,
  req: Request,
  context?: LogContext
): void {
  apiLogger.logSuccess(operation, req, context);
}

export function logApiError(
  operation: string,
  error: unknown,
  req: Request,
  context?: LogContext
): void {
  apiLogger.logError(operation, error, req, context);
}

export function handleApiError(
  operation: string,
  error: unknown,
  req: Request,
  res: Response,
  defaultMessage?: string
): void {
  apiLogger.handleError(operation, error, req, res, defaultMessage);
}

export function handleValidationError(
  operation: string,
  errors: unknown[],
  req: Request,
  res: Response
): void {
  apiLogger.handleValidationError(operation, errors, req, res);
}

export function sendSuccess<T>(
  data: T,
  req: Request,
  res: Response,
  options: {
    statusCode?: number;
    message?: string;
    meta?: SuccessResponse<T>['meta'];
    operation?: string;
  } = {}
): void {
  apiLogger.sendSuccess(data, req, res, options);
}
