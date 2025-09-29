import express from 'express';
import { CivicPress } from '@civicpress/core';
import {
  logApiRequest,
  sendSuccess,
  handleApiError,
} from '../utils/api-logger';
import { AuditLogger } from '@civicpress/core';

const router = express.Router();
const audit = new AuditLogger();

// Create a separate router for registration
const registrationRouter = express.Router();

// Create a separate router for authentication
const authenticationRouter = express.Router();

// Create a separate router for public endpoints (no auth required)
const publicRouter = express.Router();

// Create a separate router for email verification endpoints
const emailVerificationRouter = express.Router();

interface CreateUserRequest {
  username: string;
  email?: string;
  name?: string;
  role?: string;
  password?: string; // Optional for OAuth users
  avatar_url?: string;
}

interface UpdateUserRequest {
  email?: string;
  name?: string;
  role?: string;
  password?: string;
  avatar_url?: string;
}

interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

interface RequestEmailChangeRequest {
  newEmail: string;
}

interface VerifyEmailChangeRequest {
  token: string;
}

interface PasswordAuthRequest {
  username: string;
  password: string;
}

/**
 * GET /api/users
 * List all users (admin only)
 */
router.get('/', async (req, res) => {
  logApiRequest(req, { operation: 'list_users' });

  try {
    // Check if user has permission to list users
    const user = (req as any).user;
    if (!user) {
      return handleApiError(
        'list_users',
        new Error('Authentication required'),
        req,
        res,
        'Authentication required'
      );
    }

    // Get CivicPress instance from request
    const civicPress = (req as any).civicPress as CivicPress;
    const authService = civicPress.getAuthService();

    // Check if user can manage users
    const canManageUsers = await authService.userCan(user, 'users:manage');
    if (!canManageUsers) {
      // DEBUG: Get user permissions to see what's loaded
      const userPermissions = await authService.getUserPermissions(user);
      const error = new Error(
        `Insufficient permissions to list users. User ${user.username} (${user.role}) has permissions: ${userPermissions.join(', ')}`
      );
      (error as any).statusCode = 403;
      (error as any).code = 'INSUFFICIENT_PERMISSIONS';
      return handleApiError('list_users', error, req, res);
    }

    // Get query parameters
    const { limit = 50, offset = 0, role, search } = req.query;

    // Get users from database
    const users = await civicPress.getDatabaseService().listUsers({
      limit: Number(limit),
      offset: Number(offset),
      role: role as string,
      search: search as string,
    });

    sendSuccess(
      {
        users: users.users.map((user) => ({
          id: user.id,
          username: user.username,
          role: user.role,
          email: user.email,
          name: user.name,
          avatar_url: user.avatar_url,
          created_at: user.created_at,
          updated_at: user.updated_at,
        })),
        pagination: {
          total: users.total,
          limit: Number(limit),
          offset: Number(offset),
        },
      },
      req,
      res,
      { operation: 'list_users' }
    );
  } catch (error) {
    handleApiError('list_users', error, req, res, 'Failed to list users');
  }
});

/**
 * POST /api/users
 * Create a new user (admin only)
 */
