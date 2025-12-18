import * as path from 'path';
import { ConfigDiscovery } from './config/config-discovery.js';
import { WorkflowEngine } from './workflows/workflow-engine.js';
import { GitEngine } from './git/git-engine.js';
import { HookSystem } from './hooks/hook-system.js';
import { DatabaseService } from './database/database-service.js';
import { AuthService } from './auth/auth-service.js';
import { RecordManager } from './records/record-manager.js';
import { TemplateEngine } from './utils/template-engine.js';
import { IndexingService } from './indexing/indexing-service.js';
import { Logger } from './utils/logger.js';
import { coreOutput } from './utils/core-output.js';
import {
  NotificationService,
  NotificationConfig,
} from './notifications/index.js';
import { UnifiedCacheManager } from './cache/unified-cache-manager.js';
import { Geography } from './types/geography.js';
import { ServiceContainer } from './di/container.js';
import {
  registerCivicPressServices,
  completeServiceInitialization,
} from './civic-core-services.js';

export interface CivicPressConfig {
  dataDir: string;
  database?: {
    type: 'sqlite' | 'postgres';
    sqlite?: {
      file: string;
    };
    postgres?: {
      url: string;
    };
  };
  logger?: {
    json?: boolean;
    silent?: boolean;
    quiet?: boolean;
    verbose?: boolean;
    noColor?: boolean;
  };
}

export interface LinkedRecord {
  id: string;
  type: string;
  description: string;
  path?: string;
  category?: string;
}

export interface LinkedGeographyFile {
  id: string;
  name: string;
  description?: string;
}

export interface CreateRecordRequest {
  title: string;
  type: string;
  content?: string;
  metadata?: Record<string, any>;
  status?: string; // Legal status (stored in YAML + DB)
  workflowState?: string; // Internal editorial status (DB-only, never in YAML)
  createdAt?: string;
  updatedAt?: string;
  relativePath?: string;
  skipSaga?: boolean; // Skip saga pattern (for sync operations that update DB only)
  skipFileGeneration?: boolean; // Skip file generation/updates
  skipAudit?: boolean; // Skip audit logging (for sync operations)
  skipHooks?: boolean; // Skip hook emissions (for sync operations)
  geography?: Geography;
  attachedFiles?: Array<{
    id: string;
    path: string;
    original_name: string;
    description?: string;
    category?:
      | string
      | {
          label: string;
          value: string;
          description: string;
        };
  }>;
  linkedRecords?: LinkedRecord[];
  linkedGeographyFiles?: LinkedGeographyFile[];
  role?: string;

  // Authorship - support both formats
  authors?: Array<{
    name: string;
    username: string;
    role?: string;
    email?: string;
  }>;

  // Source & Origin - for imported/legacy documents
  source?: {
    reference: string;
    original_title?: string;
    original_filename?: string;
    url?: string;
    type?: 'legacy' | 'import' | 'external';
    imported_at?: string;
    imported_by?: string;
  };
}

export interface UpdateRecordRequest {
  title?: string;
  content?: string;
  status?: string; // Legal status (stored in YAML + DB)
  workflowState?: string; // Internal editorial status (DB-only, never in YAML)
  relativePath?: string;
  skipSaga?: boolean; // Skip saga pattern (for sync operations that update DB only)
  skipFileGeneration?: boolean; // Skip file generation/updates
  skipAudit?: boolean; // Skip audit logging (for sync operations)
  skipHooks?: boolean; // Skip hook emissions (for sync operations)
  metadata?: Record<string, any>;
  geography?: Geography;
  attachedFiles?: Array<{
    id: string;
    path: string;
    original_name: string;
    description?: string;
    category?:
      | string
      | {
          label: string;
          value: string;
          description: string;
        };
  }>;
  linkedRecords?: LinkedRecord[];
  linkedGeographyFiles?: LinkedGeographyFile[];

  // Authorship - support both formats
  authors?: Array<{
    name: string;
    username: string;
    role?: string;
    email?: string;
  }>;

  // Source & Origin - for imported/legacy documents
  source?: {
    reference: string;
    original_title?: string;
    original_filename?: string;
    url?: string;
    type?: 'legacy' | 'import' | 'external';
    imported_at?: string;
    imported_by?: string;
  };
}

export class CivicPress {
  private config: CivicPressConfig;
  private container: ServiceContainer;
  private logger: Logger;

  // Keep private properties for backward compatibility
  private _configDiscovery?: ConfigDiscovery;
  private _workflowEngine?: WorkflowEngine;
  private _gitEngine?: GitEngine;
  private _hookSystem?: HookSystem;
  private _databaseService?: DatabaseService;
  private _authService?: AuthService;
  private _recordManager?: RecordManager;
  private _templateEngine?: TemplateEngine;
  private _indexingService?: IndexingService;
  private _notificationService?: NotificationService;
  private _notificationConfig?: NotificationConfig;
  private _cacheManager?: UnifiedCacheManager;

