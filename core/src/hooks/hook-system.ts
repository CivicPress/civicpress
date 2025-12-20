import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import yaml from 'yaml';
import {
  coreSuccess,
  coreError,
  coreInfo,
  coreWarn,
  coreDebug,
  coreStartOperation,
} from '../utils/core-output.js';

export interface HookContext {
  timestamp: Date;
  user?: string;
  session?: string;
  metadata?: Record<string, any>;
  record?: any;
  action?: string;
}

export interface HookConfig {
  hooks: Record<string, HookDefinition>;
  settings: HookSettings;
}

export interface HookDefinition {
  enabled: boolean | { value: boolean };
  workflows: string[] | { value: string[] };
  audit: boolean | { value: boolean };
  description?: string;
}

export interface HookSettings {
  maxConcurrent: number;
  timeout: number;
  retryAttempts: number;
  defaultMode: 'sync' | 'async' | 'dry-run';
}

export type HookHandler = (
  _data: any,
  _context: HookContext
) => Promise<void> | void;

/**
 * HookSystem - Event-Driven Architecture
 *
 * Handles event emission and listening for CivicPress.
 * Provides the foundation for plugin and workflow integration.
 */
export class HookSystem {
  private listeners: Map<string, HookHandler[]>;
  private hooks: Map<string, any>;
  private config: HookConfig | null;
  private configPath: string;
  private logPath: string;

  constructor(dataDir?: string) {
    this.listeners = new Map();
    this.hooks = new Map();
    this.config = null;
    this.configPath = dataDir ? join(dataDir, '.civic', 'hooks.yml') : '';
    this.logPath = dataDir ? join(dataDir, '.civic', 'hooks.log.jsonl') : '';
  }

  /**
   * Initialize the hook system
   */
  async initialize(): Promise<void> {
    const endOperation = coreStartOperation('hook system initialization');

    try {
      // Load configuration
      await this.loadConfiguration();

      // Set up default hooks
      this.registerDefaultHooks();

      // Success logged via lifecycle operation (coreStartOperation/endOperation)

      endOperation();
    } catch (error) {
      coreError(
        'Failed to initialize hook system',
        'HOOK_INIT_FAILED',
        { error: error instanceof Error ? error.message : String(error) },
        { operation: 'hook system initialization' }
      );
      throw error;
    }
  }

  /**
   * Load hook configuration from file
   */
  private async loadConfiguration(): Promise<void> {
    if (!this.configPath || !existsSync(this.configPath)) {
      // Create default configuration
      this.config = this.getDefaultConfig();
      await this.saveConfiguration();
      coreInfo('Created default hook configuration', {
        operation: 'hook configuration loading',
        configPath: this.configPath,
      });
      return;
    }

    try {
      const configContent = await readFile(this.configPath, 'utf-8');
      this.config = yaml.parse(configContent) as HookConfig;
      coreDebug('Loaded hook configuration from file', {
        operation: 'hook configuration loading',
        configPath: this.configPath,
        hooksCount: Object.keys(this.config.hooks).length,
      });
    } catch (error) {
      coreWarn('Failed to load hook config, using defaults', {
        operation: 'hook configuration loading',
        error: error instanceof Error ? error.message : String(error),
      });
      this.config = this.getDefaultConfig();
    }
  }

  /**
   * Save configuration to file
   */
  private async saveConfiguration(): Promise<void> {
    if (!this.configPath) return;

    try {
      const configDir = join(this.configPath, '..');
      if (!existsSync(configDir)) {
        await mkdir(configDir, { recursive: true });
      }

      const configContent = yaml.stringify(this.config, {
        aliasDuplicateObjects: false,
        lineWidth: 0,
      });
      await writeFile(this.configPath, configContent, 'utf-8');
      coreDebug('Saved hook configuration to file', {
        operation: 'hook configuration saving',
        configPath: this.configPath,
      });
    } catch (error) {
      coreError(
        'Failed to save hook configuration',
        'HOOK_CONFIG_SAVE_FAILED',
        { error: error instanceof Error ? error.message : String(error) },
        { operation: 'hook configuration saving' }
      );
    }
  }

