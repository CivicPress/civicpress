import { Router } from 'express';
import { CivicPress } from '@civicpress/core';
import {
  sendSuccess,
  handleApiError,
  logApiRequest,
} from '../utils/api-logger';

const router = Router();

// Types for user management
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
      const error = new Error('Insufficient permissions to list users');
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
    const newUser = await authService.createUserWithPassword({
      username: userData.username,
      email: userData.email,
      name: userData.name,
      role: userData.role,
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
      },
      req,
      res,
      { operation: 'create_user' }
    );
  } catch (error) {
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
    const userId = parseInt(req.params.id);
    if (isNaN(userId)) {
      return handleApiError(
        'get_user',
        new Error('Invalid user ID'),
        req,
        res,
        'Invalid user ID'
      );
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

    // Get CivicPress instance from request
    const civicPress = (req as any).civicPress as CivicPress;
    const authService = civicPress.getAuthService();

    // Check if user can view this user (admin or self)
    const canManageUsers = await authService.userCan(user, 'users:manage');
    const isSelf = user.id === userId;

    if (!canManageUsers && !isSelf) {
      const error = new Error('Insufficient permissions to view user');
      (error as any).statusCode = 403;
      (error as any).code = 'INSUFFICIENT_PERMISSIONS';
      return handleApiError('get_user', error, req, res);
    }

    // Get user
    const targetUser = await authService.getUserById(userId);
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
    const userId = parseInt(req.params.id);
    if (isNaN(userId)) {
      return handleApiError(
        'update_user',
        new Error('Invalid user ID'),
        req,
        res,
        'Invalid user ID'
      );
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

    // Get CivicPress instance from request
    const civicPress = (req as any).civicPress as CivicPress;
    const authService = civicPress.getAuthService();

    // Check if user can update this user (admin or self)
    const canManageUsers = await authService.userCan(user, 'users:manage');
    const isSelf = user.id === userId;

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

    // Hash password if provided
    let passwordHash: string | undefined;
    if (userData.password) {
      const bcrypt = await import('bcrypt');
      const saltRounds = 12;
      passwordHash = await bcrypt.hash(userData.password, saltRounds);
    }

    // Update user
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
          id: updatedUser.id,
          username: updatedUser.username,
          role: updatedUser.role,
          email: updatedUser.email,
          name: updatedUser.name,
          avatar_url: updatedUser.avatar_url,
          updated_at: updatedUser.updated_at,
        },
      },
      req,
      res,
      { operation: 'update_user' }
    );
  } catch (error) {
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
    const userId = parseInt(req.params.id);
    if (isNaN(userId)) {
      return handleApiError(
        'delete_user',
        new Error('Invalid user ID'),
        req,
        res,
        'Invalid user ID'
      );
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

    // Get CivicPress instance from request
    const civicPress = (req as any).civicPress as CivicPress;
    const authService = civicPress.getAuthService();

    // Check if user can manage users
    const canManageUsers = await authService.userCan(user, 'users:manage');
    if (!canManageUsers) {
      const error = new Error('Insufficient permissions to delete users');
      (error as any).statusCode = 403;
      (error as any).code = 'INSUFFICIENT_PERMISSIONS';
      return handleApiError('delete_user', error, req, res);
    }

    // Prevent self-deletion
    if (user.id === userId) {
      const error = new Error('Cannot delete your own account');
      (error as any).statusCode = 400;
      (error as any).code = 'SELF_DELETION_NOT_ALLOWED';
      return handleApiError('delete_user', error, req, res);
    }

    // Delete user
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
  } catch (error) {
    handleApiError('delete_user', error, req, res, 'Failed to delete user');
  }
});

/**
 * POST /api/users/auth/password
 * Authenticate with username and password
 */
router.post('/auth/password', async (req, res) => {
  logApiRequest(req, { operation: 'password_auth' });

  try {
    const { username, password }: PasswordAuthRequest = req.body;

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
    handleApiError(
      'password_auth',
      error,
      req,
      res,
      'Password authentication failed'
    );
  }
});

export default router;
