import { Router } from 'express';
import { CivicPress } from '@civicpress/core';
import {
  logApiRequest,
  sendSuccess,
  handleApiError,
} from '../../utils/api-logger.js';
import { audit, RequestEmailChangeRequest } from './handlers-common.js';

export function registerEmailRoutes(router: Router): void {
  /**
   * POST /api/users/:id/request-email-change
   * Request email change (generates verification token)
   */
  router.post('/:id/request-email-change', async (req, res) => {
    logApiRequest(req, { operation: 'request_email_change' });

    try {
      const userId = parseInt(req.params.id);
      const { newEmail }: RequestEmailChangeRequest = req.body;
      const requestingUser = (req as any).user;

      if (!newEmail) {
        const error = new Error('New email address is required');
        (error as any).statusCode = 400;
        return handleApiError(
          'request_email_change',
          error,
          req,
          res,
          'New email address is required'
        );
      }

      // Users can only change their own email, unless they're admin
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
            'request_email_change',
            error,
            req,
            res,
            'You can only change your own email address'
          );
        }
      }

      // Request email change
      const result = await authService.requestEmailChange(userId, newEmail);

      if (!result.success) {
        const error = new Error(result.message);
        (error as any).statusCode = 400;
        return handleApiError(
          'request_email_change',
          error,
          req,
          res,
          result.message
        );
      }

      // Log audit event
      await audit.log({
        source: 'api',
        actor: { id: requestingUser.id, username: requestingUser.username },
        action: 'email_change_requested',
        target: { type: 'user', id: userId.toString() },
        outcome: 'success',
        message: `Email change requested for user ID ${userId} to ${newEmail}`,
        metadata: { ipAddress: req.ip, newEmail },
      });

      sendSuccess(
        {
          success: true,
          message: result.message,
          requiresVerification: result.requiresVerification,
          // Don't expose the verification token in the API response for security
        },
        req,
        res,
        { operation: 'request_email_change' }
      );
    } catch (error) {
      handleApiError(
        'request_email_change',
        error,
        req,
        res,
        'Failed to request email change'
      );
    }
  });

  /**
   * POST /api/users/:id/cancel-email-change
   * Cancel pending email change
   */
  router.post('/:id/cancel-email-change', async (req, res) => {
    logApiRequest(req, { operation: 'cancel_email_change' });

    try {
      const userId = parseInt(req.params.id);
      const requestingUser = (req as any).user;

      // Users can only cancel their own email change, unless they're admin
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
            'cancel_email_change',
            error,
            req,
            res,
            'You can only cancel your own email change request'
          );
        }
      }

      // Cancel email change
      const result = await authService.cancelEmailChange(userId);

      if (!result.success) {
        const error = new Error(result.message);
        (error as any).statusCode = 400;
        return handleApiError(
          'cancel_email_change',
          error,
          req,
          res,
          result.message
        );
      }

      // Log audit event
      await audit.log({
        source: 'api',
        actor: { id: requestingUser.id, username: requestingUser.username },
        action: 'email_change_cancelled',
        target: { type: 'user', id: userId.toString() },
        outcome: 'success',
        message: `Email change cancelled for user ID ${userId}`,
        metadata: { ipAddress: req.ip },
      });

      sendSuccess(
        {
          success: true,
          message: result.message,
        },
        req,
        res,
        { operation: 'cancel_email_change' }
      );
    } catch (error) {
      handleApiError(
        'cancel_email_change',
        error,
        req,
        res,
        'Failed to cancel email change'
      );
    }
  });

  /**
   * POST /api/users/:id/send-email-verification
   * Send email verification for current email address
   */
  router.post('/:id/send-email-verification', async (req, res) => {
    logApiRequest(req, { operation: 'send_email_verification' });

    try {
      const userId = parseInt(req.params.id);
      const requestingUser = (req as any).user;

      // Users can only verify their own email, unless they're admin
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
            'send_email_verification',
            error,
            req,
            res,
            'You can only verify your own email address'
          );
        }
      }

      // Send email verification
      const result = await authService.sendEmailVerification(userId);

      sendSuccess(
        {
          success: result.success,
          message: result.message,
          requiresVerification: result.requiresVerification,
        },
        req,
        res,
        { operation: 'send_email_verification' }
      );
    } catch (error) {
      handleApiError(
        'send_email_verification',
        error,
        req,
        res,
        'Failed to send email verification'
      );
    }
  });
}