  /**
   * Get default hook configuration
   */
  private getDefaultConfig(): HookConfig {
    return {
      hooks: {
        'record:created': {
          enabled: true,
          workflows: ['validate-record', 'notify-council'],
          audit: true,
          description: 'Triggered when a new record is created',
        },
        'record:updated': {
          enabled: true,
          workflows: ['validate-record', 'update-index'],
          audit: true,
          description: 'Triggered when a record is updated',
        },
        'record:committed': {
          enabled: true,
          workflows: ['validate-record'],
          audit: true,
          description: 'Triggered when a record is committed to Git',
        },
        'status:changed': {
          enabled: true,
          workflows: ['notify-stakeholders'],
          audit: true,
          description: 'Triggered when a record status changes',
        },
        'validation:failed': {
          enabled: true,
          workflows: ['notify-author'],
          audit: true,
          description: 'Triggered when record validation fails',
        },
      },
      settings: {
        maxConcurrent: 5,
        timeout: 30000,
        retryAttempts: 3,
        defaultMode: 'async',
      },
    };
  }

  /**
   * Register default hooks
   */
  private registerDefaultHooks(): void {
    this.registerHook('civic:initialized', this.onInitialized.bind(this));
    this.registerHook('record:created', this.onRecordCreated.bind(this));
    this.registerHook('record:updated', this.onRecordUpdated.bind(this));
    this.registerHook('record:committed', this.onRecordCommitted.bind(this));
    this.registerHook('status:changed', this.onStatusChanged.bind(this));
    this.registerHook('validation:failed', this.onValidationFailed.bind(this));
    this.registerHook('demo:data:loaded', this.onDemoDataLoaded.bind(this));

    coreDebug('Registered default hooks', {
      operation: 'hook registration',
      defaultHooks: [
        'civic:initialized',
        'record:created',
        'record:updated',
        'record:committed',
        'status:changed',
        'validation:failed',
      ],
    });
  }

  /**
   * Register a hook
   */
  registerHook(name: string, handler: HookHandler): void {
    if (!this.listeners.has(name)) {
      this.listeners.set(name, []);
    }
    this.listeners.get(name)!.push(handler);
    coreDebug(`Registered hook: ${name}`, {
      operation: 'hook registration',
      hookName: name,
    });
  }

  /**
   * Emit a hook event
   */
  async emit(
    name: string,
    data: any,
    context?: Partial<HookContext>
  ): Promise<void> {
    const fullContext: HookContext = {
      timestamp: new Date(),
      ...context,
    };

    coreDebug(`Emitting hook: ${name}`, {
      operation: 'hook emission',
      hookName: name,
      dataKeys: Object.keys(data || {}),
      context: fullContext,
    });

    // Check if hook is disabled
    const hookConfig = this.config?.hooks[name];
    if (hookConfig) {
      // Handle both old and new config formats for enabled field
      let isEnabled = false;
      if (typeof hookConfig.enabled === 'boolean') {
        // Old format: enabled: true
        isEnabled = hookConfig.enabled;
      } else if (hookConfig.enabled?.value !== undefined) {
        // New format: enabled: { value: true }
        isEnabled = hookConfig.enabled.value;
      }

      if (!isEnabled) {
        coreDebug(`Hook '${name}' is disabled, skipping`, {
          operation: 'hook emission',
          hookName: name,
        });
        return;
      }
    }

    // Execute registered handlers
    const handlers = this.listeners.get(name) || [];
    if (handlers.length === 0) {
      coreDebug(`Hook '${name}' emitted (no handlers)`, {
        operation: 'hook emission',
        hookName: name,
      });
    }

    for (const handler of handlers) {
      try {
        await handler(data, fullContext);
      } catch (error) {
        coreError(
          `Hook handler failed for '${name}'`,
          'HOOK_HANDLER_FAILED',
          {
            hookName: name,
            error: error instanceof Error ? error.message : String(error),
          },
          { operation: 'hook emission' }
        );
      }
    }

    // Execute configured workflows
    if (hookConfig?.workflows) {
      await this.executeWorkflows(name, data, fullContext);
    }

    // Log hook execution
    if (hookConfig) {
      // Handle both old and new config formats for audit field
      let shouldAudit = false;
      if (typeof hookConfig.audit === 'boolean') {
        // Old format: audit: true
        shouldAudit = hookConfig.audit;
      } else if (hookConfig.audit?.value !== undefined) {
        // New format: audit: { value: true }
        shouldAudit = hookConfig.audit.value;
      }

      if (shouldAudit) {
        await this.logHook('execution', name, data, fullContext);
      }
    }
  }

