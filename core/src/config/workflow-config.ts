import { readFile } from 'fs/promises';
import { join } from 'path';
import * as fs from 'fs';
import { getLogger } from '../utils/logger.js';

export interface WorkflowConfig {
  statuses: string[];
  transitions: Record<string, string[]>;
  roles: Record<string, RolePermissions>;
  recordTypes?: Record<string, RecordTypeConfig>;
}

export interface RolePermissions {
  can_transition: Record<string, string[]>;
  can_create?: string[];
  can_edit?: string[];
  can_delete?: string[];
  can_view?: string[];
}

export interface RecordTypeConfig {
  statuses?: string[];
  transitions?: Record<string, string[]>;
  roles?: Record<string, RolePermissions>;
}

export class WorkflowConfigManager {
  private configPath: string;
  private config: WorkflowConfig | null = null;

  constructor(dataDir: string) {
    this.configPath = join(dataDir, '.civic', 'workflows.yml');
  }

  async loadConfig(): Promise<WorkflowConfig> {
    if (this.config) {
      return this.config;
    }

    try {
      if (!fs.existsSync(this.configPath)) {
        this.config = this.getDefaultConfig();
        return this.config;
      }

      const content = await readFile(this.configPath, 'utf-8');
      // Note: You'll need to add a YAML parser like 'js-yaml'
      // For now, we'll use JSON format
      const parsedConfig = JSON.parse(content) as WorkflowConfig;
      this.config = parsedConfig;
      return this.config;
    } catch (error) {
      const logger = getLogger();
      logger.warn('Failed to load workflow config, using defaults:', error);
      this.config = this.getDefaultConfig();
      return this.config;
    }
  }

  private getDefaultConfig(): WorkflowConfig {
    return {
      statuses: ['draft', 'proposed', 'reviewed', 'approved', 'archived'],
      transitions: {
        draft: ['proposed'],
        proposed: ['reviewed', 'archived'],
        reviewed: ['approved', 'archived'],
        approved: ['archived'],
        archived: [],
      },
      roles: {
        clerk: {
          can_transition: {
            draft: ['proposed'],
            proposed: ['reviewed'],
          },
          can_create: ['bylaw', 'policy', 'resolution'],
          can_edit: ['bylaw', 'policy', 'resolution'],
        },
        council: {
          can_transition: {
            reviewed: ['approved'],
            any: ['archived'],
          },
          can_create: ['bylaw', 'policy', 'resolution'],
          can_edit: ['bylaw', 'policy', 'resolution'],
        },
        public: {
          can_transition: {},
          can_view: ['bylaw', 'policy', 'resolution'],
        },
      },
    };
  }

  async validateTransition(
    fromStatus: string,
    toStatus: string,
    role?: string
  ): Promise<{ valid: boolean; reason?: string }> {
    const config = await this.loadConfig();

    // Check if transition is allowed
    const allowedTransitions = config.transitions[fromStatus] || [];
    if (!allowedTransitions.includes(toStatus)) {
      return {
        valid: false,
        reason: `Transition from '${fromStatus}' to '${toStatus}' is not allowed. Allowed transitions: ${allowedTransitions.join(', ')}`,
      };
    }

    // Check role permissions if role is provided
    if (role) {
      const roleConfig = config.roles[role];
      if (!roleConfig) {
        return {
          valid: false,
          reason: `Role '${role}' not found in configuration`,
        };
      }

      const roleTransitions = roleConfig.can_transition;
      const allowedForRole =
        roleTransitions[fromStatus] || roleTransitions['any'] || [];

      if (!allowedForRole.includes(toStatus)) {
        return {
          valid: false,
          reason: `Role '${role}' cannot transition from '${fromStatus}' to '${toStatus}'`,
        };
      }
    }

    return { valid: true };
  }

  async validateAction(
    action: 'create' | 'edit' | 'delete' | 'view',
    recordType: string,
    role?: string
  ): Promise<{ valid: boolean; reason?: string }> {
    const config = await this.loadConfig();

    if (!role) {
      return { valid: true }; // No role restrictions
    }

    const roleConfig = config.roles[role];
    if (!roleConfig) {
      return {
        valid: false,
        reason: `Role '${role}' not found in configuration`,
      };
    }

    // If the role does not have the relevant can_* property, deny by default
    if (!Object.prototype.hasOwnProperty.call(roleConfig, `can_${action}`)) {
      return {
        valid: false,
        reason: `Role '${role}' cannot ${action} records of type '${recordType}'`,
      };
    }

    const allowedTypes = roleConfig[`can_${action}`] || [];

    // If the role has specific permissions defined, check if the action is allowed
    if (allowedTypes.length > 0) {
      if (!allowedTypes.includes(recordType)) {
        return {
          valid: false,
          reason: `Role '${role}' cannot ${action} records of type '${recordType}'`,
        };
      }
    } else {
      // If no permissions are defined for this action, deny by default
      return {
        valid: false,
        reason: `Role '${role}' cannot ${action} records of type '${recordType}'`,
      };
    }

    return { valid: true };
  }

  async getAvailableStatuses(recordType?: string): Promise<string[]> {
    const config = await this.loadConfig();

    if (recordType && config.recordTypes?.[recordType]?.statuses) {
      return config.recordTypes[recordType].statuses!;
    }

    return config.statuses;
  }

  async getAvailableTransitions(
    fromStatus: string,
    role?: string
  ): Promise<string[]> {
    const config = await this.loadConfig();
    const allTransitions = config.transitions[fromStatus] || [];

    if (!role) {
      return allTransitions;
    }

    const roleConfig = config.roles[role];
    if (!roleConfig) {
      return [];
    }

    const roleTransitions =
      roleConfig.can_transition[fromStatus] ||
      roleConfig.can_transition['any'] ||
      [];
    return allTransitions.filter((transition) =>
      roleTransitions.includes(transition)
    );
  }

  async getRoles(): Promise<string[]> {
    const config = await this.loadConfig();
    return Object.keys(config.roles);
  }
}