router.post('/', async (req, res) => {
  logApiRequest(req, { operation: 'create_user' });

  try {
    console.log('🔧 [DEBUG] Starting user creation endpoint');
    const userData: CreateUserRequest = req.body;

    // Validate required fields
    if (!userData.username) {
      return handleApiError(
        'create_user',
        new Error('Username is required'),
        req,
        res,
        'Username is required'
      );
    }

    // Check if user has permission to create users
    const user = (req as any).user;
    if (!user) {
      return handleApiError(
        'create_user',
        new Error('Authentication required'),
        req,
        res,
        'Authentication required'
      );
    }

    // Get CivicPress instance from request
    const civicPress = (req as any).civicPress as CivicPress;
    const authService = civicPress.getAuthService();

    // Check if user can manage users
    const canManageUsers = await authService.userCan(user, 'users:manage');
    if (!canManageUsers) {
      const error = new Error('Insufficient permissions to create users');
      (error as any).statusCode = 403;
      (error as any).code = 'INSUFFICIENT_PERMISSIONS';
      return handleApiError('create_user', error, req, res);
    }

    // Validate role if provided
    if (userData.role && !(await authService.isValidRole(userData.role))) {
      const error = new Error(`Invalid role: ${userData.role}`);
      (error as any).statusCode = 400;
      (error as any).code = 'INVALID_ROLE';
      (error as any).details = {
        role: userData.role,
        availableRoles: await authService.getAvailableRoles(),
      };
      return handleApiError('create_user', error, req, res);
    }

    // Hash password if provided
    let passwordHash: string | undefined;
    if (userData.password) {
      const bcrypt = await import('bcrypt');
      const saltRounds = 12;
      passwordHash = await bcrypt.hash(userData.password, saltRounds);
    }

    // Create user
    let newUser;
    try {
      newUser = await authService.createUserWithPassword({
        username: userData.username,
        email: userData.email,
        name: userData.name,
        role: userData.role,
        passwordHash,
        avatar_url: userData.avatar_url,
      });
    } catch (createError) {
      // Check if user exists by querying the database directly
      const existingUser = await authService.getUserByUsername(
        userData.username
      );
      if (existingUser) {
        newUser = existingUser;
      } else {
        throw createError;
      }
    }

    // Log audit event BEFORE sending response
    try {
      const actor: any = (req as any).user || {};
      await audit.log({
        source: 'api',
        actor: { id: actor.id, username: actor.username, role: actor.role },
        action: 'users:create',
        target: { type: 'user', id: newUser.id, name: newUser.username },
        outcome: 'success',
      });
    } catch (auditError) {
      // Continue with response even if audit logging fails
    }

    // Send success response
    res.status(200).json({
      success: true,
      data: {
        user: {
          id: newUser.id,
          username: newUser.username,
          role: newUser.role,
          email: newUser.email,
          name: newUser.name,
          avatar_url: newUser.avatar_url,
          created_at: newUser.created_at,
        },
      },
    });
  } catch (error) {
    try {
      const actor: any = (req as any).user || {};
      const body = (req as any).body || {};
      await audit.log({
        source: 'api',
        actor: { id: actor.id, username: actor.username, role: actor.role },
        action: 'users:create',
        target: { type: 'user', name: body?.username },
        outcome: 'failure',
        message: String(error),
      });
    } catch (auditError) {
      // Continue even if audit logging fails
    }
    handleApiError('create_user', error, req, res, 'Failed to create user');
  }
});

/**
 * GET /api/users/:id
 * Get user by ID (admin or self)
 */
router.get('/:id', async (req, res) => {
  logApiRequest(req, { operation: 'get_user' });

  try {
    // Get CivicPress instance from request
    const civicPress = (req as any).civicPress as CivicPress;
    const authService = civicPress.getAuthService();

    const identifier = req.params.id;
    let userId: number | undefined;
    let targetUser: any;

    // Try username lookup first, then fall back to ID if not found
    targetUser = await authService.getUserByUsername(identifier);
    if (targetUser) {
      userId = targetUser.id;
    } else {
      // If username not found and identifier is numeric, try as ID
      if (/^\d+$/.test(identifier)) {
        userId = parseInt(identifier);
        if (!isNaN(userId)) {
          targetUser = await authService.getUserById(userId);
        }
      }
    }

    // Check authentication
    const user = (req as any).user;
    if (!user) {
      return handleApiError(
        'get_user',
        new Error('Authentication required'),
        req,
        res,
        'Authentication required'
      );
    }

    // Check if user can view this user (admin or self)
    const canManageUsers = await authService.userCan(user, 'users:manage');
    const isSelf = userId !== undefined && user.id === userId;

    if (!canManageUsers && !isSelf) {
      const error = new Error('Insufficient permissions to view user');
      (error as any).statusCode = 403;
      (error as any).code = 'INSUFFICIENT_PERMISSIONS';
      return handleApiError('get_user', error, req, res);
    }

    // Check if user was found
    if (!targetUser) {
      const error = new Error('User not found');
      (error as any).statusCode = 404;
      (error as any).code = 'USER_NOT_FOUND';
      return handleApiError('get_user', error, req, res);
    }

    sendSuccess(
      {
        user: {
          id: targetUser.id,
          username: targetUser.username,
          role: targetUser.role,
          email: targetUser.email,
          name: targetUser.name,
          avatar_url: targetUser.avatar_url,
          created_at: targetUser.created_at,
          updated_at: targetUser.updated_at,
        },
      },
      req,
      res,
      { operation: 'get_user' }
    );
  } catch (error) {
    handleApiError('get_user', error, req, res, 'Failed to get user');
  }
});

