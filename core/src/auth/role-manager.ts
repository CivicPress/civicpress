import { readFile } from 'fs/promises';
import { join } from 'path';
import * as fs from 'fs';
import { getLogger } from '../utils/logger.js';
import yaml from 'js-yaml';
import { AuthUser } from './auth-service.js';
import { getDefaultRolesConfig } from './role-manager/default-config.js';

const logger = getLogger();

export interface RoleConfig {
  name:
    | string
    | { value: string; type: string; description: string; required: boolean };
  description:
    | string
    | { value: string; type: string; description: string; required: boolean };
  permissions:
    | string[]
    | { value: string[]; type: string; description: string; required: boolean };
  record_types?: {
    can_create?: string[];
    can_edit?: string[];
    can_delete?: string[];
    can_view?: string[];
  };
  status_transitions?:
    | Record<string, string[]>
    | { value: string[]; type: string; description: string; required: boolean };
}

export interface RolesConfig {
  default_role:
    | string
    | { value: string; type: string; description: string; required: boolean };
  roles: Record<string, RoleConfig>;
  permissions: Record<string, PermissionConfig>;
  role_hierarchy: Record<
    string,
    | string[]
    | { value: string[]; type: string; description: string; required: boolean }
  >;
}

export interface PermissionConfig {
  description: string;
  level: 'system' | 'record' | 'workflow' | 'template' | 'hook' | 'user';
}

export class RoleManager {
  private configPath: string;
  private config: RolesConfig | null = null;

  constructor(dataDir: string) {
    this.configPath = join(dataDir, '.civic', 'roles.yml');
    logger.debug(`[RoleManager] Constructor called with dataDir: ${dataDir}`);
    logger.debug(`[RoleManager] Config path set to: ${this.configPath}`);
  }

  /**
   * Clear the cached configuration to force a reload
   */
  clearCache(): void {
    this.config = null;
    logger.debug('[RoleManager] Configuration cache cleared');
  }

  /**
   * Check if a user can perform a specific action
   * @param user - The authenticated user
   * @param permission - The permission to check (e.g., 'records:create', 'system:admin')
   * @param context - Optional context for the permission check
   * @returns boolean indicating if the user has permission
   */
  async userCan(
    user: AuthUser,
    permission: string | string[],
    context?: {
      recordType?: string;
      action?: 'create' | 'edit' | 'delete' | 'view';
      fromStatus?: string;
      toStatus?: string;
    }
  ): Promise<boolean> {
    try {
      logger.debug(
        `[RoleManager] userCan called for user '${user.username}' (role: ${user.role}) with permission: ${JSON.stringify(permission)}`
      );

      const config = await this.loadConfig();
      const userRole = user.role;

      logger.debug(
        `[RoleManager] Loaded config with roles: ${Object.keys(config.roles).join(', ')}`
      );

      // Handle array of permissions (any permission grants access)
      if (Array.isArray(permission)) {
        logger.debug(
          `[RoleManager] Checking array of permissions: ${permission.join(', ')}`
        );
        const results = await Promise.all(
          permission.map((p) =>
            this.checkPermission(userRole, p, config, context)
          )
        );
        return results.some(Boolean);
      }

      logger.debug(`[RoleManager] Checking single permission: ${permission}`);
      return await this.checkPermission(userRole, permission, config, context);
    } catch (error) {
      logger.error('Role check failed:', error);
      return false;
    }
  }

  /**
   * Check if a user has a specific role
   * @param user - The authenticated user
   * @param role - The role to check (can be array for multiple roles)
   * @returns boolean indicating if the user has the role
   */
  async userHasRole(user: AuthUser, role: string | string[]): Promise<boolean> {
    const userRole = user.role;

    if (Array.isArray(role)) {
      return role.includes(userRole);
    }

    return userRole === role;
  }

  /**
   * Get all permissions for a user (including inherited permissions)
   * @param user - The authenticated user
   * @returns Array of permission strings
   */
  async getUserPermissions(user: AuthUser): Promise<string[]> {
    try {
      const config = await this.loadConfig();
      const userRole = user.role;

      return this.getRolePermissions(userRole, config);
    } catch (error) {
      logger.error('Failed to get user permissions:', error);
      return [];
    }
  }

