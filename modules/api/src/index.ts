import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { CivicPress } from '@civicpress/core';
import path from 'path';
import { healthRouter } from './routes/health';
import { recordsRouter } from './routes/records';
import { templatesRouter } from './routes/templates';
import { workflowsRouter } from './routes/workflows';
import { hooksRouter } from './routes/hooks';
import { exportRouter } from './routes/export';
import { importRouter } from './routes/import';
import { searchRouter } from './routes/search';
import docsRouter from './routes/docs';
import { errorHandler } from './middleware/error-handler';
import { notFoundHandler } from './middleware/not-found';

export interface ApiServerOptions {
  port?: number;
  host?: string;
  corsOrigin?: string | string[];
  rateLimitWindowMs?: number;
  rateLimitMax?: number;
  enableAuth?: boolean;
  dataDir?: string;
}

export class CivicPressApi {
  private app: express.Application;
  private server: any;
  private civicPress: CivicPress;
  private options: Required<ApiServerOptions>;

  constructor(options: ApiServerOptions = {}) {
    // Determine the data directory - default to project root/data
    const dataDir =
      options.dataDir || path.resolve(process.cwd(), '../../data');

    // Set environment variable for CivicPress core to find the config
    process.env.CIVIC_DATA_DIR = dataDir;

    this.options = {
      port: options.port || 3000,
      host: options.host || 'localhost',
      corsOrigin: options.corsOrigin || '*',
      rateLimitWindowMs: options.rateLimitWindowMs || 15 * 60 * 1000, // 15 minutes
      rateLimitMax: options.rateLimitMax || 100,
      enableAuth: options.enableAuth || false,
      dataDir,
    };

    this.civicPress = new CivicPress();
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  private setupMiddleware(): void {
    // Security middleware with more permissive CSP for Hoppscotch
    this.app.use(
      helmet({
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'", 'https:', 'data:'],
            styleSrc: ["'self'", "'unsafe-inline'", 'https:', 'data:'],
            scriptSrc: ["'self'", "'unsafe-inline'", 'https:', 'data:'],
            frameSrc: ["'self'", 'https:', 'data:'],
            frameAncestors: ["'self'", 'https:', 'data:'],
            imgSrc: ["'self'", 'data:', 'https:'],
            connectSrc: ["'self'", 'https:', 'data:'],
            fontSrc: ["'self'", 'https:', 'data:'],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'", 'https:', 'data:'],
          },
        },
      })
    );

    // CORS
    this.app.use(
      cors({
        origin: this.options.corsOrigin,
        credentials: true,
      })
    );

    // Compression
    this.app.use(compression());

    // Logging
    this.app.use(morgan('combined'));

    // Rate limiting
    const limiter = rateLimit({
      windowMs: this.options.rateLimitWindowMs,
      max: this.options.rateLimitMax,
      message: {
        error: 'Too many requests from this IP, please try again later.',
      },
      standardHeaders: true,
      legacyHeaders: false,
    });
    this.app.use(limiter);

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  }

  private setupRoutes(): void {
    // Health check (no auth required)
    this.app.use('/health', healthRouter);

    // API routes (versioned)
    this.app.use('/api/v1/records', recordsRouter);
    this.app.use('/api/v1/templates', templatesRouter);
    this.app.use('/api/v1/workflows', workflowsRouter);
    this.app.use('/api/v1/hooks', hooksRouter);
    this.app.use('/api/v1/export', exportRouter);
    this.app.use('/api/v1/import', importRouter);
    this.app.use('/api/v1/search', searchRouter);
    this.app.use('/api/v1/docs', docsRouter);

    // Root endpoint
    this.app.get('/', (req, res) => {
      res.json({
        name: 'CivicPress API',
        version: '1.0.0',
        description: 'REST API for CivicPress governance platform',
        documentation: '/api/v1/docs',
        dataDir: this.options.dataDir,
        endpoints: {
          records: '/api/v1/records',
          templates: '/api/v1/templates',
          workflows: '/api/v1/workflows',
          hooks: '/api/v1/hooks',
          export: '/api/v1/export',
          import: '/api/v1/import',
          search: '/api/v1/search',
          docs: '/api/v1/docs',
          health: '/health',
        },
      });
    });
  }

  private setupErrorHandling(): void {
    // 404 handler
    this.app.use(notFoundHandler);

    // Global error handler
    this.app.use(errorHandler);
  }

  /**
   * Get the Express app instance
   */
  getApp(): express.Application {
    return this.app;
  }

  /**
   * Get the CivicPress instance
   */
  getCivicPress(): CivicPress {
    return this.civicPress;
  }

  /**
   * Start the API server
   */
  async start(): Promise<void> {
    try {
      // Initialize CivicPress
      await this.civicPress.getCore().initialize();

      // Start server
      this.server = this.app.listen(
        this.options.port,
        this.options.host,
        () => {
          console.log(
            `🚀 CivicPress API server running on http://${this.options.host}:${this.options.port}`
          );
          console.log(
            `📚 API Documentation: http://${this.options.host}:${this.options.port}/api/v1/docs`
          );
          console.log(
            `💚 Health Check: http://${this.options.host}:${this.options.port}/health`
          );
          console.log(`📁 Data Directory: ${this.options.dataDir}`);
        }
      );
    } catch (error) {
      console.error('Failed to start CivicPress API server:', error);
      throw error;
    }
  }

  /**
   * Stop the API server
   */
  async stop(): Promise<void> {
    if (this.server) {
      return new Promise((resolve, reject) => {
        this.server.close((err: any) => {
          if (err) {
            reject(err);
          } else {
            console.log('🛑 CivicPress API server stopped');
            resolve();
          }
        });
      });
    }
  }
}

// Export for use as module
export default CivicPressApi;

// Start server if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const api = new CivicPressApi();
  api.start().catch(console.error);
}
