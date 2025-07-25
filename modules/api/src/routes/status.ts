import { Router, Response } from 'express';
import { query, validationResult } from 'express-validator';
import { AuthenticatedRequest, requirePermission } from '../middleware/auth';
import { Logger } from '@civicpress/core';
import {
  sendSuccess,
  handleApiError,
  logApiRequest,
  handleValidationError,
} from '../utils/api-logger';
import * as fs from 'fs';
import * as path from 'path';

const logger = new Logger();

export function createStatusRouter() {
  const router = Router();

  // GET /api/status - Get comprehensive system status
  router.get(
    '/',
    requirePermission('records:view'),
    async (req: AuthenticatedRequest, res: Response) => {
      logApiRequest(req, { operation: 'get_system_status' });

      try {
        const civicPress = (req as any).civicPress;
        if (!civicPress) {
          throw new Error('CivicPress not initialized');
        }

        const dataDir = civicPress.getDataDir();
        const gitEngine = civicPress.gitEngine;

        // Get Git status
        let gitStatus = null;
        if (gitEngine) {
          try {
            gitStatus = await gitEngine.status();
          } catch (error) {
            logger.warn('Failed to get Git status', {
              error: (error as Error).message,
            });
          }
        }

        // Get record statistics
        const recordStats = await getRecordStatistics(dataDir);

        // Get system information
        const systemInfo = {
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          nodeVersion: process.version,
          platform: process.platform,
          environment: process.env.NODE_ENV || 'development',
          timestamp: new Date().toISOString(),
        };

        // Get configuration status
        const configStatus = await getConfigurationStatus(dataDir);

        const status = {
          system: {
            status: 'healthy',
            ...systemInfo,
          },
          git: gitStatus,
          records: recordStats,
          configuration: configStatus,
          summary: {
            totalRecords: recordStats.totalRecords,
            pendingChanges: gitStatus?.modified?.length || 0,
            systemHealth: 'healthy',
            lastUpdated: new Date().toISOString(),
          },
        };

        logger.info('System status retrieved successfully', {
          totalRecords: recordStats.totalRecords,
          pendingChanges: gitStatus?.modified?.length || 0,
          requestId: (req as any).requestId,
        });

        sendSuccess(status, req, res, {
          operation: 'get_system_status',
          meta: {
            totalRecords: recordStats.totalRecords,
            pendingChanges: gitStatus?.modified?.length || 0,
          },
        });
      } catch (error) {
        handleApiError(
          'get_system_status',
          error,
          req,
          res,
          'Failed to get system status'
        );
      }
    }
  );

  // GET /api/status/git - Get detailed Git status
  router.get(
    '/git',
    requirePermission('records:view'),
    async (req: AuthenticatedRequest, res: Response) => {
      logApiRequest(req, { operation: 'get_git_status' });

      try {
        const civicPress = (req as any).civicPress;
        if (!civicPress) {
          throw new Error('CivicPress not initialized');
        }

        const gitEngine = civicPress.gitEngine;
        if (!gitEngine) {
          const error = new Error('Git engine not available');
          (error as any).statusCode = 503;
          (error as any).code = 'GIT_ENGINE_UNAVAILABLE';
          throw error;
        }

        const gitStatus = await gitEngine.status();

        // Get recent commits for context
        const recentCommits = await gitEngine.getHistory(5);

        const status = {
          status:
            gitStatus.modified.length > 0 || gitStatus.created.length > 0
              ? 'dirty'
              : 'clean',
          modified: gitStatus.modified,
          created: gitStatus.created,
          deleted: gitStatus.deleted,
          renamed: gitStatus.renamed,
          untracked: gitStatus.untracked || [],
          recentCommits: recentCommits.map((commit: any) => ({
            hash: commit.hash,
            shortHash: commit.hash.substring(0, 8),
            message: commit.message,
            author: commit.author_name,
            date: commit.date,
          })),
          summary: {
            totalChanges:
              gitStatus.modified.length +
              gitStatus.created.length +
              gitStatus.deleted.length,
            modifiedFiles: gitStatus.modified.length,
            newFiles: gitStatus.created.length,
            deletedFiles: gitStatus.deleted.length,
            renamedFiles: gitStatus.renamed.length,
          },
        };

        logger.info('Git status retrieved successfully', {
          totalChanges: status.summary.totalChanges,
          requestId: (req as any).requestId,
        });

        sendSuccess(status, req, res, {
          operation: 'get_git_status',
          meta: {
            totalChanges: status.summary.totalChanges,
          },
        });
      } catch (error) {
        handleApiError(
          'get_git_status',
          error,
          req,
          res,
          'Failed to get Git status'
        );
      }
    }
  );

  // GET /api/status/records - Get detailed record statistics
  router.get(
    '/records',
    requirePermission('records:view'),
    [query('type').optional().isString().withMessage('Type must be a string')],
    async (req: AuthenticatedRequest, res: Response) => {
      logApiRequest(req, { operation: 'get_record_status' });

      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return handleValidationError(
            'get_record_status',
            errors.array(),
            req,
            res
          );
        }

        const civicPress = (req as any).civicPress;
        if (!civicPress) {
          throw new Error('CivicPress not initialized');
        }

        const dataDir = civicPress.getDataDir();
        const { type } = req.query;

        const recordStats = await getRecordStatistics(dataDir, type as string);

        logger.info('Record status retrieved successfully', {
          totalRecords: recordStats.totalRecords,
          requestId: (req as any).requestId,
        });

        sendSuccess(recordStats, req, res, {
          operation: 'get_record_status',
          meta: {
            totalRecords: recordStats.totalRecords,
          },
        });
      } catch (error) {
        handleApiError(
          'get_record_status',
          error,
          req,
          res,
          'Failed to get record status'
        );
      }
    }
  );

  return router;
}