  /**
   * Get the default role for new users
   * @returns The default role name
   */
  async getDefaultRole(): Promise<string> {
    try {
      const config = await this.loadConfig();

      // Handle both old format (direct string) and new format (metadata object)
      if (typeof config.default_role === 'string') {
        // Old format: direct string
        return config.default_role;
      } else if (
        config.default_role &&
        typeof config.default_role === 'object' &&
        'value' in config.default_role
      ) {
        // New format: metadata object with value
        return config.default_role.value;
      }

      // Fallback
      return 'public';
    } catch (error) {
      logger.error('Failed to get default role:', error);
      return 'public';
    }
  }

  /**
   * Get all available roles
   * @returns Array of role names
   */
  async getAvailableRoles(): Promise<string[]> {
    try {
      const config = await this.loadConfig();
      return Object.keys(config.roles);
    } catch (error) {
      logger.error('Failed to get available roles:', error);
      return ['public'];
    }
  }

  /**
   * Get detailed configuration for a specific role
   * @param role - The role to get configuration for
   * @returns RoleConfig or null if role doesn't exist
   */
  async getRoleConfig(role: string): Promise<RoleConfig | null> {
    try {
      const config = await this.loadConfig();
      const roleConfig = config.roles[role];

      if (!roleConfig) {
        logger.debug(`[RoleManager] Role '${role}' not found in configuration`);
        return null;
      }

      return roleConfig;
    } catch (error) {
      logger.error(
        `[RoleManager] Failed to get role config for '${role}':`,
        error
      );
      return null;
    }
  }

  /**
   * Validate a role exists
   * @param role - The role to validate
   * @returns boolean indicating if the role exists
   */
  async isValidRole(role: string): Promise<boolean> {
    try {
      const config = await this.loadConfig();
      const availableRoles = Object.keys(config.roles);
      const isValid = availableRoles.includes(role);
      logger.debug(
        `[RoleManager] isValidRole('${role}') available: [${availableRoles.join(', ')}] result: ${isValid}`
      );
      return isValid;
    } catch (error) {
      logger.error('[RoleManager] Failed to validate role:', error);
      return false;
    }
  }

  /**
   * Force reload the configuration (useful for testing)
   */
  async reloadConfig(): Promise<void> {
    this.config = null;
    await this.loadConfig();
  }

  private async loadConfig(): Promise<RolesConfig> {
    if (this.config) {
      logger.debug(
        `[RoleManager] Returning cached config for: ${this.configPath}`
      );
      return this.config;
    }

    try {
      logger.debug(
        `[RoleManager] Attempting to load roles config from: ${this.configPath}`
      );
      const fileExists = fs.existsSync(this.configPath);
      logger.debug(`[RoleManager] roles.yml exists: ${fileExists}`);
      if (!fileExists) {
        logger.info(`[RoleManager] roles.yml not found, using default config`);
        this.config = this.getDefaultConfig();
        return this.config;
      }

      const content = await readFile(this.configPath, 'utf-8');
      logger.debug(
        `[RoleManager] File content length: ${content.length} characters`
      );
      // omit preview for less verbosity

      const parsedConfig = yaml.load(content) as RolesConfig;
      logger.debug(
        `[RoleManager] Loaded roles: ${Object.keys(parsedConfig.roles).join(', ')}`
      );

      // Reduce verbose debug output: keep only essential info-level logs
      if (!parsedConfig.roles.admin) {
        logger.warn(`[RoleManager] Admin role not found in parsed config`);
      }

      this.config = parsedConfig;
      return this.config;
    } catch (error) {
      logger.warn(
        '[RoleManager] Failed to load roles config, using defaults:',
        error
      );
      this.config = this.getDefaultConfig();
      return this.config;
    }
  }

