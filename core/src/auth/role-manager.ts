import { readFile } from 'fs/promises';
import { join } from 'path';
import * as fs from 'fs';
import { getLogger } from '../utils/logger.js';
import yaml from 'js-yaml';
import { AuthUser } from './auth-service.js';

const logger = getLogger();

export interface RoleConfig {
  name: string;
  description: string;
  permissions: string[];
  record_types?: {
    can_create?: string[];
    can_edit?: string[];
    can_delete?: string[];
    can_view?: string[];
  };
  status_transitions?: Record<string, string[]>;
}

export interface RolesConfig {
  default_role: string;
  roles: Record<string, RoleConfig>;
  permissions: Record<string, PermissionConfig>;
  role_hierarchy: Record<string, string[]>;
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
      const config = await this.loadConfig();
      const userRole = user.role;

      // Handle array of permissions (any permission grants access)
      if (Array.isArray(permission)) {
        return permission.some((p) =>
          this.checkPermission(userRole, p, config, context)
        );
      }

      return this.checkPermission(userRole, permission, config, context);
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
      return config.default_role || 'public';
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
   * Validate a role exists
   * @param role - The role to validate
   * @returns boolean indicating if the role exists
   */
  async isValidRole(role: string): Promise<boolean> {
    try {
      const config = await this.loadConfig();
      return Object.keys(config.roles).includes(role);
    } catch (error) {
      logger.error('Failed to validate role:', error);
      return false;
    }
  }

  private async loadConfig(): Promise<RolesConfig> {
    if (this.config) {
      return this.config;
    }

    try {
      if (!fs.existsSync(this.configPath)) {
        this.config = this.getDefaultConfig();
        return this.config;
      }

      const content = await readFile(this.configPath, 'utf-8');
      const parsedConfig = yaml.load(content) as RolesConfig;
      this.config = parsedConfig;
      return this.config;
    } catch (error) {
      logger.warn('Failed to load roles config, using defaults:', error);
      this.config = this.getDefaultConfig();
      return this.config;
    }
  }

