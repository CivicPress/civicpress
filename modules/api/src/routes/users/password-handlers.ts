import { Router } from 'express';
import { CivicPress } from '@civicpress/core';
import {
  logApiRequest,
  sendSuccess,
  handleApiError,
} from '../../utils/api-logger.js';
import { audit, ChangePasswordRequest } from './handlers-common.js';

export function registerPasswordRoutes(router: Router): void {
  /**
   * POST /api/users/:id/change-password
   * Change user password (with current password verification)
   */
  router.post('/:id/change-password', async (req, res) => {
    logApiRequest(req, { operation: 'change_password' });

    try {
      const userId = parseInt(req.params.id);
      const { currentPassword, newPassword }: ChangePasswordRequest = req.body;
      const requestingUser = (req as any).user;

      if (!currentPassword || !newPassword) {
        const error = new Error('Current password and new password are required');
        (error as any).statusCode = 400;
        return handleApiError(
          'change_password',
          error,
          req,
          res,
          'Current password and new password are required'
        );
      }

      // Users can only change their own password, unless they're admin
      const civicPress = (req as any).civicPress as CivicPress;
      const authService = civicPress.getAuthService();

      if (userId !== requestingUser.id) {
        const canManageUsers = await authService.userCan(
          requestingUser,
          'users:manage'
        );
        if (!canManageUsers) {
          const error = new Error('Insufficient permissions');
          (error as any).statusCode = 403;
          return handleApiError(
            'change_password',
            error,
            req,
            res,
            'You can only change your own password'
          );
        }
      }

      // Change password with security guards
      const result = await authService.changePassword(
        userId,
        newPassword,
        currentPassword
      );

      if (!result.success) {
        const error = new Error(result.message);
        (error as any).statusCode = 400;
        return handleApiError('change_password', error, req, res, result.message);
      }

      // Log audit event
      await audit.log({
        source: 'api',
        actor: { id: requestingUser.id, username: requestingUser.username },
        action: 'password_changed',
        target: { type: 'user', id: userId.toString() },
        outcome: 'success',
        message: `Password changed for user ID ${userId}`,
        metadata: { ipAddress: req.ip },
      });

      sendSuccess(
        {
          success: true,
          message: result.message,
        },
        req,
        res,
        { operation: 'change_password' }
      );
    } catch (error) {
      handleApiError(
        'change_password',
        error,
        req,
        res,
        'Failed to change password'
      );
    }
  });

  /**
   * POST /api/users/:id/set-password
   * Set password for user (admin only, for external auth users)
   */
  router.post('/:id/set-password', async (req, res) => {
    logApiRequest(req, { operation: 'set_password' });

    try {
      const userId = parseInt(req.params.id);
      const { newPassword } = req.body;
      const requestingUser = (req as any).user;

      if (!newPassword) {
        const error = new Error('New password is required');
        (error as any).statusCode = 400;
        return handleApiError(
          'set_password',
          error,
          req,
          res,
          'New password is required'
        );
      }

      // Only admins can set passwords for other users
      const civicPress = (req as any).civicPress as CivicPress;
      const authService = civicPress.getAuthService();

      const canManageUsers = await authService.userCan(
        requestingUser,
        'users:manage'
      );
      if (!canManageUsers) {
        const error = new Error('Insufficient permissions');
        (error as any).statusCode = 403;
        return handleApiError(
          'set_password',
          error,
          req,
          res,
          'Admin privileges required to set user passwords'
        );
      }

      // Set password with security guards
      const result = await authService.setUserPassword(
        userId,
        newPassword,
        requestingUser.id
      );

      if (!result.success) {
        const error = new Error(result.message);
        (error as any).statusCode = 400;
        return handleApiError('set_password', error, req, res, result.message);
      }

      // Log audit event
      await audit.log({
        source: 'api',
        actor: { id: requestingUser.id, username: requestingUser.username },
        action: 'admin_password_set',
        target: { type: 'user', id: userId.toString() },
        outcome: 'success',
        message: `Password set for user ID ${userId} by admin`,
        metadata: { ipAddress: req.ip },
      });

      sendSuccess(
        {
          success: true,
          message: result.message,
        },
        req,
        res,
        { operation: 'set_password' }
      );
    } catch (error) {
      handleApiError('set_password', error, req, res, 'Failed to set password');
    }
  });
}