  private async checkPermission(
    userRole: string,
    permission: string,
    config: RolesConfig,
    context?: {
      recordType?: string;
      action?: 'create' | 'edit' | 'delete' | 'view';
      fromStatus?: string;
      toStatus?: string;
    }
  ): Promise<boolean> {
    logger.info(
      `[RoleManager] Checking permission '${permission}' for role '${userRole}'`
    );

    // If status transition context is present, only check status_transitions
    if (context?.fromStatus && context?.toStatus) {
      const roleConfig = config.roles[userRole];
      if (roleConfig) {
        if (roleConfig.status_transitions) {
          // Handle both old format (direct array) and new format (metadata with value)
          const statusTransitions = Array.isArray(roleConfig.status_transitions)
            ? roleConfig.status_transitions
            : roleConfig.status_transitions.value;

          // statusTransitions should be an object with status keys, not an array
          if (Array.isArray(statusTransitions)) {
            // If it's an array, it's the old format - no status-specific transitions
            return false;
          }

          const allowedTransitions =
            statusTransitions[context.fromStatus] ||
            statusTransitions['any'] ||
            [];
          if (
            Array.isArray(allowedTransitions) &&
            (allowedTransitions as string[]).includes(context.toStatus)
          ) {
            return true;
          }
        }
        // Role exists but does not allow this transition
        return false;
      }
      // If role doesn't exist, check public role for status transitions
      const publicRole = config.roles['public'];
      if (publicRole?.status_transitions) {
        // Handle both old format (direct array) and new format (metadata with value)
        const publicStatusTransitions = Array.isArray(
          publicRole.status_transitions
        )
          ? publicRole.status_transitions
          : publicRole.status_transitions.value;

        // publicStatusTransitions should be an object with status keys, not an array
        if (Array.isArray(publicStatusTransitions)) {
          // If it's an array, it's the old format - no status-specific transitions
          return false;
        }

        const publicAllowedTransitions =
          publicStatusTransitions[context.fromStatus] ||
          publicStatusTransitions['any'] ||
          [];
        if (
          Array.isArray(publicAllowedTransitions) &&
          (publicAllowedTransitions as string[]).includes(context.toStatus)
        ) {
          return true;
        }
      }
      return false;
    }

    // Get all permissions for the user role (including inherited permissions)
    const userPermissions = await this.getRolePermissions(userRole, config);
    logger.debug(`[RoleManager] Computed permissions for role '${userRole}'`);

    // Remove verbose debug output of permissions content

    // Check if user has the specific permission
    if (userPermissions.includes(permission)) {
      logger.debug(
        `[RoleManager] Permission '${permission}' granted - found in user permissions`
      );
      return true;
    }

    // Check if user has wildcard permission ('*')
    if (userPermissions.includes('*')) {
      logger.debug(
        `[RoleManager] Permission '${permission}' granted - user has wildcard '*' permission`
      );
      return true;
    }

    // Check record type specific permissions
    if (context?.recordType && context?.action) {
      const roleConfig = config.roles[userRole];
      if (roleConfig?.record_types) {
        const recordTypePermissions =
          roleConfig.record_types[`can_${context.action}`];
        if (recordTypePermissions?.includes(context.recordType)) {
          return true;
        }
      }

      // If role doesn't exist, check public role for record type permissions
      if (!roleConfig) {
        const publicRole = config.roles['public'];
        if (publicRole?.record_types) {
          const publicRecordTypePermissions =
            publicRole.record_types[`can_${context.action}`];
          if (publicRecordTypePermissions?.includes(context.recordType)) {
            return true;
          }
        }
      }
    }

    logger.debug(
      `[RoleManager] Permission '${permission}' denied for role '${userRole}'`
    );
    return false;
  }

