import { Request, Response, NextFunction } from 'express';
import { CivicPress, CsrfProtection } from '@civicpress/core';

/**
 * CSRF Protection Middleware
 *
 * Skips CSRF check for:
 * - GET, HEAD, OPTIONS requests
 * - Requests with valid Bearer token (API clients)
 * - Requests with X-CSRF-Bypass header (internal services)
 */
export function csrfMiddleware(civicPress: CivicPress) {
  const secretsManager = civicPress.getSecretsManager();
  const csrfProtection = new CsrfProtection(secretsManager);

  return (req: Request, res: Response, next: NextFunction) => {
    // Skip CSRF for safe methods
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      return next();
    }

    // Skip CSRF for API clients (Bearer token auth)
    if (req.headers.authorization?.startsWith('Bearer ')) {
      return next();
    }

    // Skip CSRF for public config validation endpoint
    // Path could be /api/v1/config/:type/validate or /config/:type/validate
    // Use req.originalUrl or req.path to check
    const pathToCheck = req.originalUrl || req.path;
    if (pathToCheck.includes('/config/') && pathToCheck.includes('/validate')) {
      return next();
    }

    // Skip CSRF for internal services (e.g., webhooks that have their own signature)
    if (req.headers['x-csrf-bypass'] === 'true') {
      return next();
    }

    // Skip CSRF for X-Mock-User requests (test-only authentication bypass)
    // This is safe because X-Mock-User is only used in tests
    if (req.headers['x-mock-user']) {
      return next();
    }

    // Require CSRF token
    // Check header first (preferred), then body (for form submissions)
    const token = req.headers['x-csrf-token'] || req.body?.csrfToken;

    if (!token) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'CSRF token required',
          code: 'CSRF_TOKEN_MISSING',
        },
      });
    }

    if (!csrfProtection.validateToken(token as string)) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Invalid CSRF token',
          code: 'CSRF_TOKEN_INVALID',
        },
      });
    }

    next();
  };
}
