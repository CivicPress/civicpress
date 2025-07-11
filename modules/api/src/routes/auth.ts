import { Router } from 'express';
import { CivicPress } from '@civicpress/core';
import {
  sendSuccess,
  handleApiError,
  logApiRequest,
} from '../utils/api-logger';

const router = Router();

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

    sendSuccess(
      {
        session: {
          token: session.token,
          user: session.user,
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

    sendSuccess(
      {
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
          email: user.email,
          name: user.name,
          avatar_url: user.avatar_url,
          permissions: [], // TODO: Add permissions to AuthUser interface
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

export default router;
