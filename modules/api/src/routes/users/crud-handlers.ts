import { Router } from 'express';
import { HttpError } from '../../utils/http-error.js';
import { CivicPress } from '@civicpress/core';
import type { AuthUser } from '@civicpress/core';
import {
  logApiRequest,
  sendSuccess,
  handleApiError,
} from '../../utils/api-logger.js';
import {
  audit,
  CreateUserRequest,
  UpdateUserRequest,
} from './handlers-common.js';

export function registerCrudRoutes(router: Router): void {
  /**
   * GET /api/users
   * List all users (admin only)
   */
  router.get('/', async (req, res) => {
    logApiRequest(req, { operation: 'list_users' });

    try {
      // Check if user has permission to list users
      const user = req.user;
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
      const civicPress = req.civicPress as CivicPress;
      const authService = civicPress.getAuthService();

      // Check if user can manage users
      const canManageUsers = await authService.userCan(user, 'users:manage');
      if (!canManageUsers) {
        // DEBUG: Get user permissions to see what's loaded
        const userPermissions = await authService.getUserPermissions(user);
        const error = new HttpError(403, `Insufficient permissions to list users. User ${user.username} (${user.role}) has permissions: ${userPermissions.join(', ')}`, 'INSUFFICIENT_PERMISSIONS');
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
      const user = req.user;
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
      const civicPress = req.civicPress as CivicPress;
      const authService = civicPress.getAuthService();

      // Check if user can manage users
      const canManageUsers = await authService.userCan(user, 'users:manage');
      if (!canManageUsers) {
        const error = new HttpError(403, 'Insufficient permissions to create users', 'INSUFFICIENT_PERMISSIONS');
        return handleApiError('create_user', error, req, res);
      }

      // Validate role if provided
      if (userData.role && !(await authService.isValidRole(userData.role))) {
        const error = new HttpError(400, `Invalid role: ${userData.role}`, 'INVALID_ROLE', { details: {
          role: userData.role,
          availableRoles: await authService.getAvailableRoles(),
        } });
    return handleApiError('create_user', error, req, res);
      }

      // Hash password if provided
      let passwordHash: string | undefined;
      if (userData.password) {
        // Enforce the password policy — this admin create route hashes
        // inline, so it must run the check itself (like register + CLI).
        const policy = authService.validatePasswordPolicy(userData.password);
        if (!policy.valid) {
          const error = new HttpError(
            400,
            `Password does not meet requirements: ${policy.errors.join('; ')}`,
            'WEAK_PASSWORD'
          );
          return handleApiError('create_user', error, req, res);
        }
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
        const actor: Partial<AuthUser> = req.user ?? {};
        await audit.log({
          source: 'api',
          actor: { id: actor.id, username: actor.username, role: actor.role },
          action: 'users:create',
          target: { type: 'user', id: newUser.id, name: newUser.username },
          outcome: 'success',
        });
      } catch {
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
        const actor: Partial<AuthUser> = req.user ?? {};
        const body = req.body || {};
        await audit.log({
          source: 'api',
          actor: { id: actor.id, username: actor.username, role: actor.role },
          action: 'users:create',
          target: { type: 'user', name: body?.username },
          outcome: 'failure',
          message: String(error),
        });
      } catch {
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
      const civicPress = req.civicPress as CivicPress;
      const authService = civicPress.getAuthService();

      const identifier = req.params.id;
      let userId: number | undefined;
      let targetUser: AuthUser | null | undefined;

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
      const user = req.user;
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
        const error = new HttpError(403, 'Insufficient permissions to view user', 'INSUFFICIENT_PERMISSIONS');
        return handleApiError('get_user', error, req, res);
      }

      // Check if user was found
      if (!targetUser) {
        const error = new HttpError(404, 'User not found', 'USER_NOT_FOUND');
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
      const civicPress = req.civicPress as CivicPress;
      const authService = civicPress.getAuthService();

      const identifier = req.params.id;
      let userId: number | undefined;
      let targetUser: AuthUser | null | undefined;

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
      const user = req.user;
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
        const error = new HttpError(404, 'User not found', 'USER_NOT_FOUND');
        return handleApiError('update_user', error, req, res);
      }

      // Check if user can update this user (admin or self)
      const canManageUsers = await authService.userCan(user, 'users:manage');
      const isSelf = userId !== undefined && user.id === userId;

      if (!canManageUsers && !isSelf) {
        const error = new HttpError(403, 'Insufficient permissions to update user', 'INSUFFICIENT_PERMISSIONS');
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
        const error = new HttpError(400, `Invalid role: ${userData.role}`, 'INVALID_ROLE', { details: {
          role: userData.role,
          availableRoles: await authService.getAvailableRoles(),
        } });
    return handleApiError('update_user', error, req, res);
      }

      // Hash password if provided (with security guards)
      let passwordHash: string | undefined;
      if (userData.password) {
        // SECURITY GUARD: Check if user can set password (prevent external auth users)
        if (!authService.canSetPassword(targetUser)) {
          const provider = authService.getUserAuthProvider(targetUser);
          // 403 (not 400): this is an authorization refusal, and the error code
          // literally says FORBIDDEN. "external authentication" wording matches
          // the change-password / set-password guards and the API docs.
          const error = new HttpError(403,
            `Users authenticated via ${provider} cannot set passwords. Password management is handled by the external authentication.`
          , 'EXTERNAL_AUTH_PASSWORD_FORBIDDEN');
          return handleApiError('update_user', error, req, res);
        }

        // Enforce the password policy — this admin update route hashes
        // inline (unlike POST /:id/set-password, which goes through
        // PasswordOps), so it must run the check itself.
        const policy = authService.validatePasswordPolicy(userData.password);
        if (!policy.valid) {
          const error = new HttpError(
            400,
            `Password does not meet requirements: ${policy.errors.join('; ')}`,
            'WEAK_PASSWORD'
          );
          return handleApiError('update_user', error, req, res);
        }

        const bcrypt = await import('bcrypt');
        const saltRounds = 12;
        passwordHash = await bcrypt.hash(userData.password, saltRounds);
      }

      // Update user
      if (!userId) {
        const error = new HttpError(404, 'User not found', 'USER_NOT_FOUND');
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
        const error = new HttpError(404, 'User not found', 'USER_NOT_FOUND');
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
      const actor: Partial<AuthUser> = req.user ?? {};
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
      const actor: Partial<AuthUser> = req.user ?? {};
      const idParam = req.params?.id;
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
      const civicPress = req.civicPress as CivicPress;
      const authService = civicPress.getAuthService();

      const identifier = req.params.id;
      let userId: number | undefined;
      let targetUser: AuthUser | null | undefined;

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
      const user = req.user;
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
        const error = new HttpError(404, 'User not found', 'USER_NOT_FOUND');
        return handleApiError('delete_user', error, req, res);
      }

      // Check if user can manage users
      const canManageUsers = await authService.userCan(user, 'users:manage');
      if (!canManageUsers) {
        const error = new HttpError(403, 'Insufficient permissions to delete users', 'INSUFFICIENT_PERMISSIONS');
        return handleApiError('delete_user', error, req, res);
      }

      // Prevent self-deletion
      if (userId !== undefined && user.id === userId) {
        const error = new HttpError(400, 'Cannot delete your own account', 'SELF_DELETION_NOT_ALLOWED');
        return handleApiError('delete_user', error, req, res);
      }

      // Delete user
      if (!userId) {
        const error = new HttpError(404, 'User not found', 'USER_NOT_FOUND');
        return handleApiError('delete_user', error, req, res);
      }

      const deleted = await authService.deleteUser(userId);
      if (!deleted) {
        const error = new HttpError(404, 'User not found', 'USER_NOT_FOUND');
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
      const actor: Partial<AuthUser> = req.user ?? {};
      await audit.log({
        source: 'api',
        actor: { id: actor.id, username: actor.username, role: actor.role },
        action: 'users:delete',
        target: { type: 'user', id: userId },
        outcome: 'success',
      });
    } catch (error) {
      const actor: Partial<AuthUser> = req.user ?? {};
      const idParam = req.params?.id;
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
}
