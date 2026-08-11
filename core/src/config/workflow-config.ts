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

  /**
   * A config list, in either shape it may be stored in.
   *
   * A value is normally a plain `string[]`, but config that has been through
   * the metadata-carrying editor comes back as `{ value: string[], type, … }`.
   * Every reader has to cope with both, and this used to be written out inline
   * at ~10 sites — which is exactly how the per-record-type path could come to
   * disagree with the global one about what a list is.
   */
  private unwrapList(raw: unknown): string[] {
    if (Array.isArray(raw)) return raw as string[];
    if (raw && typeof raw === 'object' && 'value' in raw) {
      return ((raw as { value?: string[] }).value || []) as string[];
    }
    return [];
  }

  /**
   * The transition graph that governs `recordType`.
   *
   * A type that declares its own `transitions` REPLACES the global graph
   * rather than merging with it — matching how `getAvailableStatuses` already
   * treats per-type `statuses`, and matching the spec's
   * "Department-Specific Workflows" example, which writes each type's
   * lifecycle out in full. A type that declares none inherits the global graph.
   */
  private async transitionsFor(
    recordType?: string
  ): Promise<Record<string, unknown>> {
    const config = await this.loadConfig();
    const typeTransitions = recordType
      ? config.recordTypes?.[recordType]?.transitions
      : undefined;
    return (typeTransitions ?? config.transitions ?? {}) as Record<
      string,
      unknown
    >;
  }

  /**
   * The role permissions that govern `recordType`, with the same
   * replace-not-merge rule. `RecordTypeConfig.roles` has been declared since
   * this interface was written and was never read — the same silent-no-op as
   * the transitions it sits beside, so it is honoured here too.
   */
  private async rolesFor(
    recordType?: string
  ): Promise<Record<string, RolePermissions>> {
    const config = await this.loadConfig();
    const typeRoles = recordType
      ? config.recordTypes?.[recordType]?.roles
      : undefined;
    return typeRoles ?? config.roles ?? {};
  }

  /**
   * Transition targets this role may reach from `fromStatus`, including any
   * granted by the `any` wildcard.
   */
  private roleTransitionTargets(
    roleConfig: RolePermissions,
    fromStatus: string
  ): string[] {
    if (!roleConfig.can_transition) return [];
    return [
      ...this.unwrapList(roleConfig.can_transition[fromStatus]),
      ...this.unwrapList(roleConfig.can_transition['any']),
    ];
  }

  /**
   * @param recordType - when given, the type's own workflow governs if it
   * declares one. Optional and trailing, so existing callers keep the global
   * behaviour they had.
   */
  async validateTransition(
    fromStatus: string,
    toStatus: string,
    role?: string,
    recordType?: string
  ): Promise<{ valid: boolean; reason?: string }> {
    const transitions = await this.transitionsFor(recordType);
    const allowedTransitions = this.unwrapList(transitions[fromStatus]);

    if (!allowedTransitions.includes(toStatus)) {
      const transitionsText =
        allowedTransitions.length > 0
          ? allowedTransitions.join(', ')
          : 'none (final status)';

      // Check if this might be a typo (e.g., "review" instead of "reviewed")
      const availableStatuses = await this.getAvailableStatuses(recordType);
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
      const roles = await this.rolesFor(recordType);
      const roleConfig = roles[role];
      if (!roleConfig) {
        return {
          valid: false,
          reason: `Role '${role}' not found in configuration`,
        };
      }

      const allowedForRole = this.roleTransitionTargets(roleConfig, fromStatus);

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
        allowedTypes = (actionPermissions as { value?: string[] }).value || [];
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

  /**
   * The set of statuses that are DESTINATIONS in the transition graph — i.e.
   * moving a record INTO one of them is a workflow-controlled transition
   * (proposed/reviewed/approved/archived in the default config).
   *
   * FA-API-008: the generic write paths (create/update/publish) must validate
   * a status change against the transition rules ONLY for these — a legal
   * status that is not a transition target (e.g. `published`, set by the
   * publish flow) is governed by that flow's own permission gate, not by the
   * editorial transition graph.
   */
  async getControlledStatuses(): Promise<Set<string>> {
    const config = await this.loadConfig();
    const controlled = new Set<string>();
    const collect = (raw: unknown) => {
      this.unwrapList(raw).forEach((s) => controlled.add(s));
    };

    for (const raw of Object.values(config.transitions || {})) {
      collect(raw);
    }

    // Per-record-type graphs count too, and leaving them out was not merely
    // incomplete — it was a hole. The caller
    // (`assertStatusWritableByRole`) returns EARLY, skipping validation
    // entirely, for any status it does not consider controlled. So a status
    // reachable only through some type's own transition graph would have been
    // writable by any role without the transition check ever running. This is
    // a union across all types on purpose: "controlled" means "governed by a
    // transition graph somewhere", and being over-inclusive here only causes
    // MORE validation, which then answers per-type correctly.
    for (const typeConfig of Object.values(config.recordTypes || {})) {
      for (const raw of Object.values(typeConfig?.transitions || {})) {
        collect(raw);
      }
    }

    return controlled;
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
        return (typeStatuses as { value?: string[] }).value || [];
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
      return (config.statuses as { value?: string[] }).value || [];
    }

    return [];
  }

  /**
   * @param recordType - when given, the type's own workflow governs if it
   * declares one. Optional and trailing, so existing callers keep the global
   * behaviour they had.
   */
  async getAvailableTransitions(
    fromStatus: string,
    role?: string,
    recordType?: string
  ): Promise<string[]> {
    const transitions = await this.transitionsFor(recordType);
    const allTransitions = this.unwrapList(transitions[fromStatus]);

    if (!role) {
      return allTransitions;
    }

    const roles = await this.rolesFor(recordType);
    const roleConfig = roles[role];
    if (!roleConfig) {
      return [];
    }

    const roleTransitions = this.roleTransitionTargets(roleConfig, fromStatus);

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