  constructor(config: CivicPressConfig) {
    this.config = config;

    // Create dependency injection container
    this.container = new ServiceContainer();

    // Register all services
    registerCivicPressServices(this.container, config);

    // Get logger from container
    this.logger = this.container.resolve<Logger>('logger');

    // Debug: log the config being passed (only in verbose mode)
    if (this.logger.isVerbose()) {
      this.logger.info('CivicPress constructor - config:', config);
      this.logger.info(
        'CivicPress constructor - config.dataDir:',
        config.dataDir
      );
      this.logger.info(
        'CivicPress constructor - typeof config.dataDir:',
        typeof config.dataDir
      );
    }

    // Note: completeServiceInitialization is now async and will be called during initialize()

    // Initialize lazy-loaded service references for backward compatibility
    this.initializeServiceReferences();
  }

  /**
   * Initialize service references for backward compatibility
   * These are lazy-loaded from the container
   */
  private initializeServiceReferences(): void {
    // Services are resolved on-demand from container
    // This method ensures getters work correctly
  }

  async initialize(): Promise<void> {
    try {
      this.logger.info('Initializing CivicPress...');

      // Initialize database first
      const db = this.container.resolve<DatabaseService>('database');
      await db.initialize();
      this.logger.info('Database initialized');

      // Complete service initialization (cache registration, etc.)
      const { completeServiceInitialization } = await import(
        './civic-core-services.js'
      );
      await completeServiceInitialization(this.container, this);

      // Initialize other services
      const workflow = this.container.resolve<WorkflowEngine>('workflow');
      await workflow.initialize();

      const git = this.container.resolve<GitEngine>('git');
      await git.initialize();

      const hooks = this.container.resolve<HookSystem>('hooks');
      await hooks.initialize();

      this.logger.info('CivicPress initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize CivicPress:', error);
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    try {
      this.logger.info('Shutting down CivicPress...');

      // Close database connection
      const db = this.container.resolve<DatabaseService>('database');
      await db.close();

      this.logger.info('CivicPress shutdown complete');
    } catch (error) {
      this.logger.error('Error during shutdown:', error);
      throw error;
    }
  }

  // Database and Auth services
  getDatabaseService(): DatabaseService {
    if (!this._databaseService) {
      this._databaseService =
        this.container.resolve<DatabaseService>('database');
    }
    return this._databaseService;
  }

  getAuthService(): AuthService {
    if (!this._authService) {
      this._authService = this.container.resolve<AuthService>('auth');
    }
    return this._authService;
  }

  getRecordManager(): RecordManager {
    if (!this._recordManager) {
      this._recordManager =
        this.container.resolve<RecordManager>('recordManager');
    }
    return this._recordManager;
  }

  getIndexingService(): IndexingService {
    // Always resolve from container to get the latest instance
    // (in case it was replaced during initialization)
    const service = this.container.resolve<IndexingService>('indexing');
    // Cache it for backward compatibility
    this._indexingService = service;
    return service;
  }

  // Existing services
  getConfigDiscovery(): ConfigDiscovery {
    if (!this._configDiscovery) {
      this._configDiscovery =
        this.container.resolve<ConfigDiscovery>('configDiscovery');
    }
    return this._configDiscovery;
  }

  getWorkflowEngine(): WorkflowEngine {
    if (!this._workflowEngine) {
      this._workflowEngine = this.container.resolve<WorkflowEngine>('workflow');
    }
    return this._workflowEngine;
  }

  getGitEngine(): GitEngine {
    if (!this._gitEngine) {
      this._gitEngine = this.container.resolve<GitEngine>('git');
    }
    return this._gitEngine;
  }

  getHookSystem(): HookSystem {
    if (!this._hookSystem) {
      this._hookSystem = this.container.resolve<HookSystem>('hooks');
    }
    return this._hookSystem;
  }

  getTemplateEngine(): TemplateEngine {
    if (!this._templateEngine) {
      this._templateEngine = this.container.resolve<TemplateEngine>('template');
    }
    return this._templateEngine;
  }

  getNotificationService(): NotificationService {
    if (!this._notificationService) {
      this._notificationService =
        this.container.resolve<NotificationService>('notification');
    }
    return this._notificationService;
  }

  getNotificationConfig(): NotificationConfig {
    if (!this._notificationConfig) {
      this._notificationConfig =
        this.container.resolve<NotificationConfig>('notificationConfig');
    }
    return this._notificationConfig;
  }

  getCacheManager(): UnifiedCacheManager {
    if (!this._cacheManager) {
      this._cacheManager =
        this.container.resolve<UnifiedCacheManager>('cacheManager');
    }
    return this._cacheManager;
  }

  /**
   * Get a service directly from the container
   * This is the new preferred way to access services
   *
   * @param key - Service key (string or class constructor)
   * @returns Service instance
   */
  getService<T>(key: string | any): T {
    return this.container.resolve<T>(key);
  }

  getDataDir(): string {
    return this.config.dataDir;
  }

  // Health check
  async healthCheck(): Promise<{
    status: 'healthy' | 'unhealthy';
    database: boolean;
  }> {
    const db = this.container.resolve<DatabaseService>('database');
    const dbHealthy = await db.healthCheck();
    const status = dbHealthy ? 'healthy' : 'unhealthy';

    return {
      status,
      database: dbHealthy,
    };
  }
}
