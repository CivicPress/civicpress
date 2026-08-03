import { Router } from 'express';
import { HttpError } from '../utils/http-error.js';
import {
  CivicPress,
  CsrfProtection,
  isSimulatedAuthEnabled,
} from '@civicpress/core';
import {
  sendSuccess,
  handleApiError,
  logApiRequest,
  logApiError,
} from '../utils/api-logger.js';

const router = Router();

/**
 * GET /api/v1/auth/csrf-token
 * Get CSRF token for form submissions
 * This endpoint is accessible without authentication for initial page load
 */
router.get('/csrf-token', (req, res) => {
  const civicPress = req.civicPress as CivicPress;
  const secretsManager = civicPress.getSecretsManager();
  const csrfProtection = new CsrfProtection(secretsManager);

  const token = csrfProtection.getTokenForResponse();

  sendSuccess({ token }, req, res, { operation: 'get_csrf_token' });
});

/**
 * POST /api/auth/login
 * Authenticate with OAuth provider token
 */
router.post('/login', async (req, res) => {
  logApiRequest(req, { operation: 'login' });

  try {
    const { token, provider = 'github' } = req.body;

    if (!token) {
      return handleApiError(
        'login',
        new Error('OAuth token is required'),
        req,
        res,
        'OAuth token is required'
      );
    }

    // Get CivicPress instance from request
    const civicPress = req.civicPress as CivicPress;
    const authService = civicPress.getAuthService();

    // Check if provider is supported
    const availableProviders = authService.getAvailableOAuthProviders();
    if (!availableProviders.includes(provider)) {
      const error = new HttpError(400, `OAuth provider '${provider}' is not supported`, 'UNSUPPORTED_PROVIDER', { details: { availableProviders } });
    return handleApiError('login', error, req, res);
    }

    // Authenticate with OAuth provider
    const session = await authService.authenticateWithOAuth(provider, token);
    // Attach permissions to user payload
    const permissions = await authService.getUserPermissions(session.user);

    sendSuccess(
      {
        session: {
          token: session.token,
          user: { ...session.user, permissions },
          expiresAt: session.expiresAt,
        },
      },
      req,
      res,
      { operation: 'login' }
    );
  } catch (error) {
    handleApiError('login', error, req, res, 'Authentication failed');
  }
});

/**
 * POST /api/auth/password
 * Authenticate with username and password
 */
router.post('/password', async (req, res) => {
  logApiRequest(req, { operation: 'password_auth' });

  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return handleApiError(
        'password_auth',
        new Error('Username and password are required'),
        req,
        res,
        'Username and password are required'
      );
    }

    // Get CivicPress instance from request
    const civicPress = req.civicPress as CivicPress;
    const authService = civicPress.getAuthService();

    // Authenticate with password
    const session = await authService.authenticateWithPassword(
      username,
      password
    );
    // Attach permissions to user payload
    const permissions = await authService.getUserPermissions(session.user);

    sendSuccess(
      {
        session: {
          token: session.token,
          user: { ...session.user, permissions },
          expiresAt: session.expiresAt,
        },
      },
      req,
      res,
      { operation: 'password_auth' }
    );
  } catch (error) {
    handleApiError(
      'password_auth',
      error,
      req,
      res,
      'Password authentication failed'
    );
  }
});

/**
 * POST /api/auth/forgot-password
 * Begin a password reset for a username or email. ALWAYS responds 200 with the
 * same generic message whether or not an account matched (anti-enumeration).
 * Delivery is handled by the recovery service: a reset link over a user-facing
 * channel when one is configured (email, or the console dev sink), otherwise an
 * actionable task in the operator notification center. Rate-limited by the
 * strict window on the /auth mount.
 */
router.post('/forgot-password', async (req, res) => {
  logApiRequest(req, { operation: 'forgot_password' });

  // Uniform response — identical for a hit, a miss, or an OAuth-only account.
  const uniform = {
    message:
      'If an account matches, a password reset has been started. If you do ' +
      'not receive a reset link, contact your administrator.',
  };

  try {
    const { identifier, email, username } = req.body ?? {};
    const who =
      typeof identifier === 'string'
        ? identifier
        : typeof email === 'string'
          ? email
          : typeof username === 'string'
            ? username
            : '';

    // A blank request is still answered uniformly (no 400 that would let a
    // caller distinguish "missing field" from "no such user").
    if (who.trim()) {
      const civicPress = req.civicPress as CivicPress;
      const recovery = civicPress.getPasswordRecoveryService();
      const base = process.env.BASE_URL || 'http://localhost:3030';
      const resetUrlBase = `${base.replace(/\/$/, '')}/auth/reset-password`;

      // Do not await failures into the response — the outcome is server-side
      // telemetry only and must never change what the caller sees.
      const outcome = await recovery.requestReset(who.trim(), {
        resetUrlBase,
        ipAddress: req.ip,
      });
      logApiRequest(req, {
        operation: 'forgot_password',
        outcome: outcome.outcome,
        channel: outcome.channel,
      });
    }

    sendSuccess(uniform, req, res, { operation: 'forgot_password' });
  } catch (error) {
    // Even on an internal error, do not leak specifics — log server-side and
    // respond uniformly so a failure is indistinguishable from a no-match.
    logApiError('forgot_password', error, req);
    sendSuccess(uniform, req, res, { operation: 'forgot_password' });
  }
});

/**
 * POST /api/auth/reset-password
 * Consume a reset token and set a new password. Invalid/expired/consumed
 * tokens all return the same 400 (no oracle). On success every session is
 * revoked, so the user must sign in again with the new password.
 */
