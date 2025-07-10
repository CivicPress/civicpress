import { Router } from 'express';
import { CivicPress } from '@civicpress/core';

const router = Router();

/**
 * POST /api/auth/login
 * Authenticate with GitHub OAuth token
 */
router.post('/login', async (req, res) => {
  try {
    const { githubToken } = req.body;

    if (!githubToken) {
      return res.status(400).json({
        error: {
          message: 'GitHub token is required',
          code: 'MISSING_TOKEN',
        },
      });
    }

    // Get CivicPress instance from request
    const civicPress = (req as any).civicPress as CivicPress;
    const authService = civicPress.getAuthService();

    // Authenticate with GitHub
    const session = await authService.authenticateWithGitHub(githubToken);

    res.json({
      success: true,
      session: {
        token: session.token,
        user: session.user,
        expiresAt: session.expiresAt,
      },
    });
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(401).json({
      error: {
        message: 'Authentication failed',
        details: error instanceof Error ? error.message : 'Unknown error',
        code: 'AUTH_FAILED',
      },
    });
  }
});

/**
 * GET /api/auth/me
 * Get current authenticated user info
 */
router.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: {
          message: 'Authorization header required',
          code: 'MISSING_AUTH',
        },
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Get CivicPress instance from request
    const civicPress = (req as any).civicPress as CivicPress;
    const authService = civicPress.getAuthService();

    // Validate session (async)
    const user = await authService.validateSession(token);

    if (!user) {
      return res.status(401).json({
        error: {
          message: 'Invalid or expired token',
          code: 'INVALID_TOKEN',
        },
      });
    }

    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        email: user.email,
        name: user.name,
        avatar_url: user.avatar_url,
        permissions: [], // TODO: Add permissions to AuthUser interface
      },
    });
  } catch (error) {
    console.error('Session validation error:', error);
    res.status(500).json({
      error: {
        message: 'Session validation failed',
        details: error instanceof Error ? error.message : 'Unknown error',
        code: 'VALIDATION_FAILED',
      },
    });
  }
});

/**
 * POST /api/auth/logout
 * Logout (in stateless mode, just returns success)
 */
router.post('/logout', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: {
          message: 'Authorization header required',
          code: 'MISSING_AUTH',
        },
      });
    }

    // In stateless mode, we don't actually invalidate sessions
    // The client should delete the token
    // TODO: Implement proper session invalidation if needed

    res.json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      error: {
        message: 'Logout failed',
        details: error instanceof Error ? error.message : 'Unknown error',
        code: 'LOGOUT_FAILED',
      },
    });
  }
});

export default router;
