import { Request, Response, NextFunction } from 'express';
import {
  CivicPress,
  CsrfProtection,
  isSimulatedAuthEnabled,
} from '@civicpress/core';

/**
 * CSRF Protection Middleware
 *
 * Skips CSRF check for:
 * - GET, HEAD, OPTIONS requests
 * - Requests with valid Bearer token (API clients — header auth is not
 *   attacker-forgeable cross-site, so it is CSRF-immune)
 * - X-Mock-User requests, but only where simulated auth is enabled
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

    // FA-API-018: the unconditional `X-CSRF-Bypass: true` skip is removed — any
    // client could set it, defeating the layer entirely. Internal callers with
    // their own signature (webhooks) authenticate via Bearer token (skipped
    // above) rather than a header any browser origin can spoof.

    // Skip CSRF for X-Mock-User requests (test-only authentication bypass).
    // FA-API-002: honoured ONLY where the mock-user bypass itself is enabled
    // (isSimulatedAuthEnabled — test / opt-in dev), so it cannot skip CSRF in
    // production even if the header is present.
    if (req.headers['x-mock-user'] && isSimulatedAuthEnabled()) {
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
