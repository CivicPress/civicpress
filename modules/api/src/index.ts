import express from 'express';
import { HttpError } from './utils/http-error.js';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import {
  CivicPress,
  Logger,
  CentralConfigManager,
  GeographyManager,
} from '@civicpress/core';

const logger = new Logger();

// Import routes
import authRouter from './routes/auth.js';
import { healthRouter } from './routes/health.js';
import { createRecordsRouter } from './routes/records.js';
import { RecordsService } from './services/records-service.js';
import { searchRouter } from './routes/search.js';
import { exportRouter } from './routes/export.js';
import { importRouter } from './routes/import.js';
import { hooksRouter } from './routes/hooks.js';
import { templatesRouter } from './routes/templates.js';
import { workflowsRouter } from './routes/workflows.js';
import { createIndexingRouter } from './routes/indexing.js';
import { createHistoryRouter } from './routes/history.js';
import { createStatusRouter } from './routes/status.js';
import { createDiagnoseRouter } from './routes/diagnose.js';
import docsRouter from './routes/docs.js';
import { createValidationRouter } from './routes/validation.js';
import { createDiffRouter } from './routes/diff.js';
import { createAuditRouter } from './routes/audit.js';
import notificationsRouter from './routes/notifications.js';
import uuidStorageRouter from './routes/uuid-storage.js';
import {
  router as usersRouter,
  registrationRouter,
  authenticationRouter,
  publicRouter,
  emailVerificationRouter,
} from './routes/users.js';
import infoRouter from './routes/info.js';
import configRouter from './routes/config.js';
import systemRouter from './routes/system.js';
import { createGeographyRouter } from './routes/geography.js';
import { createCacheRouter } from './routes/cache.js';
import { apiPath } from './constants.js';

// Import middleware
import {
  errorHandler,
  requestIdMiddleware,
} from './middleware/error-handler.js';
import { notFoundHandler } from './middleware/not-found.js';
import {
  apiLoggingMiddleware,
  authLoggingMiddleware,
  performanceMonitoringMiddleware,
  requestContextMiddleware,
  createDatabaseContextMiddleware,
} from './middleware/logging.js';
import { authMiddleware, optionalAuth } from './middleware/auth.js';
import { csrfMiddleware } from './middleware/csrf.js';
import {
  startInProcessRealtime,
  type RealtimeServerLike,
} from './realtime-bootstrap.js';
import type { RealtimeServer } from '@civicpress/realtime';
import { startInProcessTranscription } from './transcription-bootstrap.js';
import type { TranscriptionWorker } from '@civicpress/transcription';

export class CivicPressAPI {
  private app: express.Application;
  private civicPress: CivicPress | null = null;
  private port: number;
  private dataDir: string = '';
  // In-process realtime server (hosted in the SAME process as the API, but
  // listening on its own WS port). Null until start() wires it; null forever if
  // realtime is disabled or fails to start. The records router reaches it via
  // the narrow RealtimeServerLike contract for the snapshot endpoint.
  private realtimeServer: RealtimeServer | null = null;
  // True once the realtime WS server actually started listening. Used by the
  // snapshot provider so a constructed-but-not-listening server (e.g. port in
  // use) is treated as "not available" → graceful no-op snapshot.
  private realtimeStarted: boolean = false;
  // Test seam: lets tests inject a RealtimeServerLike stub WITHOUT starting the
  // real WS server (start() is not called in the API test harness).
  private realtimeServerOverride: RealtimeServerLike | null = null;
  // In-process transcription worker (BroadcastBox W2), hosted in the SAME
  // process as the API. Null until start() wires it; null forever if disabled /
  // engine unavailable / failed. Stopped on shutdown.
  private transcriptionWorker: TranscriptionWorker | null = null;