router.post('/reset-password', async (req, res) => {
  logApiRequest(req, { operation: 'reset_password' });

  try {
    const { token, newPassword, password } = req.body ?? {};
    const newPass = typeof newPassword === 'string' ? newPassword : password;

    if (!token || typeof token !== 'string' || !newPass) {
      const error = new HttpError(
        400,
        'A reset token and a new password are required',
        'MISSING_FIELDS'
      );
      return handleApiError('reset_password', error, req, res);
    }

    const civicPress = req.civicPress as CivicPress;
    const authService = civicPress.getAuthService();
    const result = await authService.resetPasswordWithToken(token, newPass);

    if (!result.success) {
      const error = new HttpError(400, result.message, 'RESET_FAILED');
      return handleApiError('reset_password', error, req, res, result.message);
    }

    sendSuccess(
      { message: result.message, sessionsRevoked: result.sessionsRevoked },
      req,
      res,
      { operation: 'reset_password' }
    );
  } catch (error) {
    handleApiError('reset_password', error, req, res, 'Failed to reset password');
  }
});

/**
 * GET /api/auth/providers
 * Get available OAuth providers
 */
router.get('/providers', async (req, res) => {
  logApiRequest(req, { operation: 'get_providers' });

  try {
    // Get CivicPress instance from request
    const civicPress = req.civicPress as CivicPress;
    const authService = civicPress.getAuthService();

    const providers = authService.getAvailableOAuthProviders();

    sendSuccess({ providers }, req, res, { operation: 'get_providers' });
  } catch (error) {
    handleApiError('get_providers', error, req, res, 'Failed to get providers');
  }
});

/**
 * GET /api/auth/me
 * Get current authenticated user info
 */
router.get('/me', async (req, res) => {
  logApiRequest(req, { operation: 'get_me' });

  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      const error = new HttpError(401, 'Authorization header required', 'MISSING_AUTH');
      return handleApiError('get_me', error, req, res);
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Get CivicPress instance from request
    const civicPress = req.civicPress as CivicPress;
    const authService = civicPress.getAuthService();

    // Validate session (async)
    const user = await authService.validateSession(token);

    if (!user) {
      const error = new HttpError(401, 'Invalid or expired token', 'INVALID_TOKEN');
      return handleApiError('get_me', error, req, res);
    }

    // Include permissions in response
    const permissions = await authService.getUserPermissions(user);
    sendSuccess(
      {
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
          email: user.email,
          name: user.name,
          avatar_url: user.avatar_url,
          email_verified: user.email_verified,
          permissions,
        },
      },
      req,
      res,
      { operation: 'get_me' }
    );
  } catch (error) {
    handleApiError('get_me', error, req, res, 'Session validation failed');
  }
});

/**
 * POST /api/auth/logout
 * Revoke the presented session server-side. Idempotent: an unknown or
 * already-revoked token still returns success (the caller's goal — that the
 * token no longer works — holds either way).
 */
router.post('/logout', async (req, res) => {
  logApiRequest(req, { operation: 'logout' });

  try {
    const authHeader = req.headers.authorization;

    // Parse like authMiddleware does (whitespace split, case-insensitive
    // scheme) so a token that authenticates can never fail to revoke.
    const [scheme, token] = (authHeader ?? '').split(/\s+/);
    if (!scheme || scheme.toLowerCase() !== 'bearer' || !token) {
      const error = new HttpError(401, 'Authorization header required', 'MISSING_AUTH');
      return handleApiError('logout', error, req, res);
    }

    const civicPress = req.civicPress as CivicPress;
    await civicPress.getAuthService().logout(token);

    sendSuccess({ message: 'Logged out successfully' }, req, res, {
      operation: 'logout',
    });
  } catch (error) {
    handleApiError('logout', error, req, res, 'Logout failed');
  }
});

/**
 * POST /api/auth/simulated
 * Authenticate with simulated account (for development/testing)
 */
router.post('/simulated', async (req, res) => {
  // FA-API-001: fail closed. Only enabled in an explicit dev/test environment
  // (see isSimulatedAuthEnabled); an unset NODE_ENV is treated as production.
  if (!isSimulatedAuthEnabled()) {
    return res.status(403).json({
      success: false,
      error: {
        message: 'Simulated accounts are disabled in this environment',
        code: 'SIMULATED_AUTH_DISABLED',
      },
    });
  }
  logApiRequest(req, { operation: 'simulated_login' });

  try {
    const { username, role = 'public' } = req.body;

    if (!username) {
      const error = new HttpError(400, 'Username is required', 'MISSING_USERNAME');
      return handleApiError(
        'simulated_login', error,
        req,
        res,
        'Username is required'
      );
    }

    // Get CivicPress instance from request
    const civicPress = req.civicPress as CivicPress;
    const authService = civicPress.getAuthService();

    // Validate role
    const isValidRole = await authService.isValidRole(role);
    if (!isValidRole) {
      const error = new HttpError(400, `Invalid role: ${role}`, 'INVALID_ROLE', { details: {
        role,
        availableRoles: await authService.getAvailableRoles(),
      } });
    return handleApiError('simulated_login', error, req, res);
    }

    // Authenticate with simulated account
    const session = await authService.authenticateWithSimulatedAccount(
      username,
      role
    );
    // Attach permissions to user payload
    const permissions = await authService.getUserPermissions(session.user);

    sendSuccess(
      {
        session: {
          token: session.token,
          user: { ...session.user, permissions },
          expiresAt: session.expiresAt,
        },
      },
      req,
      res,
      { operation: 'simulated_login' }
    );
  } catch (error) {
    handleApiError(
      'simulated_login',
      error,
      req,
      res,
      'Simulated authentication failed'
    );
  }
});

export default router;