  private checkPermission(
    userRole: string,
    permission: string,
    config: RolesConfig,
    context?: {
      recordType?: string;
      action?: 'create' | 'edit' | 'delete' | 'view';
      fromStatus?: string;
      toStatus?: string;
    }
  ): boolean {
    // Get all permissions for the user role (including inherited)
    const userPermissions = this.getRolePermissions(userRole, config);

    // Check if user has the specific permission
    if (userPermissions.includes(permission)) {
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

    // Check status transition permissions
    if (context?.fromStatus && context?.toStatus) {
      const roleConfig = config.roles[userRole];
      if (roleConfig?.status_transitions) {
        const allowedTransitions =
          roleConfig.status_transitions[context.fromStatus] ||
          roleConfig.status_transitions['any'] ||
          [];
        if (allowedTransitions.includes(context.toStatus)) {
          return true;
        }
      }

      // If role doesn't exist, check public role for status transitions
      if (!roleConfig) {
        const publicRole = config.roles['public'];
        if (publicRole?.status_transitions) {
          const publicAllowedTransitions =
            publicRole.status_transitions[context.fromStatus] ||
            publicRole.status_transitions['any'] ||
            [];
          if (publicAllowedTransitions.includes(context.toStatus)) {
            return true;
          }
        }
      }
    }

    return false;
  }

  private getRolePermissions(role: string, config: RolesConfig): string[] {
    const permissions = new Set<string>();

    // Get direct permissions for the role
    const roleConfig = config.roles[role];
    if (roleConfig?.permissions) {
      roleConfig.permissions.forEach((p) => permissions.add(p));
    }

    // Get inherited permissions from role hierarchy
    const inheritedRoles = config.role_hierarchy[role] || [];
    for (const inheritedRole of inheritedRoles) {
      const inheritedPermissions = this.getRolePermissions(
        inheritedRole,
        config
      );
      inheritedPermissions.forEach((p) => permissions.add(p));
    }

    // If role doesn't exist or has no permissions, fallback to public permissions
    if (!roleConfig || permissions.size === 0) {
      logger.warn(
        `Role '${role}' not found or has no permissions, falling back to public role`
      );
      const publicRole = config.roles['public'];
      if (publicRole?.permissions) {
        publicRole.permissions.forEach((p) => permissions.add(p));
      }
    }

    return Array.from(permissions);
  }

  private getDefaultConfig(): RolesConfig {
    return {
      default_role: 'public',
      roles: {
        admin: {
          name: 'Administrator',
          description: 'Full system access with all permissions',
          permissions: [
            'system:admin',
            'records:create',
            'records:edit',
            'records:delete',
            'records:view',
            'records:archive',
            'workflows:manage',
            'templates:manage',
            'hooks:manage',
            'users:manage',
            'system:configure',
          ],
          record_types: {
            can_create: [
              'bylaw',
              'policy',
              'resolution',
              'proclamation',
              'ordinance',
            ],
            can_edit: [
              'bylaw',
              'policy',
              'resolution',
              'proclamation',
              'ordinance',
            ],
            can_delete: [
              'bylaw',
              'policy',
              'resolution',
              'proclamation',
              'ordinance',
            ],
            can_view: [
              'bylaw',
              'policy',
              'resolution',
              'proclamation',
              'ordinance',
            ],
          },
          status_transitions: {
            draft: ['proposed', 'archived'],
            proposed: ['reviewed', 'archived'],
            reviewed: ['approved', 'archived'],
            approved: ['archived'],
            any: ['archived'],
          },
        },
        mayor: {
          name: 'Mayor',
          description: 'Executive authority with approval powers',
          permissions: [
            'records:create',
            'records:edit',
            'records:view',
            'records:archive',
            'workflows:approve',
            'templates:view',
          ],
          record_types: {
            can_create: ['bylaw', 'policy', 'resolution', 'proclamation'],
            can_edit: ['bylaw', 'policy', 'resolution', 'proclamation'],
            can_view: [
              'bylaw',
              'policy',
              'resolution',
              'proclamation',
              'ordinance',
            ],
          },
          status_transitions: {
            reviewed: ['approved'],
            approved: ['archived'],
            any: ['archived'],
          },
        },
        council: {
          name: 'City Council',
          description: 'Legislative body with voting and approval powers',
          permissions: [
            'records:create',
            'records:edit',
            'records:view',
            'records:archive',
            'workflows:vote',
            'templates:view',
          ],
          record_types: {
            can_create: ['bylaw', 'policy', 'resolution'],
            can_edit: ['bylaw', 'policy', 'resolution'],
            can_view: [
              'bylaw',
              'policy',
              'resolution',
              'proclamation',
              'ordinance',
            ],
          },
          status_transitions: {
            proposed: ['reviewed'],
            reviewed: ['approved'],
            approved: ['archived'],
            any: ['archived'],
          },
        },
        clerk: {
          name: 'City Clerk',
          description: 'Administrative support with document management',
          permissions: [
            'records:create',
            'records:edit',
            'records:view',
            'templates:view',
          ],
          record_types: {
            can_create: ['bylaw', 'policy', 'resolution'],
            can_edit: ['bylaw', 'policy', 'resolution'],
            can_view: [
              'bylaw',
              'policy',
              'resolution',
              'proclamation',
              'ordinance',
            ],
          },
          status_transitions: {
            draft: ['proposed'],
          },
        },
        legal_dept: {
          name: 'Legal Department',
          description: 'Legal review and compliance',
          permissions: [
            'records:edit',
            'records:view',
            'workflows:review',
            'templates:view',
          ],
          record_types: {
            can_edit: ['bylaw', 'policy', 'resolution'],
            can_view: [
              'bylaw',
              'policy',
              'resolution',
              'proclamation',
              'ordinance',
            ],
          },
          status_transitions: {
            proposed: ['reviewed'],
          },
        },
        public: {
          name: 'Public',
          description: 'Read-only access to published records',
          permissions: ['records:view'],
          record_types: {
            can_view: [
              'bylaw',
              'policy',
              'resolution',
              'proclamation',
              'ordinance',
            ],
          },
          status_transitions: {},
        },
      },
      permissions: {
        'system:admin': {
          description: 'Full system administration access',
          level: 'system',
        },
        'system:configure': {
          description: 'Configure system settings',
          level: 'system',
        },
        'records:create': {
          description: 'Create new records',
          level: 'record',
        },
        'records:edit': {
          description: 'Edit existing records',
          level: 'record',
        },
        'records:delete': {
          description: 'Delete records',
          level: 'record',
        },
        'records:view': {
          description: 'View records',
          level: 'record',
        },
        'records:archive': {
          description: 'Archive records',
          level: 'record',
        },
        'workflows:manage': {
          description: 'Manage workflow configurations',
          level: 'workflow',
        },
        'workflows:approve': {
          description: 'Approve workflow transitions',
          level: 'workflow',
        },
        'workflows:vote': {
          description: 'Vote on workflow transitions',
          level: 'workflow',
        },
        'workflows:review': {
          description: 'Review workflow transitions',
          level: 'workflow',
        },
        'templates:manage': {
          description: 'Manage templates',
          level: 'template',
        },
        'templates:view': {
          description: 'View templates',
          level: 'template',
        },
        'hooks:manage': {
          description: 'Manage hooks and automation',
          level: 'hook',
        },
        'users:manage': {
          description: 'Manage users and roles',
          level: 'user',
        },
      },
      role_hierarchy: {
        admin: [],
        mayor: ['council'],
        council: ['clerk'],
        clerk: ['legal_dept'],
        legal_dept: ['public'],
        public: [],
      },
    };
  }
}
