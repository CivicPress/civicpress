import { Request, Response, NextFunction } from 'express';
import { apiLogger } from '../utils/api-logger';

// Middleware to automatically log all API requests and responses
export function apiLoggingMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const startTime = Date.now();

  // Log request
  apiLogger.logRequest(req);

  // Override res.send to log response
  const originalSend = res.send;
  res.send = function (data) {
    const duration = Date.now() - startTime;

    // Log response with performance metrics
    apiLogger.logResponse(req, res, {
      duration,
      contentLength: data ? data.length : 0,
    });

    // Log performance if operation takes longer than 1000ms
    if (duration > 1000) {
      apiLogger.logPerformance(`${req.method} ${req.path}`, duration, req, {
        contentLength: data ? data.length : 0,
      });
    }

    return originalSend.call(this, data);
  };

  next();
}

// Middleware to log authentication events
export function authLoggingMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const originalEnd = res.end;

  res.end = function (chunk?: any, encoding?: any) {
    const statusCode = res.statusCode;

    // Log authentication events
    if (req.path.includes('/auth')) {
      const success = statusCode >= 200 && statusCode < 300;
      apiLogger.logAuthEvent(`${req.method} ${req.path}`, req, success, {
        statusCode,
      });
    }

    return originalEnd.call(this, chunk, encoding);
  };

  next();
}

// Middleware to log database operations
export function databaseLoggingMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // This middleware can be extended to log database operations
  // For now, it's a placeholder for future database logging
  next();
}

// Middleware to log errors with additional context
export function errorLoggingMiddleware(
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  apiLogger.logError(`${req.method} ${req.path}`, error, req, {
    statusCode: res.statusCode,
    userAgent: req.get('User-Agent'),
    ip: req.ip || req.connection.remoteAddress,
  });

  next(error);
}

// Performance monitoring middleware
export function performanceMonitoringMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const startTime = process.hrtime.bigint();

  res.on('finish', () => {
    const endTime = process.hrtime.bigint();
    const duration = Number(endTime - startTime) / 1000000; // Convert to milliseconds

    // Log slow requests (> 500ms)
    if (duration > 500) {
      apiLogger.logPerformance(`${req.method} ${req.path}`, duration, req, {
        statusCode: res.statusCode,
        contentLength: res.get('Content-Length'),
      });
    }
  });

  next();
}

// Request context middleware
export function requestContextMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Add additional context to request for logging
  (req as any).requestContext = {
    timestamp: new Date().toISOString(),
    userAgent: req.get('User-Agent'),
    ip: req.ip || req.connection.remoteAddress,
    referer: req.get('Referer'),
    origin: req.get('Origin'),
  };

  next();
}

// Database context middleware - to be used with CivicPress instance
export function createDatabaseContextMiddleware(
  civicPress: any,
  dataDir?: string
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Add database service to request context for storage operations
    (req as any).context = {
      databaseService: civicPress?.getDatabaseService?.(),
      civicPress,
      dataDir, // Include dataDir in context for storage operations
    };

    next();
  };
}
