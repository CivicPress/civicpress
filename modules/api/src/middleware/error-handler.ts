import { Request, Response, NextFunction } from 'express';
import { Logger } from '@civicpress/core';

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
function categorizeError(error: any): {
  category: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  actionable: boolean;
} {
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
  err: ApiError,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void {
  let statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  // Handle JSON parsing errors
  if (err.name === 'SyntaxError') {
    statusCode = 400;
  }
  const context = extractRequestContext(req);
  const categorization = categorizeError(err);

  // Log error with comprehensive context
  logger.error('API Error', {
    error: {
      name: err.name,
      message: err.message,
      code: err.code,
      stack: err.stack,
    },
    request: context,
    response: {
      statusCode,
      category: categorization.category,
      severity: categorization.severity,
      actionable: categorization.actionable,
    },
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
  });

  // Additional logging for critical errors
  if (categorization.severity === 'critical' || statusCode >= 500) {
    logger.error('Critical error details', {
      error: err,
      context,
      stack: err.stack,
    });
  }

  // Don't leak error details in production
  const isDevelopment = process.env.NODE_ENV === 'development';
  const errorResponse = {
    error: {
      message: isDevelopment ? message : 'Internal Server Error',
      code: err.code || categorization.category,
      ...(isDevelopment && {
        stack: err.stack,
        details: err.context,
      }),
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
