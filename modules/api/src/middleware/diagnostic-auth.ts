/**
 * Diagnostic Authentication & Authorization Middleware
 *
 * Ensures only authorized users (admin role) can access diagnostic endpoints.
 */

import { Request, Response, NextFunction } from 'express';

/**
 * Middleware to require admin authentication for diagnostic endpoints
 */
export function requireDiagnosticAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const user = (req as any).user;

  if (!user) {
    res.status(401).json({
      success: false,
      error: {
        message: 'Authentication required',
        code: 'AUTHENTICATION_REQUIRED',
      },
    });
    return;
  }

  if (user.role !== 'admin') {
    res.status(403).json({
      success: false,
      error: {
        message: 'Admin access required for diagnostic endpoints',
        code: 'INSUFFICIENT_PERMISSIONS',
      },
    });
    return;
  }

  next();
}
