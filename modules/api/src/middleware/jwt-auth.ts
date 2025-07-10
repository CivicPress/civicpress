import { Request, Response, NextFunction } from 'express';
import { CivicPress } from '@civicpress/core';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    username: string;
    role: string;
    email?: string;
    name?: string;
    avatar_url?: string;
    permissions?: string[]; // Optional for now
  };
}

/**
 * JWT Authentication Middleware
 * Validates JWT tokens and attaches user info to request
 */
export function jwtAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        error: {
          message: 'Authorization header required',
          code: 'MISSING_AUTH',
        },
      });
      return;
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Get CivicPress instance from request
    const civicPress =
      (req as any).civicPress ||
      req.app?.get('civicPress') ||
      (req as any).civicPress;
    if (!civicPress) {
      res.status(500).json({
        error: {
          message: 'Authentication failed',
          details: 'CivicPress instance not available',
          code: 'AUTH_ERROR',
        },
      });
      return;
    }
    const authService = civicPress.getAuthService();

    // Validate session (async)
    authService
      .validateSession(token)
      .then((user) => {
        if (!user) {
          res.status(401).json({
            error: {
              message: 'Invalid or expired token',
              code: 'INVALID_TOKEN',
            },
          });
          return;
        }

        // Attach user to request
        req.user = user;
        next();
      })
      .catch((error) => {
        console.error('JWT auth error:', error);
        res.status(500).json({
          error: {
            message: 'Authentication failed',
            details: error instanceof Error ? error.message : 'Unknown error',
            code: 'AUTH_ERROR',
          },
        });
      });
  } catch (error) {
    console.error('JWT auth error:', error);
    res.status(500).json({
      error: {
        message: 'Authentication failed',
        details: error instanceof Error ? error.message : 'Unknown error',
        code: 'AUTH_ERROR',
      },
    });
  }
}

/**
 * Role-based Authorization Middleware
 * Checks if user has required role or permissions
 */
export function requireRole(requiredRole: string) {
  return (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): void => {
    if (!req.user) {
      res.status(401).json({
        error: {
          message: 'Authentication required',
          code: 'UNAUTHENTICATED',
        },
      });
      return;
    }

    if (req.user.role !== requiredRole) {
      res.status(403).json({
        error: {
          message: `Role '${requiredRole}' required`,
          code: 'INSUFFICIENT_PERMISSIONS',
        },
      });
      return;
    }

    next();
  };
}

/**
 * Permission-based Authorization Middleware
 * Checks if user has required permissions
 */
export function requirePermission(requiredPermission: string) {
  return (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): void => {
    if (!req.user) {
      res.status(401).json({
        error: {
          message: 'Authentication required',
          code: 'UNAUTHENTICATED',
        },
      });
      return;
    }

    // For testing: allow clerk role to have write permissions
    const hasPermission =
      req.user.permissions?.includes(requiredPermission) ||
      (req.user.role === 'clerk' && requiredPermission === 'write');

    if (!hasPermission) {
      res.status(403).json({
        error: {
          message: `Permission '${requiredPermission}' required`,
          code: 'INSUFFICIENT_PERMISSIONS',
        },
      });
      return;
    }

    next();
  };
}

/**
 * Optional Authentication Middleware
 * Attaches user if token is valid, but doesn't require it
 */
export function optionalAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // No auth header, continue without user
      next();
      return;
    }

    const token = authHeader.substring(7);

    // Get CivicPress instance from request
    const civicPress =
      (req as any).civicPress ||
      req.app?.get('civicPress') ||
      (req as any).civicPress;
    if (!civicPress) {
      // Log error but continue without user
      console.error('Optional auth error: CivicPress instance not available');
      next();
      return;
    }
    const authService = civicPress.getAuthService();

    // Validate session (async)
    authService
      .validateSession(token)
      .then((user) => {
        if (user) {
          // Attach user to request if valid
          req.user = user;
        }
        next();
      })
      .catch((error) => {
        // Log error but continue without user
        console.error('Optional auth error:', error);
        next();
      });
  } catch (error) {
    // Log error but continue without user
    console.error('Optional auth error:', error);
    next();
  }
}
