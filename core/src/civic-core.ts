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
import { initializeRoleManager } from './auth/role-utils.js';
import { coreOutput } from './utils/core-output.js';
import {
  NotificationService,
  NotificationConfig,
} from './notifications/index.js';
import { Geography } from './types/geography.js';

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
  skipFileGeneration?: boolean;
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
  private configDiscovery: ConfigDiscovery;
  private workflowEngine: WorkflowEngine;
  private gitEngine: GitEngine;
  private hookSystem: HookSystem;
  private databaseService: DatabaseService;
  private authService: AuthService;
  private recordManager: RecordManager;
  private templateEngine: TemplateEngine;
  private indexingService: IndexingService;
  private notificationService: NotificationService;
  private notificationConfig: NotificationConfig;
  private logger: Logger;

  constructor(config: CivicPressConfig) {
    this.config = config;

    // Create logger with options from config
    const loggerOptions = config.logger || {};
    this.logger = new Logger(loggerOptions);

    // Configure core output with the same options
    coreOutput.setOptions(loggerOptions);

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

    // Initialize database service
    const dbConfig = config.database || {
      type: 'sqlite' as const,
      sqlite: {
        file: `.system-data/civic.db`,
      },
    };

    this.databaseService = new DatabaseService(dbConfig, this.logger);
    this.authService = new AuthService(this.databaseService, config.dataDir);

    // Initialize role manager
    initializeRoleManager(config.dataDir);

    // Initialize other services
    this.configDiscovery = new ConfigDiscovery();
    this.workflowEngine = new WorkflowEngine();
    this.gitEngine = new GitEngine(config.dataDir);
    this.hookSystem = new HookSystem(config.dataDir);
    this.templateEngine = new TemplateEngine(config.dataDir);

    // Initialize indexing service and integrate with workflow engine
    this.indexingService = new IndexingService(this, config.dataDir);
    this.workflowEngine.setIndexingService(this.indexingService);

    this.recordManager = new RecordManager(
      this.databaseService,
      this.gitEngine,
      this.hookSystem,
      this.workflowEngine,
      this.templateEngine,
      config.dataDir
    );

    // Initialize notification system
    this.notificationConfig = new NotificationConfig(config.dataDir);
    this.notificationService = new NotificationService(this.notificationConfig);
  }

  async initialize(): Promise<void> {
    try {
      this.logger.info('Initializing CivicPress...');

      // Initialize database first
      await this.databaseService.initialize();
      this.logger.info('Database initialized');

      // Initialize other services
      await this.workflowEngine.initialize();
      await this.gitEngine.initialize();
      await this.hookSystem.initialize();

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
      await this.databaseService.close();

      this.logger.info('CivicPress shutdown complete');
    } catch (error) {
      this.logger.error('Error during shutdown:', error);
      throw error;
    }
  }

  // Database and Auth services
  getDatabaseService(): DatabaseService {
    return this.databaseService;
  }

  getAuthService(): AuthService {
    return this.authService;
  }

  getRecordManager(): RecordManager {
    return this.recordManager;
  }

  getIndexingService(): IndexingService {
    return this.indexingService;
  }

  // Existing services
  getConfigDiscovery(): ConfigDiscovery {
    return this.configDiscovery;
  }

  getWorkflowEngine(): WorkflowEngine {
    return this.workflowEngine;
  }

  getGitEngine(): GitEngine {
    return this.gitEngine;
  }

  getHookSystem(): HookSystem {
    return this.hookSystem;
  }

  getNotificationService(): NotificationService {
    return this.notificationService;
  }

  getNotificationConfig(): NotificationConfig {
    return this.notificationConfig;
  }

  getDataDir(): string {
    return this.config.dataDir;
  }

  // Health check
  async healthCheck(): Promise<{
    status: 'healthy' | 'unhealthy';
    database: boolean;
  }> {
    const dbHealthy = await this.databaseService.healthCheck();
    const status = dbHealthy ? 'healthy' : 'unhealthy';

    return {
      status,
      database: dbHealthy,
    };
  }
}