/**
 * PUT /api/users/:id
 * Update user (admin or self)
 */
router.put('/:id', async (req, res) => {
  logApiRequest(req, { operation: 'update_user' });

  try {
    // Get CivicPress instance from request
    const civicPress = (req as any).civicPress as CivicPress;
    const authService = civicPress.getAuthService();

    const identifier = req.params.id;
    let userId: number | undefined;
    let targetUser: any;

    // Try username lookup first, then fall back to ID if not found
    targetUser = await authService.getUserByUsername(identifier);
    if (targetUser) {
      userId = targetUser.id;
    } else {
      // If username not found and identifier is numeric, try as ID
      if (/^\d+$/.test(identifier)) {
        userId = parseInt(identifier);
        if (!isNaN(userId)) {
          targetUser = await authService.getUserById(userId);
        }
      }
    }

    const userData: UpdateUserRequest = req.body;

    // Check authentication
    const user = (req as any).user;
    if (!user) {
      return handleApiError(
        'update_user',
        new Error('Authentication required'),
        req,
        res,
        'Authentication required'
      );
    }

    // Check if user was found
    if (!targetUser) {
      const error = new Error('User not found');
      (error as any).statusCode = 404;
      (error as any).code = 'USER_NOT_FOUND';
      return handleApiError('update_user', error, req, res);
    }

    // Check if user can update this user (admin or self)
    const canManageUsers = await authService.userCan(user, 'users:manage');
    const isSelf = userId !== undefined && user.id === userId;

    if (!canManageUsers && !isSelf) {
      const error = new Error('Insufficient permissions to update user');
      (error as any).statusCode = 403;
      (error as any).code = 'INSUFFICIENT_PERMISSIONS';
      return handleApiError('update_user', error, req, res);
    }

    // Non-admin users can only update their own basic info
    if (!canManageUsers && isSelf) {
      // Remove restricted fields for non-admin users
      delete userData.role;
    }

    // Validate role if provided and user is admin
    if (
      userData.role &&
      canManageUsers &&
      !(await authService.isValidRole(userData.role))
    ) {
      const error = new Error(`Invalid role: ${userData.role}`);
      (error as any).statusCode = 400;
      (error as any).code = 'INVALID_ROLE';
      (error as any).details = {
        role: userData.role,
        availableRoles: await authService.getAvailableRoles(),
      };
      return handleApiError('update_user', error, req, res);
    }

    // Hash password if provided (with security guards)
    let passwordHash: string | undefined;
    if (userData.password) {
      // SECURITY GUARD: Check if user can set password (prevent external auth users)
      if (!authService.canSetPassword(targetUser)) {
        const provider = authService.getUserAuthProvider(targetUser);
        const error = new Error(
          `Users authenticated via ${provider} cannot set passwords. Password management is handled by the external provider.`
        );
        (error as any).statusCode = 400;
        (error as any).code = 'EXTERNAL_AUTH_PASSWORD_FORBIDDEN';
        return handleApiError('update_user', error, req, res);
      }

      const bcrypt = await import('bcrypt');
      const saltRounds = 12;
      passwordHash = await bcrypt.hash(userData.password, saltRounds);
    }

    // Update user
    if (!userId) {
      const error = new Error('User not found');
      (error as any).statusCode = 404;
      (error as any).code = 'USER_NOT_FOUND';
      return handleApiError('update_user', error, req, res);
    }

    const updatedUser = await authService.updateUser(userId, {
      email: userData.email,
      name: userData.name,
      role: userData.role,
      passwordHash,
      avatar_url: userData.avatar_url,
    });

    if (!updatedUser) {
      const error = new Error('User not found');
      (error as any).statusCode = 404;
      (error as any).code = 'USER_NOT_FOUND';
      return handleApiError('update_user', error, req, res);
    }

    sendSuccess(
      {
        user: {
          id: updatedUser.user?.id,
          username: updatedUser.user?.username,
          role: updatedUser.user?.role,
          email: updatedUser.user?.email,
          name: updatedUser.user?.name,
          avatar_url: updatedUser.user?.avatar_url,
          updated_at: updatedUser.user?.updated_at,
        },
      },
      req,
      res,
      { operation: 'update_user' }
    );
    const actor: any = (req as any).user || {};
    await audit.log({
      source: 'api',
      actor: { id: actor.id, username: actor.username, role: actor.role },
      action: 'users:update',
      target: {
        type: 'user',
        id: updatedUser.user?.id,
        name: updatedUser.user?.username,
      },
      outcome: 'success',
    });
  } catch (error) {
    const actor: any = (req as any).user || {};
    const idParam = (req as any).params?.id;
    await audit.log({
      source: 'api',
      actor: { id: actor.id, username: actor.username, role: actor.role },
      action: 'users:update',
      target: { type: 'user', id: idParam },
      outcome: 'failure',
      message: String(error),
    });
    handleApiError('update_user', error, req, res, 'Failed to update user');
  }
});

