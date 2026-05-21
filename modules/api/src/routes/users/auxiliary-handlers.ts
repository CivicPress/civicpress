import { Router } from 'express';
import { CivicPress } from '@civicpress/core';
import {
  logApiRequest,
  sendSuccess,
  handleApiError,
} from '../../utils/api-logger.js';
import {
  CreateUserRequest,
  PasswordAuthRequest,
  VerifyEmailChangeRequest,
} from './handlers-common.js';

/**
 * Registers the public user registration endpoint on the registration router.
 * Mounted at /api/users/register in the main API module.
 */
export function registerRegistrationRoutes(router: Router): void {
  /**
   * POST /register
   * Public user registration (no authentication required)
   */
  router.post('/', async (req, res) => {
    logApiRequest(req, { operation: 'register_user' });

    try {
      const userData: CreateUserRequest = req.body;

      // Validate required fields
      if (!userData.username) {
        const error = new Error('Username is required');
        (error as any).statusCode = 400;
        return handleApiError(
          'register_user',
          error,
          req,
          res,
          'Username is required'
        );
      }

      if (!userData.password) {
        const error = new Error('Password is required');
        (error as any).statusCode = 400;
        return handleApiError(
          'register_user',
          error,
          req,
          res,
          'Password is required'
        );
      }

      if (!userData.email) {
        const error = new Error('Email is required');
        (error as any).statusCode = 400;
        return handleApiError(
          'register_user',
          error,
          req,
          res,
          'Email is required'
        );
      }

      // Get CivicPress instance from request
      const civicPress = req.context?.civicPress as CivicPress;
      if (!civicPress) {
        const error = new Error('CivicPress instance not available');
        (error as any).statusCode = 500;
        return handleApiError('register_user', error, req, res);
      }

      const authService = civicPress.getAuthService();

      // Normalize email (lowercase) for consistency
      const normalizedEmail = userData.email.toLowerCase().trim();

      // Validate email format
      if (!authService.isValidEmailFormat(normalizedEmail)) {
        const error = new Error('Invalid email format');
        (error as any).statusCode = 400;
        (error as any).code = 'INVALID_EMAIL_FORMAT';
        return handleApiError('register_user', error, req, res);
      }

      // Check if username already exists
      const existingUser = await authService.getUserByUsername(userData.username);
      if (existingUser) {
        const error = new Error('Username already exists');
        (error as any).statusCode = 409;
        (error as any).code = 'USERNAME_EXISTS';
        return handleApiError('register_user', error, req, res);
      }

      // Check if email is already in use
      const emailInUse = await authService.isEmailInUse(normalizedEmail);
      if (emailInUse) {
        const error = new Error('Email address is already registered');
        (error as any).statusCode = 409;
        (error as any).code = 'EMAIL_EXISTS';
        return handleApiError('register_user', error, req, res);
      }

      // Hash password
      const bcrypt = await import('bcrypt');
      const saltRounds = 12;
      const passwordHash = await bcrypt.hash(userData.password, saltRounds);

      // Create user with default role (always 'public' for public registration)
      // SECURITY: Ignore any role provided in registration - public registration always creates 'public' role users
      // Use username as name if no name is provided
      const userName = userData.name || userData.username;
      const newUser = await authService.createUserWithPassword({
        username: userData.username,
        email: normalizedEmail, // Use normalized email
        name: userName,
        role: 'public', // Always 'public' for public registration - ignore userData.role
        passwordHash,
        avatar_url: userData.avatar_url,
      });

      sendSuccess(
        {
          user: {
            id: newUser.id,
            username: newUser.username,
            role: newUser.role,
            email: newUser.email,
            name: newUser.name,
            avatar_url: newUser.avatar_url,
            created_at: newUser.created_at,
          },
          message:
            'User registered successfully. Please log in with your credentials.',
        },
        req,
        res,
        { operation: 'register_user' }
      );
    } catch (error) {
      handleApiError('register_user', error, req, res, 'Failed to register user');
    }
  });
}

/**
 * Registers the password authentication endpoint on the authentication router.
 * Mounted at /api/users/auth in the main API module.
 */
export function registerAuthenticationRoutes(router: Router): void {
  /**
   * POST /auth/password
   * Authenticate with username and password (no authentication required)
   */
  router.post('/password', async (req, res) => {
    logApiRequest(req, { operation: 'password_auth' });

    try {
      const { username, password }: PasswordAuthRequest = req.body;

      if (!username || !password) {
        const error = new Error('Username and password are required');
        (error as any).statusCode = 400;
        return handleApiError(
          'password_auth',
          error,
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
        { operation: 'password_auth' }
      );
    } catch (error) {
      // Set 401 status code for authentication failures
      const authError = new Error(
        error instanceof Error ? error.message : 'Password authentication failed'
      );
      (authError as any).statusCode = 401;
      handleApiError(
        'password_auth',
        authError,
        req,
        res,
        'Password authentication failed'
      );
    }
  });
}

/**
 * Registers the public email-change verification endpoint on the public router.
 * Mounted at /api/users/verify-email-change in the main API module.
 */
export function registerPublicEmailChangeRoutes(router: Router): void {
  /**
   * POST /api/users/verify-email-change
   * Complete email change with verification token (no auth required)
   */
  router.post('/', async (req, res) => {
    logApiRequest(req, { operation: 'verify_email_change' });

    try {
      const { token }: VerifyEmailChangeRequest = req.body;

      if (!token) {
        const error = new Error('Verification token is required');
        (error as any).statusCode = 400;
        return handleApiError(
          'verify_email_change',
          error,
          req,
          res,
          'Verification token is required'
        );
      }

      // Complete email change
      const civicPress = req.context?.civicPress as CivicPress;
      const authService = civicPress.getAuthService();
      const result = await authService.completeEmailChange(token);

      if (!result.success) {
        const error = new Error(result.message);
        (error as any).statusCode = 400;
        return handleApiError(
          'verify_email_change',
          error,
          req,
          res,
          result.message
        );
      }

      // Note: Audit logging is handled in the core service

      sendSuccess(
        {
          success: true,
          message: result.message,
        },
        req,
        res,
        { operation: 'verify_email_change' }
      );
    } catch (error) {
      handleApiError(
        'verify_email_change',
        error,
        req,
        res,
        'Failed to verify email change'
      );
    }
  });
}

/**
 * Registers the current-email verification endpoint on the email verification router.
 * Mounted at /api/users/verify-current-email in the main API module.
 */
export function registerEmailVerificationRoutes(router: Router): void {
  /**
   * POST /api/users/verify-current-email
   * Verify current email address with token (no auth required)
   */
  router.post('/', async (req, res) => {
    logApiRequest(req, { operation: 'verify_current_email' });

    try {
      const { token } = req.body;

      if (!token) {
        const error = new Error('Verification token is required');
        (error as any).statusCode = 400;
        return handleApiError(
          'verify_current_email',
          error,
          req,
          res,
          'Verification token is required'
        );
      }

      // Verify current email
      const civicPress = req.context?.civicPress as CivicPress;
      const authService = civicPress.getAuthService();
      const result = await authService.verifyCurrentEmail(token);

      if (!result.success) {
        const error = new Error(result.message);
        (error as any).statusCode = 400;
        return handleApiError(
          'verify_current_email',
          error,
          req,
          res,
          result.message
        );
      }

      sendSuccess(
        {
          success: true,
          message: result.message,
        },
        req,
        res,
        { operation: 'verify_current_email' }
      );
    } catch (error) {
      handleApiError(
        'verify_current_email',
        error,
        req,
        res,
        'Failed to verify current email'
      );
    }
  });
}
