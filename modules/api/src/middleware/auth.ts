import { Request, Response, NextFunction } from 'express';
import { CivicPress, AuthUser, Logger, userCan } from '@civicpress/core';

const logger = new Logger();

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
  civicPress?: CivicPress;
}

export function authMiddleware(civicPress: CivicPress) {
  return async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      // BYPASS_AUTH: Inject mock user for testing
      if (process.env.BYPASS_AUTH === 'true' && req.headers['x-mock-user']) {
        try {
          req.user = JSON.parse(req.headers['x-mock-user'] as string);
          req.civicPress = civicPress;
          return next();
        } catch (err) {
          return res.status(400).json({
            error: 'Invalid X-Mock-User header',
            message: err instanceof Error ? err.message : 'Malformed JSON',
          });
        }
      }

      const authHeader = req.headers.authorization;

      if (!authHeader) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required',
          message: 'No authorization header provided',
        });
      }

      const [scheme, token] = authHeader.split(' ');

      if (scheme.toLowerCase() !== 'bearer') {
        return res.status(401).json({
          success: false,
          error: 'Invalid authorization scheme',
          message: 'Use Bearer token authentication',
        });
      }

      if (!token) {
        return res.status(401).json({
          success: false,
          error: 'No token provided',
          message: 'Authorization token is required',
        });
      }

      // Try API key authentication first
      const authService = civicPress.getAuthService();
      let user = await authService.validateApiKey(token);

      // If API key fails, try session token
      if (!user) {
        user = await authService.validateSession(token);
      }

      // For test environment, if no user found but we have a token that looks like a simulated token
      if (
        !user &&
        process.env.NODE_ENV === 'test' &&
        token.startsWith('mock-')
      ) {
        // Create a mock user for testing
        user = {
          id: 1,
          username: 'test-user',
          role: 'admin', // Default to admin for tests
          email: 'test@example.com',
          name: 'Test User',
        };
      }

      // Debug logging for test environment
      if (process.env.NODE_ENV === 'test') {
        logger.debug(
          `Auth middleware - Token: ${token.substring(0, 10)}..., User found: ${!!user}, Role: ${user?.role}`
        );
      }

      if (!user) {
        return res.status(401).json({
          success: false,
          error: 'Invalid token',
          message: 'The provided token is invalid or expired',
        });
      }

      // Add user to request
      req.user = user;
      req.civicPress = civicPress;

      // Log authentication event
      await authService.logAuthEvent(
        user.id,
        'api_access',
        `Access to ${req.method} ${req.path}`,
        req.ip
      );

      next();
    } catch (error) {
      logger.error('Auth middleware error:', error);
      return res.status(500).json({
        success: false,
        error: 'Authentication error',
        message: 'Internal server error during authentication',
      });
    }
  };
}

/**
 * Enhanced Authorization Middleware
 * Uses our comprehensive role-based authorization system
 */
export function requirePermission(permission: string | string[]) {
  return async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: {
            message: 'Authentication required',
            code: 'UNAUTHENTICATED',
          },
        });
        return;
      }

      // Use our comprehensive userCan() system
      const hasPermission = await userCan(req.user, permission);

      if (!hasPermission) {
        res.status(403).json({
          error: {
            message: `Permission denied: ${Array.isArray(permission) ? permission.join(' or ') : permission}`,
            code: 'INSUFFICIENT_PERMISSIONS',
            required: permission,
            user: {
              id: req.user.id,
              username: req.user.username,
              role: req.user.role,
            },
          },
        });
        return;
      }

      next();
    } catch (error) {
      logger.error('Authorization error:', error);
      res.status(500).json({
        success: false,
        error: {
          message: 'Authorization check failed',
          code: 'AUTH_ERROR',
        },
      });
      return;
    }
  };
}

/**
 * Record-specific Authorization Middleware
 * Checks permissions for specific record types and actions
 */
export function requireRecordPermission(
  action: 'create' | 'edit' | 'delete' | 'view',
  recordType?: string
) {
  return async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: {
            message: 'Authentication required',
            code: 'UNAUTHENTICATED',
          },
        });
        return;
      }

      // Determine record type from request body, params, or query
      const targetRecordType =
        recordType ||
        req.body?.type ||
        req.params?.type ||
        (req.query?.type as string);

      // Use our comprehensive userCan() system with context
      const hasPermission = await userCan(req.user, `records:${action}`, {
        recordType: targetRecordType,
        action,
      });

      if (!hasPermission) {
        res.status(403).json({
          success: false,
          error: {
            message: `Permission denied: Cannot ${action} records${targetRecordType ? ` of type '${targetRecordType}'` : ''}`,
            code: 'INSUFFICIENT_PERMISSIONS',
            required: `records:${action}`,
            recordType: targetRecordType,
            user: {
              id: req.user.id,
              username: req.user.username,
              role: req.user.role,
            },
          },
        });
        return;
      }

      next();
    } catch (error) {
      logger.error('Record authorization error:', error);
      res.status(500).json({
        success: false,
        error: {
          message: 'Authorization check failed',
          code: 'AUTH_ERROR',
        },
      });
      return;
    }
  };
}

/**
 * Storage-specific Authorization Middleware
 * Checks permissions for storage operations
 */
export function requireStoragePermission(
  action: 'upload' | 'download' | 'delete' | 'manage' | 'admin'
) {
  return async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: {
            message: 'Authentication required',
            code: 'UNAUTHENTICATED',
          },
        });
        return;
      }

      // Use our comprehensive userCan() system with context
      const hasPermission = await userCan(
        req.user,
        `storage:${action}` as any,
        {
          action: action as any,
        }
      );

      if (!hasPermission) {
        res.status(403).json({
          success: false,
          error: {
            message: `Permission denied: Cannot ${action} storage resources`,
            code: 'INSUFFICIENT_PERMISSIONS',
            required: `storage:${action}`,
            user: {
              id: req.user.id,
              username: req.user.username,
              role: req.user.role,
            },
          },
        });
        return;
      }

      next();
    } catch (error) {
      logger.error('Storage authorization error:', error);
      res.status(500).json({
        success: false,
        error: {
          message: 'Authorization check failed',
          code: 'AUTH_ERROR',
        },
      });
      return;
    }
  };
}

/**
 * Optional Authentication Middleware
 * Attaches user if token is valid, but doesn't require it
 */
export function optionalAuth(civicPress: CivicPress) {
  return async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        // No auth header, continue without user
        next();
        return;
      }

      const token = authHeader.substring(7);

      // Try API key authentication first
      const authService = civicPress.getAuthService();
      let user = await authService.validateApiKey(token);

      // If API key fails, try session token
      if (!user) {
        user = await authService.validateSession(token);
      }

      if (user) {
        // Attach user to request if valid
        req.user = user;
        req.civicPress = civicPress;
      }

      next();
    } catch (error) {
      // Log error but continue without user
      logger.error('Optional auth error:', error);
      next();
    }
  };
}
