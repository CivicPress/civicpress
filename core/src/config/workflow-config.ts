import { readFile } from 'fs/promises';
import { join } from 'path';
import * as fs from 'fs';
import { getLogger } from '../utils/logger.js';
import yaml from 'js-yaml';

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
      // Parse as YAML
      const parsedConfig = yaml.load(content) as WorkflowConfig;
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

    // Check if transition is allowed - handle both old and new metadata formats
    let allowedTransitions: string[] = [];
    if (config.transitions[fromStatus]) {
      if (Array.isArray(config.transitions[fromStatus])) {
        allowedTransitions = config.transitions[fromStatus] as string[];
      } else if (
        config.transitions[fromStatus] &&
        typeof config.transitions[fromStatus] === 'object' &&
        'value' in config.transitions[fromStatus]
      ) {
        allowedTransitions =
          (config.transitions[fromStatus] as any).value || [];
      }
    }

    if (!allowedTransitions.includes(toStatus)) {
      const transitionsText =
        allowedTransitions.length > 0
          ? allowedTransitions.join(', ')
          : 'none (final status)';

      // Check if this might be a typo (e.g., "review" instead of "reviewed")
      const availableStatuses = await this.getAvailableStatuses();
      const similarStatus = availableStatuses.find(
        (status) =>
          status.toLowerCase().includes(toStatus.toLowerCase()) ||
          toStatus.toLowerCase().includes(status.toLowerCase())
      );

      const suggestion =
        similarStatus && similarStatus !== toStatus
          ? ` Did you mean '${similarStatus}'?`
          : '';

      return {
        valid: false,
        reason: `Transition from '${fromStatus}' to '${toStatus}' is not allowed. Allowed transitions: ${transitionsText}.${suggestion}`,
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

      let allowedForRole: string[] = [];
      if (roleConfig.can_transition) {
        if (roleConfig.can_transition[fromStatus]) {
          if (Array.isArray(roleConfig.can_transition[fromStatus])) {
            allowedForRole = roleConfig.can_transition[fromStatus] as string[];
          } else if (
            roleConfig.can_transition[fromStatus] &&
            typeof roleConfig.can_transition[fromStatus] === 'object' &&
            'value' in roleConfig.can_transition[fromStatus]
          ) {
            allowedForRole =
              (roleConfig.can_transition[fromStatus] as any).value || [];
          }
        }

        if (roleConfig.can_transition['any']) {
          let anyTransitions: string[] = [];
          if (Array.isArray(roleConfig.can_transition['any'])) {
            anyTransitions = roleConfig.can_transition['any'] as string[];
          } else if (
            roleConfig.can_transition['any'] &&
            typeof roleConfig.can_transition['any'] === 'object' &&
            'value' in roleConfig.can_transition['any']
          ) {
            anyTransitions =
              (roleConfig.can_transition['any'] as any).value || [];
          }
          allowedForRole = [...allowedForRole, ...anyTransitions];
        }
      }

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

    // Handle both old and new metadata formats
    let allowedTypes: string[] = [];
    const actionPermissions = roleConfig[`can_${action}`];
    if (actionPermissions) {
      if (Array.isArray(actionPermissions)) {
        allowedTypes = actionPermissions;
      } else if (
        actionPermissions &&
        typeof actionPermissions === 'object' &&
        'value' in actionPermissions
      ) {
        allowedTypes = (actionPermissions as any).value || [];
      }
    }

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
      const typeStatuses = config.recordTypes[recordType].statuses!;
      if (Array.isArray(typeStatuses)) {
        return typeStatuses;
      } else if (
        typeStatuses &&
        typeof typeStatuses === 'object' &&
        'value' in typeStatuses
      ) {
        return (typeStatuses as any).value || [];
      }
      return [];
    }

    // Handle both old and new metadata formats for global statuses
    if (Array.isArray(config.statuses)) {
      return config.statuses;
    } else if (
      config.statuses &&
      typeof config.statuses === 'object' &&
      'value' in config.statuses
    ) {
      return (config.statuses as any).value || [];
    }

    return [];
  }

  async getAvailableTransitions(
    fromStatus: string,
    role?: string
  ): Promise<string[]> {
    const config = await this.loadConfig();

    // Handle both old and new metadata formats
    let allTransitions: string[] = [];
    if (config.transitions[fromStatus]) {
      if (Array.isArray(config.transitions[fromStatus])) {
        // Old format: direct array
        allTransitions = config.transitions[fromStatus] as string[];
      } else if (
        config.transitions[fromStatus] &&
        typeof config.transitions[fromStatus] === 'object' &&
        'value' in config.transitions[fromStatus]
      ) {
        // New format: { value: string[], type: string, description: string, required: boolean }
        allTransitions = (config.transitions[fromStatus] as any).value || [];
      }
    }

    if (!role) {
      return allTransitions;
    }

    const roleConfig = config.roles[role];
    if (!roleConfig) {
      return [];
    }

    let roleTransitions: string[] = [];
    if (roleConfig.can_transition) {
      if (roleConfig.can_transition[fromStatus]) {
        if (Array.isArray(roleConfig.can_transition[fromStatus])) {
          // Old format: direct array
          roleTransitions = roleConfig.can_transition[fromStatus] as string[];
        } else if (
          roleConfig.can_transition[fromStatus] &&
          typeof roleConfig.can_transition[fromStatus] === 'object' &&
          'value' in roleConfig.can_transition[fromStatus]
        ) {
          // New format: { value: string[], type: string, description: string, required: boolean }
          roleTransitions =
            (roleConfig.can_transition[fromStatus] as any).value || [];
        }
      }

      if (roleConfig.can_transition['any']) {
        let anyTransitions: string[] = [];
        if (Array.isArray(roleConfig.can_transition['any'])) {
          anyTransitions = roleConfig.can_transition['any'] as string[];
        } else if (
          roleConfig.can_transition['any'] &&
          typeof roleConfig.can_transition['any'] === 'object' &&
          'value' in roleConfig.can_transition['any']
        ) {
          anyTransitions =
            (roleConfig.can_transition['any'] as any).value || [];
        }
        roleTransitions = [...roleTransitions, ...anyTransitions];
      }
    }

    // Return the intersection of all possible transitions and role-allowed transitions
    // If no role restrictions, return all transitions
    if (roleTransitions.length === 0) {
      return allTransitions;
    }

    return allTransitions.filter((transition) =>
      roleTransitions.includes(transition)
    );
  }

  async getRoles(): Promise<string[]> {
    const config = await this.loadConfig();
    return Object.keys(config.roles);
  }
}
