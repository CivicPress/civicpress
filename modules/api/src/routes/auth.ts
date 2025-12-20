import { Router } from 'express';
import { CivicPress, CsrfProtection } from '@civicpress/core';
import {
  sendSuccess,
  handleApiError,
  logApiRequest,
} from '../utils/api-logger.js';

const router = Router();

/**
 * GET /api/v1/auth/csrf-token
 * Get CSRF token for form submissions
 * This endpoint is accessible without authentication for initial page load
 */
router.get('/csrf-token', (req, res) => {
  const civicPress = (req as any).civicPress as CivicPress;
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
    const civicPress = (req as any).civicPress as CivicPress;
    const authService = civicPress.getAuthService();

    // Check if provider is supported
    const availableProviders = authService.getAvailableOAuthProviders();
    if (!availableProviders.includes(provider)) {
      const error = new Error(`OAuth provider '${provider}' is not supported`);
      (error as any).statusCode = 400;
      (error as any).code = 'UNSUPPORTED_PROVIDER';
      (error as any).details = { availableProviders };
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
    const civicPress = (req as any).civicPress as CivicPress;
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
 * GET /api/auth/providers
 * Get available OAuth providers
 */
router.get('/providers', async (req, res) => {
  logApiRequest(req, { operation: 'get_providers' });

  try {
    // Get CivicPress instance from request
    const civicPress = (req as any).civicPress as CivicPress;
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
      const error = new Error('Authorization header required');
      (error as any).statusCode = 401;
      (error as any).code = 'MISSING_AUTH';
      return handleApiError('get_me', error, req, res);
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Get CivicPress instance from request
    const civicPress = (req as any).civicPress as CivicPress;
    const authService = civicPress.getAuthService();

    // Validate session (async)
    const user = await authService.validateSession(token);

    if (!user) {
      const error = new Error('Invalid or expired token');
      (error as any).statusCode = 401;
      (error as any).code = 'INVALID_TOKEN';
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
 * Logout (in stateless mode, just returns success)
 */
router.post('/logout', async (req, res) => {
  logApiRequest(req, { operation: 'logout' });

  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      const error = new Error('Authorization header required');
      (error as any).statusCode = 401;
      (error as any).code = 'MISSING_AUTH';
      return handleApiError('logout', error, req, res);
    }

    // In stateless mode, we don't actually invalidate sessions
    // The client should delete the token
    // TODO: Implement proper session invalidation if needed

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
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({
      success: false,
      error: {
        message: 'Simulated accounts are disabled in production',
        code: 'SIMULATED_AUTH_DISABLED',
      },
    });
  }
  logApiRequest(req, { operation: 'simulated_login' });

  try {
    const { username, role = 'public' } = req.body;

    if (!username) {
      const error = new Error('Username is required');
      (error as any).statusCode = 400;
      (error as any).code = 'MISSING_USERNAME';
      return handleApiError(
        'simulated_login',
        error,
        req,
        res,
        'Username is required'
      );
    }

    // Get CivicPress instance from request
    const civicPress = (req as any).civicPress as CivicPress;
    const authService = civicPress.getAuthService();

    // Validate role
    const isValidRole = await authService.isValidRole(role);
    if (!isValidRole) {
      const error = new Error(`Invalid role: ${role}`);
      (error as any).statusCode = 400;
      (error as any).code = 'INVALID_ROLE';
      (error as any).details = {
        role,
        availableRoles: await authService.getAvailableRoles(),
      };
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