  /**
   * Execute workflows for a hook
   */
  private async executeWorkflows(
    hookName: string,
    data: any,
    context: HookContext
  ): Promise<void> {
    const hookConfig = this.config?.hooks[hookName];
    if (!hookConfig?.workflows) return;

    // Handle both old and new config formats
    let workflows: string[];
    if (Array.isArray(hookConfig.workflows)) {
      // Old format: workflows: ['validate-record', 'notify-council']
      workflows = hookConfig.workflows;
    } else if (
      hookConfig.workflows.value &&
      Array.isArray(hookConfig.workflows.value)
    ) {
      // New format: workflows: { value: ['validate-record', 'notify-council'] }
      workflows = hookConfig.workflows.value;
    } else {
      // Invalid format, skip execution
      coreWarn(`Invalid workflows format for hook '${hookName}'`, {
        operation: 'workflow execution',
        hookName,
        workflows: hookConfig.workflows,
      });
      return;
    }

    coreDebug(`Executing workflows for hook '${hookName}'`, {
      operation: 'workflow execution',
      hookName,
      workflows,
    });

    for (const workflowName of workflows) {
      try {
        await this.executeWorkflow(workflowName, data, context);
      } catch (error) {
        coreError(
          `Workflow '${workflowName}' failed for hook '${hookName}'`,
          'WORKFLOW_EXECUTION_FAILED',
          {
            hookName,
            workflowName,
            error: error instanceof Error ? error.message : String(error),
          },
          { operation: 'workflow execution' }
        );
      }
    }
  }

  /**
   * Execute a single workflow
   */
  private async executeWorkflow(
    workflowName: string,
    data: any,
    context: HookContext
  ): Promise<void> {
    coreDebug(`Executing workflow: ${workflowName}`, {
      operation: 'workflow execution',
      workflowName,
      dataKeys: Object.keys(data || {}),
    });

    // TODO: Implement workflow engine integration
    // For now, just log the workflow execution
    coreInfo(`Workflow executed: ${workflowName}`, {
      operation: 'workflow execution',
      workflowName,
    });
  }

  /**
   * Log hook execution
   */
  private async logHook(
    type: string,
    name: string,
    data: any,
    context: HookContext
  ): Promise<void> {
    if (!this.logPath) return;

    try {
      const logEntry = {
        type,
        name,
        timestamp: context.timestamp.toISOString(),
        data: data ? Object.keys(data) : [],
        context: {
          user: context.user,
          session: context.session,
          action: context.action,
        },
      };

      // TODO: Implement proper log writing
      coreDebug('Hook logged', {
        operation: 'hook logging',
        logEntry,
      });
    } catch (error) {
      coreWarn('Failed to log hook execution', {
        operation: 'hook logging',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Remove a hook
   */
  removeHook(name: string, handler: HookHandler): void {
    const handlers = this.listeners.get(name);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
        coreDebug(`Removed hook handler: ${name}`, {
          operation: 'hook removal',
          hookName: name,
        });
      }
    }
  }

  /**
   * Get registered hook names
   */
  getRegisteredHooks(): string[] {
    return Array.from(this.listeners.keys());
  }

  /**
   * Get current configuration
   */
  getConfiguration(): HookConfig | null {
    return this.config;
  }

  /**
   * Update configuration
   */
  async updateConfiguration(config: Partial<HookConfig>): Promise<void> {
    this.config = { ...this.config, ...config } as HookConfig;
    await this.saveConfiguration();
    coreInfo('Hook configuration updated', {
      operation: 'hook configuration update',
    });
  }

  // Default hook handlers
  private onInitialized(_data: any, _context: HookContext): void {
    coreInfo('CivicPress initialized', { operation: 'hook handling' });
  }

  private onRecordCreated(_data: any, _context: HookContext): void {
    coreInfo('Record created', {
      operation: 'hook handling',
      recordId: _data?.id,
    });
  }

  private onRecordUpdated(_data: any, _context: HookContext): void {
    coreInfo('Record updated', {
      operation: 'hook handling',
      recordId: _data?.id,
    });
  }

  private onRecordCommitted(_data: any, _context: HookContext): void {
    coreInfo('Record committed', {
      operation: 'hook handling',
      recordId: _data?.id,
    });
  }

  private onStatusChanged(_data: any, _context: HookContext): void {
    coreInfo('Status changed', {
      operation: 'hook handling',
      recordId: _data?.id,
      oldStatus: _data?.oldStatus,
      newStatus: _data?.newStatus,
    });
  }

  private onValidationFailed(_data: any, _context: HookContext): void {
    coreWarn('Validation failed', {
      operation: 'hook handling',
      recordId: _data?.id,
      errors: _data?.errors,
    });
  }

  private onDemoDataLoaded(_data: any, _context: HookContext): void {
    coreInfo('Demo data loaded', {
      operation: 'hook handling',
      demoCity: _data?.demoCity,
      recordCount: _data?.recordCount,
    });
  }
}
