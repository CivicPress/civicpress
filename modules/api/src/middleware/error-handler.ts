import { Request, Response, NextFunction } from 'express';
import {
  Logger,
  CivicPressError,
  isCivicPressError,
  getErrorCode,
  getStatusCode,
  getCorrelationId,
} from '@civicpress/core';

const logger = new Logger();

export interface ApiError extends Error {
  statusCode?: number;
  isOperational?: boolean;
  code?: string;
  context?: Record<string, any>;
}

export interface RequestContext {
  requestId: string;
  userId?: string;
  userRole?: string;
  ip: string;
  userAgent: string;
  method: string;
  path: string;
  query: Record<string, any>;
  body?: any;
  headers: Record<string, any>;
}

// Generate unique request ID for tracing
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Extract request context for logging
function extractRequestContext(req: Request): RequestContext {
  return {
    requestId: (req as any).requestId || generateRequestId(),
    userId: (req as any).user?.id,
    userRole: (req as any).user?.role,
    ip: req.ip || req.connection.remoteAddress || 'unknown',
    userAgent: req.get('User-Agent') || 'unknown',
    method: req.method,
    path: req.path,
    query: req.query,
    body: req.method !== 'GET' ? req.body : undefined,
    headers: {
      'content-type': req.get('Content-Type'),
      authorization: req.get('Authorization') ? 'present' : 'absent',
      'user-agent': req.get('User-Agent'),
    },
  };
}

// Categorize errors for better handling
export function categorizeError(error: any): {
  category: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  actionable: boolean;
} {
  // First check if it's a CivicPressError
  if (isCivicPressError(error)) {
    const code = error.code;
    const statusCode = error.statusCode;

    // Map error codes to categories
    if (code.includes('VALIDATION') || code.includes('VALIDATION_ERROR')) {
      return { category: 'validation', severity: 'low', actionable: true };
    }
    if (code.includes('UNAUTHORIZED') || code.includes('AUTHENTICATION')) {
      return {
        category: 'authentication',
        severity: 'medium',
        actionable: true,
      };
    }
    if (code.includes('FORBIDDEN') || code.includes('AUTHORIZATION')) {
      return {
        category: 'authorization',
        severity: 'medium',
        actionable: true,
      };
    }
    if (code.includes('NOT_FOUND')) {
      return { category: 'not_found', severity: 'low', actionable: true };
    }
    if (code.includes('CONFLICT')) {
      return { category: 'conflict', severity: 'medium', actionable: true };
    }
    if (code.includes('DATABASE')) {
      return { category: 'database', severity: 'high', actionable: true };
    }
    if (code.includes('FILE_SYSTEM')) {
      return { category: 'file_system', severity: 'medium', actionable: true };
    }
    if (statusCode >= 500) {
      return { category: 'system', severity: 'high', actionable: false };
    }

    return { category: 'unknown', severity: 'medium', actionable: false };
  }

  // Fallback to old error name-based categorization
  if (error.name === 'ValidationError' || error.name === 'SyntaxError') {
    return { category: 'validation', severity: 'low', actionable: true };
  }
  if (error.name === 'UnauthorizedError') {
    return { category: 'authentication', severity: 'medium', actionable: true };
  }
  if (error.name === 'ForbiddenError') {
    return { category: 'authorization', severity: 'medium', actionable: true };
  }
  if (error.name === 'NotFoundError') {
    return { category: 'not_found', severity: 'low', actionable: true };
  }
  if (error.code === 'ENOENT') {
    return { category: 'file_system', severity: 'medium', actionable: true };
  }
  if (error.code === 'ECONNREFUSED') {
    return { category: 'database', severity: 'high', actionable: true };
  }
  if (error.code === 'EADDRINUSE') {
    return { category: 'system', severity: 'high', actionable: true };
  }

  return { category: 'unknown', severity: 'medium', actionable: false };
}

export function errorHandler(
  err: ApiError | CivicPressError,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void {
  const context = extractRequestContext(req);
  const categorization = categorizeError(err);

  // Extract error details - prioritize CivicPressError
  let statusCode: number;
  let message: string;
  let errorCode: string | undefined;
  let errorContext: Record<string, any> | undefined;
  let correlationId: string | undefined;

  if (isCivicPressError(err)) {
    // Use CivicPressError details
    statusCode = err.statusCode;
    message = err.message;
    errorCode = err.code;
    errorContext = err.context;
    correlationId = err.correlationId;
  } else {
    // Fallback to ApiError or generic Error
    statusCode = err.statusCode || 500;
    message = err.message || 'Internal Server Error';
    errorCode = err.code;
    errorContext = err.context;

    // Handle JSON parsing errors
    if (err.name === 'SyntaxError') {
      statusCode = 400;
    }
  }

  // Log error with comprehensive context
  logger.error('API Error', {
    error: {
      name: err.name,
      message,
      code: errorCode,
      stack: err.stack,
      ...(correlationId && { correlationId }),
    },
    request: context,
    response: {
      statusCode,
      category: categorization.category,
      severity: categorization.severity,
      actionable: categorization.actionable,
    },
    ...(errorContext && { errorContext }),
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
  });

  // Additional logging for critical errors
  if (categorization.severity === 'critical' || statusCode >= 500) {
    logger.error('Critical error details', {
      error: err,
      context,
      ...(correlationId && { correlationId }),
      stack: err.stack,
    });
  }

  // Don't leak error details in production
  const isDevelopment = process.env.NODE_ENV === 'development';
  const errorResponse = {
    success: false,
    error: {
      message: isDevelopment ? message : 'Internal Server Error',
      code: errorCode || categorization.category,
      ...(isDevelopment && {
        stack: err.stack,
        details: errorContext,
      }),
      ...(correlationId && { correlationId }),
    },
    requestId: context.requestId,
    timestamp: new Date().toISOString(),
    path: req.path,
    method: req.method,
  };

  res.status(statusCode).json(errorResponse);
}

// Middleware to add request ID to all requests
export function requestIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  (req as any).requestId = generateRequestId();
  res.setHeader('X-Request-ID', (req as any).requestId);
  next();
}

// Middleware to log all requests
export function requestLoggingMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const context = extractRequestContext(req);

  logger.info('API Request', {
    request: context,
    timestamp: new Date().toISOString(),
  });

  // Log response when it completes
  const originalSend = res.send;
  res.send = function (data) {
    logger.info('API Response', {
      requestId: context.requestId,
      statusCode: res.statusCode,
      contentLength: data ? data.length : 0,
      timestamp: new Date().toISOString(),
    });
    return originalSend.call(this, data);
  };

  next();
}

// Utility function to create operational errors
export function createApiError(
  message: string,
  statusCode: number = 500,
  code?: string,
  context?: Record<string, any>
): ApiError {
  const error = new Error(message) as ApiError;
  error.statusCode = statusCode;
  error.isOperational = true;
  error.code = code;
  error.context = context;
  return error;
}

// Utility function to create validation errors
export function createValidationError(
  message: string,
  details?: any
): ApiError {
  return createApiError(message, 400, 'VALIDATION_ERROR', { details });
}

// Utility function to create authentication errors
export function createAuthError(message: string): ApiError {
  return createApiError(message, 401, 'AUTHENTICATION_ERROR');
}

// Utility function to create authorization errors
export function createForbiddenError(message: string): ApiError {
  return createApiError(message, 403, 'AUTHORIZATION_ERROR');
}

// Utility function to create not found errors
export function createNotFoundError(message: string): ApiError {
  return createApiError(message, 404, 'NOT_FOUND_ERROR');
}