// Helper function to get record statistics
async function getRecordStatistics(
  dataDir: string,
  filterType?: string
): Promise<any> {
  const recordsDir = path.join(dataDir, 'records');
  const archiveDir = path.join(dataDir, 'archive');

  if (!fs.existsSync(recordsDir)) {
    return {
      totalRecords: 0,
      byType: {},
      byStatus: {},
      archive: {
        totalRecords: 0,
        byType: {},
      },
    };
  }

  const recordTypes = fs
    .readdirSync(recordsDir, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name);

  const stats = {
    totalRecords: 0,
    byType: {} as Record<string, any>,
    byStatus: {} as Record<string, any>,
    archive: {
      totalRecords: 0,
      byType: {} as Record<string, any>,
    },
  };

  // Process active records
  for (const type of recordTypes) {
    if (filterType && type !== filterType) continue;

    const typeDir = path.join(recordsDir, type);
    const files = fs
      .readdirSync(typeDir)
      .filter((file) => file.endsWith('.md'))
      .map((file) => path.join(typeDir, file));

    stats.byType[type] = {
      count: files.length,
      files: files.map((file) => path.basename(file, '.md')),
    };

    stats.totalRecords += files.length;

    // Analyze status from file content
    for (const file of files) {
      try {
        const content = fs.readFileSync(file, 'utf-8');
        const statusMatch = content.match(/status:\s*(\w+)/i);
        const status = statusMatch ? statusMatch[1].toLowerCase() : 'unknown';

        stats.byStatus[status] = (stats.byStatus[status] || 0) + 1;
      } catch (error) {
        logger.warn('Failed to read record file', {
          file,
          error: (error as Error).message,
        });
      }
    }
  }

  // Process archived records
  if (fs.existsSync(archiveDir)) {
    const archiveTypes = fs
      .readdirSync(archiveDir, { withFileTypes: true })
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => dirent.name);

    for (const type of archiveTypes) {
      if (filterType && type !== filterType) continue;

      const typeDir = path.join(archiveDir, type);
      const files = fs
        .readdirSync(typeDir)
        .filter((file) => file.endsWith('.md'))
        .map((file) => path.join(typeDir, file));

      stats.archive.byType[type] = {
        count: files.length,
        files: files.map((file) => path.basename(file, '.md')),
      };

      stats.archive.totalRecords += files.length;
    }
  }

  return stats;
}

// Helper function to get configuration status
async function getConfigurationStatus(dataDir: string): Promise<any> {
  const configDir = path.join(dataDir, '.civic');
  const config = {
    exists: fs.existsSync(configDir),
    files: [] as string[],
    workflows: null as any,
    templates: null as any,
    hooks: null as any,
  };

  if (config.exists) {
    try {
      const files = fs.readdirSync(configDir);
      config.files = files;

      // Check for specific configuration files
      const workflowsPath = path.join(configDir, 'workflows.yml');
      if (fs.existsSync(workflowsPath)) {
        try {
          const workflowsContent = fs.readFileSync(workflowsPath, 'utf-8');
          config.workflows = {
            exists: true,
            size: workflowsContent.length,
            lastModified: fs.statSync(workflowsPath).mtime.toISOString(),
          };
        } catch (error) {
          config.workflows = { exists: true, error: (error as Error).message };
        }
      }

      const templatesPath = path.join(configDir, 'templates');
      if (fs.existsSync(templatesPath)) {
        try {
          const templateFiles = fs.readdirSync(templatesPath);
          config.templates = {
            exists: true,
            count: templateFiles.length,
            files: templateFiles,
          };
        } catch (error) {
          config.templates = { exists: true, error: (error as Error).message };
        }
      }

      const hooksPath = path.join(configDir, 'hooks.yml');
      if (fs.existsSync(hooksPath)) {
        try {
          const hooksContent = fs.readFileSync(hooksPath, 'utf-8');
          config.hooks = {
            exists: true,
            size: hooksContent.length,
            lastModified: fs.statSync(hooksPath).mtime.toISOString(),
          };
        } catch (error) {
          config.hooks = { exists: true, error: (error as Error).message };
        }
      }
    } catch (error) {
      (config as any).error = (error as Error).message;
    }
  }

  return config;
}
