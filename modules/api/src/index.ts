import express from 'express';
import cors from 'cors';
import { CivicPress, Logger, CentralConfigManager } from '@civicpress/core';

const logger = new Logger();

// Import routes
import authRouter from './routes/auth';
import { healthRouter } from './routes/health';
import { createRecordsRouter } from './routes/records';
import { RecordsService } from './services/records-service';
import { searchRouter } from './routes/search';
import { exportRouter } from './routes/export';
import { importRouter } from './routes/import';
import { hooksRouter } from './routes/hooks';
import { templatesRouter } from './routes/templates';
import { workflowsRouter } from './routes/workflows';
import { createIndexingRouter } from './routes/indexing';
import { createHistoryRouter } from './routes/history';
import { createStatusRouter } from './routes/status';
import docsRouter from './routes/docs';
import { createValidationRouter } from './routes/validation';
import { createDiffRouter } from './routes/diff';
import {
  router as usersRouter,
  registrationRouter,
  authenticationRouter,
} from './routes/users';
import infoRouter from './routes/info';
import configRouter from './routes/config';

// Import middleware
import { errorHandler, requestIdMiddleware } from './middleware/error-handler';
import { notFoundHandler } from './middleware/not-found';
import {
  apiLoggingMiddleware,
  authLoggingMiddleware,
  performanceMonitoringMiddleware,
  requestContextMiddleware,
} from './middleware/logging';
import { authMiddleware } from './middleware/auth';
import { delayMiddleware } from './middleware/delay';

export class CivicPressAPI {
  private app: express.Application;
  private civicPress: CivicPress | null = null;
  private port: number;

  constructor(port: number = 3000) {
    this.port = port;
    this.app = express();

    // Custom middleware to catch JSON parse errors (must be first, outside setupMiddleware)
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(
      (
        err: any,
        req: express.Request,
        res: express.Response,
        next: express.NextFunction
      ) => {
        if (err instanceof SyntaxError && 'body' in err) {
          (err as any).statusCode = 400;
          (err as any).message = 'Malformed JSON';
          return errorHandler(err, req, res, next);
        }
        next(err);
      }
    );

    this.setupMiddleware();
  }

