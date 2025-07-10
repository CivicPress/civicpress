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

const logger = new Logger();

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
}

export interface CreateRecordRequest {
  title: string;
  type: string;
  content?: string;
  metadata?: Record<string, any>;
  role?: string;
}

export interface UpdateRecordRequest {
  title?: string;
  content?: string;
  status?: string;
  metadata?: Record<string, any>;
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

  constructor(config: CivicPressConfig) {
    this.config = config;

    // Initialize database service
    const dbConfig = config.database || {
      type: 'sqlite' as const,
      sqlite: {
        file: `.system-data/civic.db`,
      },
    };

    this.databaseService = new DatabaseService(dbConfig);
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
  }

  async initialize(): Promise<void> {
    try {
      logger.info('Initializing CivicPress...');

      // Initialize database first
      await this.databaseService.initialize();
      logger.info('Database initialized');

      // Initialize other services
      await this.workflowEngine.initialize();
      await this.gitEngine.initialize();
      await this.hookSystem.initialize();

      logger.info('CivicPress initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize CivicPress:', error);
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    try {
      logger.info('Shutting down CivicPress...');

      // Close database connection
      await this.databaseService.close();

      logger.info('CivicPress shutdown complete');
    } catch (error) {
      logger.error('Error during shutdown:', error);
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
