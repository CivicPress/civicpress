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
import docsRouter from './routes/docs';

// Import middleware
import { errorHandler } from './middleware/error-handler';
import { notFoundHandler } from './middleware/not-found';
import { authMiddleware } from './middleware/auth';

export class CivicPressAPI {
  private app: express.Application;
  private civicPress: CivicPress | null = null;
  private port: number;

  constructor(port: number = 3000) {
    this.port = port;
    this.app = express();
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

    // Request logging
    this.app.use((req, res, next) => {
      logger.info(`${req.method} ${req.path}`, {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
      });
      next();
    });
  }

  async initialize(dataDir: string): Promise<void> {
    try {
      logger.info('Initializing CivicPress API...');

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

      // Setup routes after CivicPress is initialized
      logger.info('Setting up routes...');
      this.setupRoutes();

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

    // Auth routes (no auth required) - these need CivicPress instance
    this.app.use(
      '/auth',
      (req, res, next) => {
        (req as any).civicPress = this.civicPress;
        next();
      },
      authRouter
    );

    // Protected routes (require authentication)
    this.app.use('/api', authMiddleware(this.civicPress), (req, res, next) => {
      // Add CivicPress instance to request for route handlers
      (req as any).civicPress = this.civicPress;
      next();
    });

    this.app.use('/api/records', createRecordsRouter(recordsService));
    this.app.use('/api/search', searchRouter);
    this.app.use('/api/export', exportRouter);
    this.app.use('/api/import', importRouter);
    this.app.use('/api/hooks', hooksRouter);
    this.app.use('/api/templates', templatesRouter);
    this.app.use('/api/workflows', workflowsRouter);
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
}

// Start server if this file is run directly
if (require.main === module) {
  // Determine data directory - if running from root, use ./data, otherwise use relative path
  const isRunningFromRoot = process.cwd().endsWith('civicpress');
  const dataDir =
    process.env.CIVIC_DATA_DIR || (isRunningFromRoot ? './data' : '../../data');
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
