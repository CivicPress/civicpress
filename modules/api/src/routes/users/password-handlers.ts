import { Router } from 'express';
import { HttpError } from '../../utils/http-error.js';
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
      const requestingUser = req.user;
      if (!requestingUser) {
        return res.status(401).json({ success: false, error: { code: 'UNAUTHENTICATED', message: 'Authentication required' } });
      }

      if (!currentPassword || !newPassword) {
        const error = new HttpError(400, 'Current password and new password are required');
        return handleApiError(
          'change_password', error,
          req,
          res,
          'Current password and new password are required'
        );
      }

      // Users can only change their own password, unless they're admin
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
            'change_password', error,
            req,
            res,
            'You can only change your own password'
          );
        }
      }

      // External-auth accounts have no local password to verify or replace.
      // Reject with 403 (an authorization refusal), not the generic 400 that the
      // core {success:false} result maps to. This is a guard — do not remove it.
      const targetUser = await authService.getUserById(userId);
      if (targetUser && !authService.canSetPassword(targetUser)) {
        const provider = authService.getUserAuthProvider(targetUser);
        const error = new HttpError(
          403,
          `Users authenticated via ${provider} cannot change passwords. Password management is handled by the external authentication.`,
          'EXTERNAL_AUTH_PASSWORD_FORBIDDEN'
        );
        return handleApiError('change_password', error, req, res, error.message);
      }

      // Change password with security guards
      const result = await authService.changePassword(
        userId,
        newPassword,
        currentPassword
      );

      if (!result.success) {
        const error = new HttpError(400, result.message);
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
      const requestingUser = req.user;
      if (!requestingUser) {
        return res.status(401).json({ success: false, error: { code: 'UNAUTHENTICATED', message: 'Authentication required' } });
      }

      if (!newPassword) {
        const error = new HttpError(400, 'New password is required');
        return handleApiError(
          'set_password', error,
          req,
          res,
          'New password is required'
        );
      }

      // Only admins can set passwords for other users
      const civicPress = req.civicPress as CivicPress;
      const authService = civicPress.getAuthService();

      const canManageUsers = await authService.userCan(
        requestingUser,
        'users:manage'
      );
      if (!canManageUsers) {
        const error = new HttpError(403, 'Insufficient permissions');
        return handleApiError(
          'set_password', error,
          req,
          res,
          'Admin privileges required to set user passwords'
        );
      }

      // Existence check (404) — placed AFTER the admin (403) check so a non-admin
      // can never probe which user ids exist. setUserPassword otherwise throws
      // 'User not found' inside its try and surfaces as an opaque 500.
      const targetUser = await authService.getUserById(userId);
      if (!targetUser) {
        const error = new HttpError(404, 'User not found', 'USER_NOT_FOUND');
        return handleApiError('set_password', error, req, res, 'User not found');
      }

      // External-auth accounts cannot hold a local password. Reject with 403
      // (not the generic 400 the core result maps to). This is a guard — keep it.
      if (!authService.canSetPassword(targetUser)) {
        const provider = authService.getUserAuthProvider(targetUser);
        const error = new HttpError(
          403,
          `Users authenticated via ${provider} cannot set passwords. Password management is handled by the external authentication.`,
          'EXTERNAL_AUTH_PASSWORD_FORBIDDEN'
        );
        return handleApiError('set_password', error, req, res, error.message);
      }

      // Set password with security guards
      const result = await authService.setUserPassword(
        userId,
        newPassword,
        requestingUser.id
      );

      if (!result.success) {
        const error = new HttpError(400, result.message);
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