  constructor(port: number = 3000) {
    this.port = port;
    this.app = express();

    // Custom middleware to catch JSON parse errors (must be first, outside setupMiddleware)
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(
      (
        err: Error,
        req: express.Request,
        res: express.Response,
        next: express.NextFunction
      ) => {
        if (err instanceof SyntaxError && 'body' in err) {
          // Wrap the underlying SyntaxError in a typed HttpError so the
          // error handler can read statusCode without `as any`.
          return errorHandler(
            new HttpError(400, 'Malformed JSON', 'MALFORMED_JSON', {
              cause: err,
            }),
            req,
            res,
            next
          );
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
  }

  async initialize(dataDir: string): Promise<void> {
    try {
      logger.info('Initializing CivicPress API...');

      // Store dataDir for use in routes
      this.dataDir = dataDir;

      // Change to project root directory to ensure database paths are resolved correctly
      const projectRoot = this.findProjectRoot();
      if (projectRoot && process.cwd() !== projectRoot) {
        logger.info(`Changing to project root: ${projectRoot}`);
        process.chdir(projectRoot);
      }

      // Load database config from central config
      logger.info('Loading database config...');
      const dbConfig = CentralConfigManager.getDatabaseConfig();
      logger.info('Database config loaded');

      // Initialize CivicPress core
      logger.info('Creating CivicPress instance...');
      this.civicPress = new CivicPress({
        dataDir,
        database: dbConfig,
      });

      logger.info('Initializing CivicPress core...');
      await this.civicPress.initialize();
      // Core initialization message logged at core level (civic-core.ts)

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
            logger.info('Auto-indexing completed');
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

      logger.info('CivicPress API initialized');
    } catch (error) {
      logger.error('Failed to initialize CivicPress API:', error);
      throw error;
    }
  }

  private findProjectRoot(): string | null {
    let currentPath = process.cwd();
    const rootPath = path.parse(currentPath).root;

    while (currentPath !== rootPath) {
      const civicrcPath = path.join(currentPath, '.civicrc');
      if (fs.existsSync(civicrcPath)) {
        return currentPath;
      }
      const parentPath = path.dirname(currentPath);
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

    // Create service instances
    const recordsService = new RecordsService(this.civicPress);
    const geographyManager = new GeographyManager(this.dataDir);

    // Health check (no auth required)
    this.app.use(apiPath('health'), healthRouter);

    // Documentation (no auth required)
    this.app.use(apiPath('docs'), docsRouter);

    // Info endpoint (no auth required; uses optional token validation
    // via the injected civicPress — see api-001 fix in info.ts)
    this.app.use(
      apiPath('info'),
      (req, _res, next) => {
        req.civicPress = this.civicPress;
        next();
      },
      infoRouter
    );

    // Auth routes (no auth required) - these need CivicPress instance
    this.app.use(
      apiPath('auth'),
      (req, res, next) => {
        req.civicPress = this.civicPress;
        next();
      },
      authRouter
    );

    // Public user registration endpoint (no auth required) - must come before general API middleware
    this.app.use(
      apiPath('users/register'),
      createDatabaseContextMiddleware(this.civicPress, this.dataDir),
      registrationRouter
    );

    // Public authentication endpoint (no auth required) - must come before general API middleware
    this.app.use(
      apiPath('users/auth'),
      (req, res, next) => {
        req.civicPress = this.civicPress;
        next();
      },
      authenticationRouter
    );

    // Public routes that should be accessible to guests
    // Records router handles auth internally, but CSRF applies to browser requests.
    // The realtime server is passed as a LAZY provider: routes are wired here (in
    // initialize()) but realtime starts later (in start()), so the snapshot route
    // resolves it per-request via resolveRealtimeServer().
    this.app.use(
      apiPath('records'),
      csrfMiddleware(this.civicPress),
      createRecordsRouter(recordsService, () => this.resolveRealtimeServer())
    );
    this.app.use(
      apiPath('geography'),
      optionalAuth(this.civicPress),
      (req, _res, next) => {
        req.civicPress = this.civicPress;
        next();
      },
      createGeographyRouter(geographyManager)
    );
    this.app.use(
      apiPath('search'),
      optionalAuth(this.civicPress),
      (req, _res, next) => {
        req.civicPress = this.civicPress;
        next();
      },
      searchRouter
    );
    // Status routes (api-003 fix: inject civicPress; previously the
    // mount had no injection, so every status endpoint threw 500
    // outside of test fixtures.)
    this.app.use(
      apiPath('status'),
      (req, _res, next) => {
        req.civicPress = this.civicPress;
        next();
      },
      createStatusRouter()
    );

    // Cache metrics (requires auth)
    this.app.use(
      apiPath('cache'),
      authMiddleware(this.civicPress),
      (req, _res, next) => {
        req.civicPress = this.civicPress;
        next();
      },
      createCacheRouter(this.civicPress.getCacheManager())
    );

    this.app.use(
      apiPath('diagnose'),
      authMiddleware(this.civicPress),
      (req, _res, next) => {
        req.civicPress = this.civicPress;
        next();
      },
      createDiagnoseRouter()
    );
    // Validation routes (api-002 fix: add authMiddleware + civicPress
    // injection. Every route inside uses requirePermission('records:view')
    // which needs req.user populated by authMiddleware. Previously the
    // mount had neither, so all endpoints returned 401 in production.)
    this.app.use(
      apiPath('validation'),
      authMiddleware(this.civicPress),
      (req, _res, next) => {
        req.civicPress = this.civicPress;
        next();
      },
      createValidationRouter()
    );
    this.app.use(
      apiPath('config'),
      (req, _res, next) => {
        req.civicPress = this.civicPress;
        next();
      },
      // Config router has its own auth middleware, CSRF applies to browser requests
      csrfMiddleware(this.civicPress),
      configRouter
    );
    this.app.use(apiPath('system'), systemRouter);

    // Activity log (admin-only; behind auth middleware)
    this.app.use(
      apiPath('audit'),
      authMiddleware(this.civicPress),
      createAuditRouter()
    );

    // Notifications (admin-only; behind auth middleware)
    this.app.use(
      apiPath('notifications'),
      authMiddleware(this.civicPress),
      notificationsRouter
    );

    // Serve brand assets (logos, favicons, etc.)
    this.app.use(
      apiPath('brand-assets'),
      express.static(path.join(this.dataDir, '.civic', 'brand-assets'))
    );

    // Protected routes that require authentication
    this.app.use(
      apiPath('export'),
      authMiddleware(this.civicPress),
      exportRouter
    );
    this.app.use(
      apiPath('import'),
      authMiddleware(this.civicPress),
      importRouter
    );
    this.app.use(
      apiPath('hooks'),
      authMiddleware(this.civicPress),
      hooksRouter
    );
    this.app.use(
      apiPath('templates'),
      authMiddleware(this.civicPress),
      templatesRouter
    );
    this.app.use(
      apiPath('workflows'),
      authMiddleware(this.civicPress),
      workflowsRouter
    );
    this.app.use(
      apiPath('indexing'),
      authMiddleware(this.civicPress),
      createIndexingRouter()
    );
    this.app.use(
      apiPath('history'),
      authMiddleware(this.civicPress),
      createHistoryRouter()
    );
    this.app.use(
      apiPath('diff'),
      authMiddleware(this.civicPress),
      createDiffRouter()
    );
    // UUID-based storage API (for file attachments)
    this.app.use(
      apiPath('storage'),
      optionalAuth(this.civicPress),
      createDatabaseContextMiddleware(this.civicPress, this.dataDir),
      (req, _res, next) => {
        req.civicPress = this.civicPress;
        next();
      },
      uuidStorageRouter
    );
    this.app.use(
      apiPath('users/verify-email-change'),
      createDatabaseContextMiddleware(this.civicPress, this.dataDir),
      publicRouter
    ); // Public endpoints (no auth required)
    this.app.use(
      apiPath('users/verify-current-email'),
      createDatabaseContextMiddleware(this.civicPress, this.dataDir),
      emailVerificationRouter
    ); // Public endpoints (no auth required)
    this.app.use(
      apiPath('users'),
      authMiddleware(this.civicPress),
      csrfMiddleware(this.civicPress),
      usersRouter
    );

    logger.info('Routes registered');
  }

  async start(): Promise<void> {
    // 1. Start the API HTTP listener (the only thing whose failure should reject
    //    start() — a missing API port is fatal).
    await new Promise<void>((resolve, reject) => {
      const server = this.app.listen(this.port, () => {
        logger.info(`CivicPress API server running on port ${this.port}`);
        resolve();
      });

      server.on('error', (error) => {
        logger.error('Failed to start API server:', error);
        reject(error);
      });
    });

    // 2. Start the in-process realtime server (own WS port) AFTER core init +
    //    HTTP listener. It is config-gated (RealtimeConfig.enabled, plus the
    //    REALTIME_ENABLED env opt-out) and crash-safe: a realtime startup
    //    failure (e.g. port in use) is logged and swallowed so it never takes
    //    down the API. If it doesn't start, the snapshot endpoint degrades
    //    gracefully (no in-memory room → snapshotCreated false).
    await this.startRealtime();

    // 3. Start the in-process transcription worker (BroadcastBox W2) AFTER core
    //    init + HTTP listener. Config-gated (transcription.enabled + the
    //    TRANSCRIPTION_ENABLED env opt-out) + engine-availability-gated, and
    //    crash-safe: a failure here is logged and swallowed so it never takes
    //    down the API (the A/V stays public regardless).
    await this.startTranscription();
  }

  /**
   * Construct + start the in-process realtime server from the core services.
   * Idempotent-ish: only starts when core is initialized and no server is set.
   * Never throws — failures are logged and leave realtime unavailable.
   */
  private async startRealtime(): Promise<void> {
    if (!this.civicPress) {
      logger.warn('Cannot start realtime: CivicPress core not initialized');
      return;
    }
    if (this.realtimeServer) {
      return;
    }

    // Env opt-out: REALTIME_ENABLED=false hard-disables (skips construction).
    // Anything else leaves the decision to RealtimeConfig.enabled (default ON).
    const enabled = process.env.REALTIME_ENABLED !== 'false';

    const { server, started } = await startInProcessRealtime(
      this.civicPress,
      logger,
      enabled
    );
    this.realtimeServer = server;
    this.realtimeStarted = started;
  }

  /**
   * Start the in-process transcription worker from the core services. Reads the
   * `transcription:` config block; honors a TRANSCRIPTION_ENABLED=false env
   * opt-out. Never throws — failures leave the worker unstarted (A/V still public).
   */
  private async startTranscription(): Promise<void> {
    if (!this.civicPress) {
      logger.warn('Cannot start transcription: CivicPress core not initialized');
      return;
    }
    if (this.transcriptionWorker) {
      return;
    }
    const enabled = process.env.TRANSCRIPTION_ENABLED !== 'false';
    const rawConfig = CentralConfigManager.getTranscriptionConfig();
    const { worker } = await startInProcessTranscription(
      this.civicPress,
      rawConfig,
      logger,
      { enabled }
    );
    this.transcriptionWorker = worker;
  }

  /**
   * Resolve the realtime server for the records router's snapshot route.
   *
   * Returns (in priority order): the test override, else the real in-process
   * server IF it actually started listening, else null. A constructed-but-not-
   * listening server (e.g. failed on a port clash) resolves to null so the
   * endpoint reports a graceful no-op instead of touching a dead server.
   */
  private resolveRealtimeServer(): RealtimeServerLike | null {
    if (this.realtimeServerOverride) {
      return this.realtimeServerOverride;
    }
    if (this.realtimeServer && this.realtimeStarted) {
      return this.realtimeServer;
    }
    return null;
  }

  /**
   * Inject a RealtimeServerLike stub for tests (the API test harness calls
   * initialize() but not start(), so the real WS server never runs). Passing
   * null clears the override.
   */
  setRealtimeServerForTesting(server: RealtimeServerLike | null): void {
    this.realtimeServerOverride = server;
  }

  async shutdown(): Promise<void> {
    // Stop realtime first (close WS connections, flush final snapshots) so it
    // can persist using core services before core's database closes. A realtime
    // shutdown error must not block core shutdown.
    if (this.realtimeServer) {
      try {
        await this.realtimeServer.shutdown();
      } catch (error) {
        logger.warn('Error shutting down realtime server:', error);
      }
      this.realtimeServer = null;
      this.realtimeStarted = false;
    }

    // Stop the transcription worker's poll loop before core's database closes.
    if (this.transcriptionWorker) {
      try {
        this.transcriptionWorker.stop();
      } catch (error) {
        logger.warn('Error stopping transcription worker:', error);
      }
      this.transcriptionWorker = null;
    }

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
// ES module equivalent of require.main === module
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
// Check if this file is being run directly (not imported)
// Compare normalized paths to handle different path formats
const isMainModule =
  process.argv[1] &&
  fileURLToPath(import.meta.url) ===
    fileURLToPath(
      process.argv[1].startsWith('file://')
        ? process.argv[1]
        : `file://${process.argv[1]}`
    );

if (isMainModule) {
  // Use CentralConfigManager to get both data directory and database config
  // CentralConfigManager is already imported at the top of the file
  const dataDir = CentralConfigManager.getDataDir();
  const port = parseInt(process.env.PORT || '3000');

  const api = new CivicPressAPI(port);

  // Graceful shutdown handlers
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

  api
    .initialize(dataDir)
    .then(() => api.start())
    .then(() => {
      logger.info('CivicPress API server started');
    })
    .catch((error) => {
      logger.error('Failed to start CivicPress API server:', error);
      process.exit(1);
    });
}
// Test comment for watch
