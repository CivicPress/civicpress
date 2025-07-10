import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import yaml from 'yaml';
import chalk from 'chalk';

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
  enabled: boolean;
  workflows: string[];
  audit: boolean;
  description?: string;
}

export interface HookSettings {
  maxConcurrent: number;
  timeout: number;
  retryAttempts: number;
  defaultMode: 'sync' | 'async' | 'dry-run';
}

export type HookHandler = (
  data: any,
  context: HookContext
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
    try {
      // Load configuration
      await this.loadConfiguration();

      // Set up default hooks
      this.registerDefaultHooks();

      console.log(chalk.green('✅ Hook system initialized'));
    } catch (error) {
      console.error(chalk.red('❌ Failed to initialize hook system:'), error);
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
      return;
    }

    try {
      const configContent = await readFile(this.configPath, 'utf-8');
      this.config = yaml.parse(configContent) as HookConfig;
    } catch (error) {
      console.warn(
        chalk.yellow('⚠️  Failed to load hook config, using defaults')
      );
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

      const configContent = yaml.stringify(this.config);
      await writeFile(this.configPath, configContent, 'utf-8');
    } catch (error) {
      console.error(chalk.red('❌ Failed to save hook configuration:'), error);
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
  }

  /**
   * Register a hook
   */
  registerHook(name: string, handler: HookHandler): void {
    if (!this.listeners.has(name)) {
      this.listeners.set(name, []);
    }
    this.listeners.get(name)!.push(handler);
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

    // Check if hook is enabled in config
    if (this.config?.hooks[name] && !this.config.hooks[name].enabled) {
      console.log(chalk.gray(`⏭️  Hook '${name}' is disabled, skipping`));
      return;
    }

    // Log hook emission
    await this.logHook('emit', name, data, fullContext);

    const handlers = this.listeners.get(name);
    if (handlers && handlers.length > 0) {
      console.log(
        chalk.blue(`🪝 Emitting hook '${name}' (${handlers.length} handlers)`)
      );

      const promises = handlers.map(async (handler) => {
        try {
          await handler(data, fullContext);
        } catch (error) {
          console.error(
            chalk.red(`❌ Error in hook handler for '${name}':`),
            error
          );
          await this.logHook(
            'error',
            name,
            { error: error instanceof Error ? error.message : String(error) },
            fullContext
          );
        }
      });

      await Promise.all(promises);
    } else {
      console.log(chalk.gray(`🪝 Hook '${name}' emitted (no handlers)`));
    }

    // Execute workflows if configured
    if (this.config?.hooks[name]?.workflows) {
      await this.executeWorkflows(name, data, fullContext);
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

    console.log(
      chalk.blue(
        `⚙️  Executing workflows for '${hookName}': ${hookConfig.workflows.join(', ')}`
      )
    );

    for (const workflowName of hookConfig.workflows) {
      try {
        await this.executeWorkflow(workflowName, data, context);
      } catch (error) {
        console.error(
          chalk.red(`❌ Failed to execute workflow '${workflowName}':`),
          error
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
    // For now, we'll implement basic workflow execution
    // In the future, this will load and execute actual workflow files
    console.log(chalk.gray(`  📋 Executing workflow: ${workflowName}`));

    // Simulate workflow execution
    await new Promise((resolve) => setTimeout(resolve, 100));

    await this.logHook('workflow', workflowName, data, context);
  }

  /**
   * Log hook activity
   */
  private async logHook(
    type: string,
    name: string,
    data: any,
    context: HookContext
  ): Promise<void> {
    if (!this.logPath) return;

    const logEntry = {
      type,
      name,
      data,
      context,
      timestamp: new Date().toISOString(),
    };

    try {
      await writeFile(this.logPath, JSON.stringify(logEntry) + '\n', {
        flag: 'a',
      });
    } catch (error) {
      // Silently fail logging
    }
  }

  /**
   * Remove a hook listener
   */
  removeHook(name: string, handler: HookHandler): void {
    const handlers = this.listeners.get(name);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  /**
   * Get all registered hooks
   */
  getRegisteredHooks(): string[] {
    return Array.from(this.listeners.keys());
  }

  /**
   * Get hook configuration
   */
  getConfiguration(): HookConfig | null {
    return this.config;
  }

  /**
   * Update hook configuration
   */
  async updateConfiguration(config: Partial<HookConfig>): Promise<void> {
    if (this.config) {
      this.config = { ...this.config, ...config };
      await this.saveConfiguration();
    }
  }

  // Default hook handlers
  private onInitialized(data: any, context: HookContext): void {
    console.log(chalk.green('🎉 CivicPress initialized'));
  }

  private onRecordCreated(data: any, context: HookContext): void {
    console.log(
      chalk.blue(`📄 Record created: ${data?.record?.title || 'Unknown'}`)
    );
  }

  private onRecordUpdated(data: any, context: HookContext): void {
    console.log(
      chalk.blue(`📝 Record updated: ${data?.record?.title || 'Unknown'}`)
    );
  }

  private onRecordCommitted(data: any, context: HookContext): void {
    console.log(
      chalk.green(`💾 Record committed: ${data?.record?.title || 'Unknown'}`)
    );
  }

  private onStatusChanged(data: any, context: HookContext): void {
    console.log(
      chalk.yellow(
        `🔄 Status changed: ${data?.record?.title || 'Unknown'} → ${data?.newStatus}`
      )
    );
  }

  private onValidationFailed(data: any, context: HookContext): void {
    console.log(
      chalk.red(`❌ Validation failed: ${data?.record?.title || 'Unknown'}`)
    );
  }
}