/**
 * DELETE /api/users/:id
 * Delete user (admin only)
 */
router.delete('/:id', async (req, res) => {
  logApiRequest(req, { operation: 'delete_user' });

  try {
    // Get CivicPress instance from request
    const civicPress = (req as any).civicPress as CivicPress;
    const authService = civicPress.getAuthService();

    const identifier = req.params.id;
    let userId: number | undefined;
    let targetUser: any;

    // Try username lookup first, then fall back to ID if not found
    targetUser = await authService.getUserByUsername(identifier);
    if (targetUser) {
      userId = targetUser.id;
    } else {
      // If username not found and identifier is numeric, try as ID
      if (/^\d+$/.test(identifier)) {
        userId = parseInt(identifier);
        if (!isNaN(userId)) {
          targetUser = await authService.getUserById(userId);
        }
      }
    }

    // Check authentication
    const user = (req as any).user;
    if (!user) {
      return handleApiError(
        'delete_user',
        new Error('Authentication required'),
        req,
        res,
        'Authentication required'
      );
    }

    // Check if user was found
    if (!targetUser) {
      const error = new Error('User not found');
      (error as any).statusCode = 404;
      (error as any).code = 'USER_NOT_FOUND';
      return handleApiError('delete_user', error, req, res);
    }

    // Check if user can manage users
    const canManageUsers = await authService.userCan(user, 'users:manage');
    if (!canManageUsers) {
      const error = new Error('Insufficient permissions to delete users');
      (error as any).statusCode = 403;
      (error as any).code = 'INSUFFICIENT_PERMISSIONS';
      return handleApiError('delete_user', error, req, res);
    }

    // Prevent self-deletion
    if (userId !== undefined && user.id === userId) {
      const error = new Error('Cannot delete your own account');
      (error as any).statusCode = 400;
      (error as any).code = 'SELF_DELETION_NOT_ALLOWED';
      return handleApiError('delete_user', error, req, res);
    }

    // Delete user
    if (!userId) {
      const error = new Error('User not found');
      (error as any).statusCode = 404;
      (error as any).code = 'USER_NOT_FOUND';
      return handleApiError('delete_user', error, req, res);
    }

    const deleted = await authService.deleteUser(userId);
    if (!deleted) {
      const error = new Error('User not found');
      (error as any).statusCode = 404;
      (error as any).code = 'USER_NOT_FOUND';
      return handleApiError('delete_user', error, req, res);
    }

    sendSuccess(
      {
        message: 'User deleted successfully',
        userId,
      },
      req,
      res,
      { operation: 'delete_user' }
    );
    const actor: any = (req as any).user || {};
    await audit.log({
      source: 'api',
      actor: { id: actor.id, username: actor.username, role: actor.role },
      action: 'users:delete',
      target: { type: 'user', id: userId },
      outcome: 'success',
    });
  } catch (error) {
    const actor: any = (req as any).user || {};
    const idParam = (req as any).params?.id;
    await audit.log({
      source: 'api',
      actor: { id: actor.id, username: actor.username, role: actor.role },
      action: 'users:delete',
      target: { type: 'user', id: idParam },
      outcome: 'failure',
      message: String(error),
    });
    handleApiError('delete_user', error, req, res, 'Failed to delete user');
  }
});

