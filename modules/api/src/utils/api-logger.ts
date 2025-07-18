import { Request, Response } from 'express';
import { Logger } from '@civicpress/core';

export interface LogContext {
  requestId?: string;
  userId?: string;
  userRole?: string;
  method?: string;
  path?: string;
  [key: string]: any;
}

export interface SuccessResponse<T = any> {
  success: true;
  data: T;
  message?: string;
  meta?: {
    total?: number;
    page?: number;
    limit?: number;
    [key: string]: any;
  };
}

export interface ErrorResponse {
  success: false;
  error: {
    message: string;
    code?: string;
    details?: any;
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
      userId: (req as any).user?.id,
      userRole: (req as any).user?.role,
      requestId: (req as any).requestId,
      ...context,
    };

    this.logger.info('API Request', requestContext);
  }

  // Log API response
  logResponse(req: Request, res: Response, context: LogContext = {}): void {
    const responseContext = {
      statusCode: res.statusCode,
      requestId: (req as any).requestId,
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
      requestId: (req as any).requestId,
      userId: (req as any).user?.id,
      userRole: (req as any).user?.role,
      ...context,
    };

    this.logger.info(`${operation} completed successfully`, successContext);
  }

  // Log warning
  logWarning(message: string, req: Request, context: LogContext = {}): void {
    const warningContext = {
      message,
      requestId: (req as any).requestId,
      userId: (req as any).user?.id,
      userRole: (req as any).user?.role,
      ...context,
    };

    this.logger.warn(message, warningContext);
  }

  // Log error with full context
  logError(
    operation: string,
    error: Error | any,
    req: Request,
    context: LogContext = {}
  ): void {
    const errorContext = {
      operation,
      error: {
        name: error.name || 'UnknownError',
        message: error.message || 'Unknown error',
        code: error.code,
        stack: error.stack,
      },
      requestId: (req as any).requestId,
      userId: (req as any).user?.id,
      userRole: (req as any).user?.role,
      method: req.method,
      path: req.path,
      ...context,
    };

    this.logger.error(`${operation} failed`, errorContext);
  }

  // Log validation errors
  logValidationError(
    operation: string,
    errors: any[],
    req: Request,
    context: LogContext = {}
  ): void {
    const validationContext = {
      operation,
      validationErrors: errors,
      requestId: (req as any).requestId,
      userId: (req as any).user?.id,
      userRole: (req as any).user?.role,
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
      requestId: (req as any).requestId,
      userId: (req as any).user?.id,
      userRole: (req as any).user?.role,
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
      requestId: (req as any).requestId,
      userId: (req as any).user?.id,
      userRole: (req as any).user?.role,
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
      requestId: (req as any).requestId,
      userId: (req as any).user?.id,
      userRole: (req as any).user?.role,
      ...context,
    };

    this.logger.info(
      `Performance: ${operation} took ${duration}ms`,
      perfContext
    );
  }

  // Create standardized error response
  createErrorResponse(
    error: Error | any,
    req: Request,
    defaultMessage: string = 'Operation failed'
  ): { statusCode: number; success: false; error: any } {
    if (error instanceof Error && 'statusCode' in error) {
      return {
        statusCode: (error as any).statusCode || 500,
        success: false,
        error: {
          message: error.message,
          code: (error as any).code || 'API_ERROR',
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
    error: Error | any,
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
    errors: any[],
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
  error: Error | any,
  req: Request,
  context?: LogContext
): void {
  apiLogger.logError(operation, error, req, context);
}

export function handleApiError(
  operation: string,
  error: Error | any,
  req: Request,
  res: Response,
  defaultMessage?: string
): void {
  apiLogger.handleError(operation, error, req, res, defaultMessage);
}

export function handleValidationError(
  operation: string,
  errors: any[],
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