  private getRolePermissions(role: string, config: RolesConfig): string[] {
    const permissions = new Set<string>();

    logger.debug(`[RoleManager] Getting permissions for role: ${role}`);

    // Get direct permissions for the role
    const roleConfig = config.roles[role];
    logger.debug(
      `[RoleManager] Role config for ${role}:`,
      JSON.stringify(roleConfig, null, 2)
    );

    if (roleConfig?.permissions) {
      logger.debug(
        `[RoleManager] Role ${role} has permissions field:`,
        roleConfig.permissions
      );

      // Handle both old format (direct array) and new format (metadata with value)
      let permissionArray: string[] | undefined;

      if (Array.isArray(roleConfig.permissions)) {
        logger.debug(
          `[RoleManager] Role ${role} permissions is direct array format`
        );
        // Old format: direct array
        permissionArray = roleConfig.permissions;
      } else if (
        roleConfig.permissions &&
        typeof roleConfig.permissions === 'object' &&
        roleConfig.permissions.value &&
        Array.isArray(roleConfig.permissions.value)
      ) {
        logger.debug(
          `[RoleManager] Role ${role} permissions is metadata format with value:`,
          roleConfig.permissions.value
        );
        // New format: metadata object with value
        permissionArray = roleConfig.permissions.value;

        // Reduced: no direct dump of permission array
      } else {
        logger.debug(
          `[RoleManager] Role ${role} permissions is neither array nor metadata format:`,
          typeof roleConfig.permissions
        );
        // Reduced: no direct dump of permissions object
      }

      if (Array.isArray(permissionArray)) {
        logger.debug(
          `[RoleManager] Role ${role} permission array:`,
          permissionArray
        );
        permissionArray.forEach((p) => permissions.add(p));
      } else {
        logger.debug(
          `[RoleManager] Role ${role} permission array is not an array:`,
          permissionArray
        );
      }
    } else {
      logger.debug(`[RoleManager] Role ${role} has no permissions field`);
    }

    // Get inherited permissions from role hierarchy (handle missing role_hierarchy)
    try {
      const roleHierarchy = config.role_hierarchy || {};
      // No verbose output

      // Handle both old format (direct array) and new format (metadata with value)
      let inheritedRoles: string[] = [];
      const hierarchyEntry = roleHierarchy[role];

      if (Array.isArray(hierarchyEntry)) {
        // Old format: direct array
        inheritedRoles = hierarchyEntry;
      } else if (
        hierarchyEntry &&
        typeof hierarchyEntry === 'object' &&
        'value' in hierarchyEntry &&
        Array.isArray(hierarchyEntry.value)
      ) {
        // New format: metadata object with value
        inheritedRoles = hierarchyEntry.value;
      }

      // No verbose output

      for (const inheritedRole of inheritedRoles) {
        const inheritedPermissions = this.getRolePermissions(
          inheritedRole,
          config
        );
        inheritedPermissions.forEach((p) => permissions.add(p));
      }
    } catch (error) {
      logger.error(
        `[RoleManager] CRITICAL: Error in role hierarchy processing:`,
        error
      );
      throw error;
    }

    // FA-API-009: only an UNKNOWN role falls back to public permissions
    // (fail-safe for misconfigured references). A role that IS defined but was
    // intentionally given no permissions (e.g. a locked-down 'suspended' role)
    // must resolve to zero permissions, not silently inherit public read.
    if (!roleConfig) {
      logger.warn(
        `Role '${role}' not found, falling back to public role`
      );
      try {
        const publicRole = config.roles['public'];
        logger.output(`Public role exists: ${!!publicRole}`);
        if (publicRole?.permissions) {
          // Handle both old format (direct array) and new format (metadata with value)
          let publicPermissionArray: string[] | undefined;

          if (Array.isArray(publicRole.permissions)) {
            // Old format: direct array
            publicPermissionArray = publicRole.permissions;
          } else if (
            publicRole.permissions &&
            typeof publicRole.permissions === 'object' &&
            'value' in publicRole.permissions
          ) {
            // New format: metadata object with value
            publicPermissionArray = publicRole.permissions.value;
          }

          if (Array.isArray(publicPermissionArray)) {
            publicPermissionArray.forEach((p) => permissions.add(p));
          }
        }
      } catch (error) {
        logger.error(
          `[RoleManager] CRITICAL: Error in fallback processing:`,
          error
        );
        throw error;
      }
    } else if (permissions.size === 0) {
      logger.debug(
        `[RoleManager] Role '${role}' is defined with no permissions — granting none`
      );
    }

    // Proceed to conversion without verbose debug

    // No verbose conversion logs

    try {
      const finalPermissions = Array.from(permissions);

      logger.debug(
        `[RoleManager] Final permissions for role ${role}`
      );

      return finalPermissions;
    } catch (error) {
      logger.error(`[RoleManager] CRITICAL: Error in Array.from:`, error);
      throw error;
    }
  }

  private getDefaultConfig(): RolesConfig {
    return getDefaultRolesConfig();
  }
}
