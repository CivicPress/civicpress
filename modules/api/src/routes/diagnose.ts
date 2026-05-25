/**
 * Diagnostic API Routes
 *
 * REST API endpoints for running system diagnostics
 */

import { Router, Request, Response } from 'express';
import { HttpError } from '../utils/http-error.js';
import { query, validationResult } from 'express-validator';
import {
  DiagnosticService,
  CentralConfigManager,
  Logger,
  AuditLogger,
  DatabaseDiagnosticChecker,
  SearchDiagnosticChecker,
  ConfigurationDiagnosticChecker,
  FilesystemDiagnosticChecker,
  SystemDiagnosticChecker,
} from '@civicpress/core';
import {
  sendSuccess,
  handleApiError,
  logApiRequest,
  handleValidationError,
} from '../utils/api-logger.js';
import { requireDiagnosticAuth } from '../middleware/diagnostic-auth.js';
import { validateDiagnosticParams } from '../middleware/diagnostic-validation.js';
import { sanitizeDiagnosticReport } from '@civicpress/core';
import type { DiagnosticReport } from '@civicpress/core';

const logger = new Logger();

export function createDiagnoseRouter() {
  const router = Router();

  // All diagnostic endpoints require admin authentication
  router.use(requireDiagnosticAuth);

  // GET /api/v1/diagnose - Run all diagnostic checks
  router.get('/', validateDiagnosticParams, async (req: Request, res: Response) => {
    logApiRequest(req, { operation: 'diagnose:run_all' });

    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return handleValidationError(
          'diagnose:run_all',
          errors.array(),
          req,
          res
        );
      }

      const civicPress = req.civicPress;
      if (!civicPress) {
        throw new Error('CivicPress not initialized');
      }

      const dataDir = civicPress.getDataDir();
      const { component, fix, format, timeout, maxConcurrency } = req.query;

      // Initialize diagnostic service
      const diagnosticService = new DiagnosticService({
        databaseService: civicPress.getDatabaseService(),
        searchService: civicPress.getDatabaseService().getSearchService(),
        configManager: CentralConfigManager,
        logger: civicPress['logger'] as Logger,
        auditLogger: new AuditLogger({ dataDir }),
        dataDir,
        cacheManager: civicPress.getCacheManager(),
      });

      // Register checkers
      const databaseChecker = new DatabaseDiagnosticChecker(
        civicPress.getDatabaseService(),
        dataDir,
        civicPress['logger'] as Logger
      );
      diagnosticService.registerChecker(databaseChecker);

      const searchChecker = new SearchDiagnosticChecker(
        civicPress.getDatabaseService(),
        civicPress.getDatabaseService().getSearchService(),
        dataDir,
        civicPress['logger'] as Logger
      );
      diagnosticService.registerChecker(searchChecker);

      const configChecker = new ConfigurationDiagnosticChecker(
        CentralConfigManager,
        dataDir,
        civicPress['logger'] as Logger
      );
      diagnosticService.registerChecker(configChecker);

      const filesystemChecker = new FilesystemDiagnosticChecker(
        dataDir,
        civicPress['logger'] as Logger
      );
      diagnosticService.registerChecker(filesystemChecker);

      const systemChecker = new SystemDiagnosticChecker(
        civicPress['logger'] as Logger
      );
      diagnosticService.registerChecker(systemChecker);

      // Prepare options
      const options = {
        components: component ? [component as string] : undefined,
        timeout: timeout ? parseInt(timeout as string, 10) : undefined,
        maxConcurrency: maxConcurrency
          ? parseInt(maxConcurrency as string, 10)
          : undefined,
        userId: req.user?.id !== undefined ? String(req.user.id) : undefined,
        requestId: req.requestId,
        enableAutoFix: fix === 'true',
      };

      // Run diagnostics
      let result: DiagnosticReport;
      if (component) {
        const componentResult = await diagnosticService.runComponent(
          component as string,
          options
        );
        // Convert ComponentResult to DiagnosticReport format for consistency
        result = {
          runId: `api_${Date.now()}`,
          timestamp: new Date().toISOString(),
          overallStatus: componentResult.status,
          components: [componentResult],
          summary: {
            totalChecks: componentResult.checks.length,
            passed: componentResult.checks.filter((c) => c.status === 'pass')
              .length,
            warnings: componentResult.checks.filter(
              (c) => c.status === 'warning'
            ).length,
            errors: componentResult.checks.filter((c) => c.status === 'error')
              .length,
            skipped: componentResult.checks.filter(
              (c) => c.status === 'skipped'
            ).length,
          },
          issues: componentResult.issues,
          recommendations: [],
          duration: componentResult.duration,
        };
      } else {
        result = await diagnosticService.runAll(options);
      }

      // Sanitize results before sending
      const sanitized = sanitizeDiagnosticReport(result);

      logger.info('Diagnostic run completed', {
        component: component || 'all',
        status: sanitized.overallStatus,
        issuesFound: sanitized.issues?.length || 0,
        requestId: req.requestId,
      });

      sendSuccess(sanitized, req, res, {
        operation: 'diagnose:run_all',
        meta: {
          component: component || 'all',
          status: sanitized.overallStatus,
          issuesFound: sanitized.issues?.length || 0,
        },
      });
    } catch (error) {
      handleApiError(
        'diagnose:run_all',
        error,
        req,
        res,
        'Failed to run diagnostics'
      );
    }
  });

  // GET /api/v1/diagnose/:component - Run diagnostics for specific component
  router.get(
    '/:component',
    validateDiagnosticParams,
    async (req: Request, res: Response) => {
      logApiRequest(req, { operation: 'diagnose:run_component' });

      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return handleValidationError(
            'diagnose:run_component',
            errors.array(),
            req,
            res
          );
        }

        const civicPress = req.civicPress;
        if (!civicPress) {
          throw new Error('CivicPress not initialized');
        }

        const { component } = req.params;
        const { fix, timeout, maxConcurrency } = req.query;
        const dataDir = civicPress.getDataDir();

        // Validate component
        const validComponents = [
          'database',
          'search',
          'config',
          'filesystem',
          'system',
        ];
        if (!validComponents.includes(component)) {
          throw new HttpError(
            400,
            `Invalid component: ${component}. Must be one of: ${validComponents.join(', ')}`,
            'INVALID_COMPONENT'
          );
        }

        // Initialize diagnostic service
        const diagnosticService = new DiagnosticService({
          databaseService: civicPress.getDatabaseService(),
          searchService: civicPress.getDatabaseService().getSearchService(),
          configManager: CentralConfigManager,
          logger: civicPress['logger'] as Logger,
          auditLogger: new AuditLogger({ dataDir }),
          dataDir,
        });

        // Register checkers
        const databaseChecker = new DatabaseDiagnosticChecker(
          civicPress.getDatabaseService(),
          dataDir,
          civicPress['logger'] as Logger
        );
        diagnosticService.registerChecker(databaseChecker);

        const searchChecker = new SearchDiagnosticChecker(
          civicPress.getDatabaseService(),
          civicPress.getDatabaseService().getSearchService(),
          dataDir,
          civicPress['logger'] as Logger
        );
        diagnosticService.registerChecker(searchChecker);

        const configChecker = new ConfigurationDiagnosticChecker(
          CentralConfigManager,
          dataDir,
          civicPress['logger'] as Logger
        );
        diagnosticService.registerChecker(configChecker);

        const filesystemChecker = new FilesystemDiagnosticChecker(
          dataDir,
          civicPress['logger'] as Logger
        );
        diagnosticService.registerChecker(filesystemChecker);

        const systemChecker = new SystemDiagnosticChecker(
          civicPress['logger'] as Logger
        );
        diagnosticService.registerChecker(systemChecker);

        // Prepare options
        const options = {
          timeout: timeout ? parseInt(timeout as string, 10) : undefined,
          maxConcurrency: maxConcurrency
            ? parseInt(maxConcurrency as string, 10)
            : undefined,
          userId: req.user?.id !== undefined ? String(req.user.id) : undefined,
          requestId: req.requestId,
          enableAutoFix: fix === 'true',
        };

        // Run diagnostics
        const result = await diagnosticService.runComponent(component, options);

        // Sanitize results
        const sanitized = sanitizeDiagnosticReport({
          runId: `api_${Date.now()}`,
          timestamp: new Date().toISOString(),
          overallStatus: result.status,
          components: [result],
          summary: {
            totalChecks: result.checks.length,
            passed: result.checks.filter((c) => c.status === 'pass').length,
            warnings: result.checks.filter((c) => c.status === 'warning')
              .length,
            errors: result.checks.filter((c) => c.status === 'error').length,
            skipped: result.checks.filter((c) => c.status === 'skipped').length,
          },
          issues: result.issues,
          recommendations: [],
          duration: result.duration,
        });

        logger.info('Component diagnostic completed', {
          component,
          status: result.status,
          issuesFound: result.issues.length,
          requestId: req.requestId,
        });

        sendSuccess(sanitized, req, res, {
          operation: 'diagnose:run_component',
          meta: {
            component,
            status: result.status,
            issuesFound: result.issues.length,
          },
        });
      } catch (error) {
        handleApiError(
          'diagnose:run_component',
          error,
          req,
          res,
          'Failed to run component diagnostics'
        );
      }
    }
  );

  // POST /api/v1/diagnose/fix - Attempt to auto-fix issues
  router.post(
    '/fix',
    [
      query('force')
        .optional()
        .isBoolean()
        .withMessage('Force must be a boolean'),
      query('dryRun')
        .optional()
        .isBoolean()
        .withMessage('Dry run must be a boolean'),
    ],
    async (req: Request, res: Response) => {
      logApiRequest(req, { operation: 'diagnose:auto_fix' });

      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return handleValidationError(
            'diagnose:auto_fix',
            errors.array(),
            req,
            res
          );
        }

        const civicPress = req.civicPress;
        if (!civicPress) {
          throw new Error('CivicPress not initialized');
        }

        const { issues } = req.body;
        const { force, dryRun } = req.query;
        const dataDir = civicPress.getDataDir();

        if (!Array.isArray(issues) || issues.length === 0) {
          throw new HttpError(400, 
            'Issues array is required and must not be empty'
          , 'INVALID_REQUEST');
        }

        // Initialize diagnostic service
        const diagnosticService = new DiagnosticService({
          databaseService: civicPress.getDatabaseService(),
          searchService: civicPress.getDatabaseService().getSearchService(),
          configManager: CentralConfigManager,
          logger: civicPress['logger'] as Logger,
          auditLogger: new AuditLogger({ dataDir }),
          dataDir,
        });

        // Register checkers
        const databaseChecker = new DatabaseDiagnosticChecker(
          civicPress.getDatabaseService(),
          dataDir,
          civicPress['logger'] as Logger
        );
        diagnosticService.registerChecker(databaseChecker);

        const searchChecker = new SearchDiagnosticChecker(
          civicPress.getDatabaseService(),
          civicPress.getDatabaseService().getSearchService(),
          dataDir,
          civicPress['logger'] as Logger
        );
        diagnosticService.registerChecker(searchChecker);

        const configChecker = new ConfigurationDiagnosticChecker(
          CentralConfigManager,
          dataDir,
          civicPress['logger'] as Logger
        );
        diagnosticService.registerChecker(configChecker);

        const filesystemChecker = new FilesystemDiagnosticChecker(
          dataDir,
          civicPress['logger'] as Logger
        );
        diagnosticService.registerChecker(filesystemChecker);

        const systemChecker = new SystemDiagnosticChecker(
          civicPress['logger'] as Logger
        );
        diagnosticService.registerChecker(systemChecker);

        // Attempt fixes
        const fixResults = await diagnosticService.autoFix(issues, {
          force: force === 'true',
          dryRun: dryRun === 'true',
          backup: true,
        });

        const successful = fixResults.filter((r) => r.success).length;
        const failed = fixResults.filter((r) => !r.success).length;

        logger.info('Auto-fix completed', {
          total: issues.length,
          successful,
          failed,
          requestId: req.requestId,
        });

        sendSuccess(
          {
            total: issues.length,
            successful,
            failed,
            results: fixResults,
          },
          req,
          res,
          {
            operation: 'diagnose:auto_fix',
            meta: {
              total: issues.length,
              successful,
              failed,
            },
          }
        );
      } catch (error) {
        handleApiError(
          'diagnose:auto_fix',
          error,
          req,
          res,
          'Failed to auto-fix issues'
        );
      }
    }
  );

  return router;
}