/**
 * POST /register
 * Public user registration (no authentication required)
 */
registrationRouter.post('/', async (req, res) => {
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
    const civicPress = (req as any).context?.civicPress as CivicPress;
    if (!civicPress) {
      const error = new Error('CivicPress instance not available');
      (error as any).statusCode = 500;
      return handleApiError('register_user', error, req, res);
    }

    const authService = civicPress.getAuthService();

    // Check if username already exists
    const existingUser = await authService.getUserByUsername(userData.username);
    if (existingUser) {
      const error = new Error('Username already exists');
      (error as any).statusCode = 409;
      (error as any).code = 'USERNAME_EXISTS';
      return handleApiError('register_user', error, req, res);
    }

    // Hash password
    const bcrypt = await import('bcrypt');
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(userData.password, saltRounds);

    // Create user with default role (usually 'public')
    // Use username as name if no name is provided
    const userName = userData.name || userData.username;
    const newUser = await authService.createUserWithPassword({
      username: userData.username,
      email: userData.email,
      name: userName,
      role: userData.role || 'public', // Default to 'public' role
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
    console.error(error instanceof Error ? error.stack : 'No stack');
    handleApiError('register_user', error, req, res, 'Failed to register user');
  }
});

/**
 * POST /auth/password
 * Authenticate with username and password (no authentication required)
 */
authenticationRouter.post('/password', async (req, res) => {
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
    const civicPress = (req as any).civicPress as CivicPress;
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

// ===============================
// NEW SECURITY ENDPOINTS
// ===============================

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
 * POST /api/users/verify-email-change
 * Complete email change with verification token (no auth required)
 */
publicRouter.post('/', async (req, res) => {
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
    const civicPress = (req as any).context?.civicPress as CivicPress;
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
 * GET /api/users/:id/security-info
 * Get user security information (auth provider, email verification status, etc.)
 */
router.get('/:id/security-info', async (req, res) => {
  logApiRequest(req, { operation: 'get_security_info' });

  try {
    const userId = parseInt(req.params.id);
    const requestingUser = (req as any).user;

    // Users can only view their own security info, unless they're admin
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
          'get_security_info',
          error,
          req,
          res,
          'You can only view your own security information'
        );
      }
    }

    // Get user by ID
    const user = await authService.getUserById(userId);
    if (!user) {
      const error = new Error('User not found');
      (error as any).statusCode = 404;
      return handleApiError(
        'get_security_info',
        error,
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

/**
 * POST /api/users/verify-current-email
 * Verify current email address with token (no auth required)
 */
emailVerificationRouter.post('/', async (req, res) => {
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
    const civicPress = (req as any).context?.civicPress as CivicPress;
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

export {
  router,
  registrationRouter,
  authenticationRouter,
  publicRouter,
  emailVerificationRouter,
};
