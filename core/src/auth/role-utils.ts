import { AuthUser } from './auth-service.js';
import { RoleManager } from './role-manager.js';

/**
 * Utility functions for role-based authorization
 * Provides easy access to userCan() and related functions
 */

let roleManager: RoleManager | null = null;

/**
 * Initialize the role manager
 * @param dataDir - The data directory path
 */
export function initializeRoleManager(dataDir: string): void {
  roleManager = new RoleManager(dataDir);
}

/**
 * Get the role manager instance
 * @returns The role manager instance
 */
export function getRoleManager(): RoleManager {
  if (!roleManager) {
    throw new Error(
      'RoleManager not initialized. Call initializeRoleManager() first.'
    );
  }
  return roleManager;
}

/**
 * Check if a user can perform a specific action
 * @param user - The authenticated user
 * @param permission - The permission to check (e.g., 'records:create', 'system:admin')
 * @param context - Optional context for the permission check
 * @returns boolean indicating if the user has permission
 */
export async function userCan(
  user: AuthUser,
  permission: string | string[],
  context?: {
    recordType?: string;
    action?: 'create' | 'edit' | 'delete' | 'view';
    fromStatus?: string;
    toStatus?: string;
  }
): Promise<boolean> {
  return getRoleManager().userCan(user, permission, context);
}

/**
 * Check if a user has a specific role
 * @param user - The authenticated user
 * @param role - The role to check (can be array for multiple roles)
 * @returns boolean indicating if the user has the role
 */
export async function userHasRole(
  user: AuthUser,
  role: string | string[]
): Promise<boolean> {
  return getRoleManager().userHasRole(user, role);
}

/**
 * Get all permissions for a user (including inherited permissions)
 * @param user - The authenticated user
 * @returns Array of permission strings
 */
export async function getUserPermissions(user: AuthUser): Promise<string[]> {
  return getRoleManager().getUserPermissions(user);
}

/**
 * Get the default role for new users
 * @returns The default role name
 */
export async function getDefaultRole(): Promise<string> {
  return getRoleManager().getDefaultRole();
}

/**
 * Get all available roles
 * @returns Array of role names
 */
export async function getAvailableRoles(): Promise<string[]> {
  return getRoleManager().getAvailableRoles();
}

/**
 * Validate a role exists
 * @param role - The role to validate
 * @returns boolean indicating if the role exists
 */
export async function isValidRole(role: string): Promise<boolean> {
  return getRoleManager().isValidRole(role);
}

/**
 * Check if user can create records of a specific type
 * @param user - The authenticated user
 * @param recordType - The record type to check
 * @returns boolean indicating if the user can create this record type
 */
export async function userCanCreate(
  user: AuthUser,
  recordType: string
): Promise<boolean> {
  return userCan(user, 'records:create', { recordType, action: 'create' });
}

/**
 * Check if user can edit records of a specific type
 * @param user - The authenticated user
 * @param recordType - The record type to check
 * @returns boolean indicating if the user can edit this record type
 */
export async function userCanEdit(
  user: AuthUser,
  recordType: string
): Promise<boolean> {
  return userCan(user, 'records:edit', { recordType, action: 'edit' });
}

/**
 * Check if user can delete records of a specific type
 * @param user - The authenticated user
 * @param recordType - The record type to check
 * @returns boolean indicating if the user can delete this record type
 */
export async function userCanDelete(
  user: AuthUser,
  recordType: string
): Promise<boolean> {
  return userCan(user, 'records:delete', { recordType, action: 'delete' });
}

/**
 * Check if user can view records of a specific type
 * @param user - The authenticated user
 * @param recordType - The record type to check
 * @returns boolean indicating if the user can view this record type
 */
export async function userCanView(
  user: AuthUser,
  recordType: string
): Promise<boolean> {
  return userCan(user, 'records:view', { recordType, action: 'view' });
}

/**
 * Check if user can transition a record from one status to another
 * @param user - The authenticated user
 * @param fromStatus - The current status
 * @param toStatus - The target status
 * @returns boolean indicating if the user can perform this transition
 */
export async function userCanTransition(
  user: AuthUser,
  fromStatus: string,
  toStatus: string
): Promise<boolean> {
  return userCan(user, 'workflows:manage', { fromStatus, toStatus });
}

/**
 * Check if user has admin privileges
 * @param user - The authenticated user
 * @returns boolean indicating if the user has admin privileges
 */
export async function userIsAdmin(user: AuthUser): Promise<boolean> {
  return userCan(user, 'system:admin');
}

/**
 * Check if user can manage workflows
 * @param user - The authenticated user
 * @returns boolean indicating if the user can manage workflows
 */
export async function userCanManageWorkflows(user: AuthUser): Promise<boolean> {
  return userCan(user, 'workflows:manage');
}

/**
 * Check if user can manage templates
 * @param user - The authenticated user
 * @returns boolean indicating if the user can manage templates
 */
export async function userCanManageTemplates(user: AuthUser): Promise<boolean> {
  return userCan(user, 'templates:manage');
}

/**
 * Check if user can manage hooks
 * @param user - The authenticated user
 * @returns boolean indicating if the user can manage hooks
 */
export async function userCanManageHooks(user: AuthUser): Promise<boolean> {
  return userCan(user, 'hooks:manage');
}

/**
 * Check if user can manage users
 * @param user - The authenticated user
 * @returns boolean indicating if the user can manage users
 */
export async function userCanManageUsers(user: AuthUser): Promise<boolean> {
  return userCan(user, 'users:manage');
}