  private setupMiddleware(): void {
    // CORS
    this.app.use(
      cors({
        origin: process.env.CORS_ORIGIN || '*',
        credentials: true,
      })
    );

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));

    // Enhanced request logging and tracing
    this.app.use(requestIdMiddleware);
    this.app.use(requestContextMiddleware);
    this.app.use(performanceMonitoringMiddleware);
    this.app.use(apiLoggingMiddleware);
    this.app.use(authLoggingMiddleware);

    // Add delay middleware for testing loading states (development only)
    this.app.use(delayMiddleware(2000));
  }

  async initialize(dataDir: string): Promise<void> {
    try {
      logger.info('Initializing CivicPress API...');

      // Change to project root directory to ensure database paths are resolved correctly
      const projectRoot = this.findProjectRoot();
      if (projectRoot && process.cwd() !== projectRoot) {
        logger.info(`Changing to project root: ${projectRoot}`);
        process.chdir(projectRoot);
      }

      // Load database config from central config
      logger.info('Loading database config...');
      const dbConfig = CentralConfigManager.getDatabaseConfig();
      logger.info('Database config loaded:', dbConfig);

      // Initialize CivicPress core
      logger.info('Creating CivicPress instance...');
      this.civicPress = new CivicPress({
        dataDir,
        database: dbConfig,
      });

      logger.info('Initializing CivicPress core...');
      await this.civicPress.initialize();
      logger.info('CivicPress core initialized');

      // Auto-index records on startup (optional)
      const enableAutoIndexing = process.env.ENABLE_AUTO_INDEXING === 'true';
      if (enableAutoIndexing) {
        logger.info('Auto-indexing records on startup...');
        try {
          const indexingService = this.civicPress.getIndexingService();
          if (indexingService) {
            await indexingService.generateIndexes({
              syncDatabase: true,
              conflictResolution: 'file-wins',
            });
            logger.info('Auto-indexing completed successfully');
          } else {
            logger.warn('IndexingService not available for auto-indexing');
          }
        } catch (error) {
          logger.warn('Auto-indexing failed, continuing without sync:', error);
        }
      } else {
        logger.info(
          'Auto-indexing disabled on startup (use ENABLE_AUTO_INDEXING=true to enable)'
        );
      }

      // Setup routes after CivicPress is initialized
      logger.info('Setting up routes...');
      this.setupRoutes();

      // Load auth configuration
      logger.info('Loading auth configuration...');
      const { AuthConfigManager } = await import('@civicpress/core');
      await AuthConfigManager.getInstance().loadConfig();
      logger.info('Auth configuration loaded');

      // Error handling middleware (must be last)
      this.app.use(notFoundHandler);
      this.app.use(errorHandler);

      logger.info('CivicPress API initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize CivicPress API:', error);
      console.error('Full error details:', error);
      throw error;
    }
  }

  private findProjectRoot(): string | null {
    let currentPath = process.cwd();
    const rootPath = require('path').parse(currentPath).root;

    while (currentPath !== rootPath) {
      const civicrcPath = require('path').join(currentPath, '.civicrc');
      if (require('fs').existsSync(civicrcPath)) {
        return currentPath;
      }
      const parentPath = require('path').dirname(currentPath);
      if (parentPath === currentPath) {
        break;
      }
      currentPath = parentPath;
    }

    return null;
  }

  private setupRoutes(): void {
    if (!this.civicPress) {
      throw new Error('CivicPress not initialized');
    }

    // Create RecordsService instance
    const recordsService = new RecordsService(this.civicPress);

    // Health check (no auth required)
    this.app.use('/health', healthRouter);

    // Documentation (no auth required)
    this.app.use('/docs', docsRouter);

    // Info endpoint (no auth required)
    this.app.use('/info', infoRouter);

    // Auth routes (no auth required) - these need CivicPress instance
    this.app.use(
      '/auth',
      (req, res, next) => {
        (req as any).civicPress = this.civicPress;
        next();
      },
      authRouter
    );

    // Public user registration endpoint (no auth required) - must come before general API middleware
    this.app.use(
      '/api/users/register',
      (req, res, next) => {
        (req as any).civicPress = this.civicPress;
        next();
      },
      registrationRouter
    );

    // Public authentication endpoint (no auth required) - must come before general API middleware
    this.app.use(
      '/api/users/auth',
      (req, res, next) => {
        (req as any).civicPress = this.civicPress;
        next();
      },
      authenticationRouter
    );

    // Public API routes (no authentication required)
    this.app.use('/api', (req, res, next) => {
      // Add CivicPress instance to request for route handlers
      (req as any).civicPress = this.civicPress;
      next();
    });

    // Public routes that should be accessible to guests
    this.app.use('/api/records', createRecordsRouter(recordsService));
    this.app.use('/api/search', searchRouter);
    this.app.use('/api/status', createStatusRouter());
    this.app.use('/api/validation', createValidationRouter());
    this.app.use('/api/config', configRouter);

    // Protected routes that require authentication
    this.app.use('/api/export', authMiddleware(this.civicPress), exportRouter);
    this.app.use('/api/import', authMiddleware(this.civicPress), importRouter);
    this.app.use('/api/hooks', authMiddleware(this.civicPress), hooksRouter);
    this.app.use(
      '/api/templates',
      authMiddleware(this.civicPress),
      templatesRouter
    );
    this.app.use(
      '/api/workflows',
      authMiddleware(this.civicPress),
      workflowsRouter
    );
    this.app.use(
      '/api/indexing',
      authMiddleware(this.civicPress),
      createIndexingRouter()
    );
    this.app.use(
      '/api/history',
      authMiddleware(this.civicPress),
      createHistoryRouter()
    );
    this.app.use(
      '/api/diff',
      authMiddleware(this.civicPress),
      createDiffRouter()
    );
    this.app.use('/api/users', authMiddleware(this.civicPress), usersRouter);
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      const server = this.app.listen(this.port, () => {
        logger.info(`CivicPress API server running on port ${this.port}`);
        resolve();
      });

      server.on('error', (error) => {
        logger.error('Failed to start API server:', error);
        reject(error);
      });
    });
  }

  async shutdown(): Promise<void> {
    if (this.civicPress) {
      await this.civicPress.shutdown();
    }
    logger.info('CivicPress API server shutdown complete');
  }

  getApp(): express.Application {
    return this.app;
  }

  // Expose CivicPress core instance for testing
  getCivicPress(): CivicPress | null {
    return this.civicPress;
  }
}

// Start server if this file is run directly
if (require.main === module) {
  // Use CentralConfigManager to get both data directory and database config
  const { CentralConfigManager } = require('@civicpress/core');
  const dataDir = CentralConfigManager.getDataDir();
  const port = parseInt(process.env.PORT || '3000');

  const api = new CivicPressAPI(port);

  api
    .initialize(dataDir)
    .then(() => api.start())
    .then(() => {
      logger.info('CivicPress API server started successfully');
    })
    .catch((error) => {
      logger.error('Failed to start CivicPress API server:', error);
      process.exit(1);
    });

  // Graceful shutdown
  process.on('SIGINT', async () => {
    logger.info('Received SIGINT, shutting down gracefully...');
    await api.shutdown();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM, shutting down gracefully...');
    await api.shutdown();
    process.exit(0);
  });
}
// Test comment for watch
