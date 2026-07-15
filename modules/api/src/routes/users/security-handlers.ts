import { Router } from 'express';
import { HttpError } from '../../utils/http-error.js';
import { CivicPress } from '@civicpress/core';
import {
  logApiRequest,
  sendSuccess,
  handleApiError,
} from '../../utils/api-logger.js';

export function registerSecurityRoutes(router: Router): void {
  /**
   * GET /api/users/:id/security-info
   * Get user security information (auth provider, email verification status, etc.)
   */
  router.get('/:id/security-info', async (req, res) => {
    logApiRequest(req, { operation: 'get_security_info' });

    try {
      const userId = parseInt(req.params.id);
      const requestingUser = req.user;
      if (!requestingUser) {
        return res.status(401).json({ success: false, error: { code: 'UNAUTHENTICATED', message: 'Authentication required' } });
      }

      // Users can only view their own security info, unless they're admin
      const civicPress = req.civicPress as CivicPress;
      const authService = civicPress.getAuthService();

      if (userId !== requestingUser.id) {
        const canManageUsers = await authService.userCan(
          requestingUser,
          'users:manage'
        );
        if (!canManageUsers) {
          const error = new HttpError(403, 'Insufficient permissions');
          return handleApiError(
            'get_security_info', error,
            req,
            res,
            'You can only view your own security information'
          );
        }
      }

      // Get user by ID
      const user = await authService.getUserById(userId);
      if (!user) {
        const error = new HttpError(404, 'User not found');
        return handleApiError(
          'get_security_info', error,
          req,
          res,
          'User not found'
        );
      }

      // Get pending email change info
      const pendingEmailChange = await authService.getPendingEmailChange(userId);

      const securityInfo = {
        userId: user.id,
        username: user.username,
        email: user.email,
        authProvider: authService.getUserAuthProvider(user),
        emailVerified: user.email_verified || false,
        canSetPassword: authService.canSetPassword(user),
        isExternalAuth: authService.isExternalAuthUser(user),
        pendingEmailChange: {
          email: pendingEmailChange.pendingEmail,
          expiresAt: pendingEmailChange.expiresAt,
        },
      };

      sendSuccess(
        {
          securityInfo,
        },
        req,
        res,
        { operation: 'get_security_info' }
      );
    } catch (error) {
      handleApiError(
        'get_security_info',
        error,
        req,
        res,
        'Failed to get security information'
      );
    }
  });
}
