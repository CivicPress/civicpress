import { Router, Response } from 'express';
import { param, query, validationResult } from 'express-validator';
import { simpleGit } from 'simple-git';
import {
  sendSuccess,
  logApiRequest,
  handleApiError,
} from '../../utils/api-logger.js';
import { requirePermission } from '../../middleware/auth.js';
import { AuthenticatedRequest } from '../../middleware/auth.js';
import { requireRecordPath, parseRecordMetadata } from './record-paths.js';
import { compareRecordVersions } from './diff-engine.js';
import { getRecordCommitHistory, getFileContent } from './git-history.js';

export function registerDiffRoutes(router: Router): void {
  // GET /api/diff/:recordId - Compare record versions
  router.get(
    '/:recordId',
    requirePermission('records:view'),
    [
      param('recordId')
        .isString()
        .notEmpty()
        .withMessage('Record ID is required'),
      query('commit1')
        .isString()
        .notEmpty()
        .withMessage('Commit 1 is required'),
      query('commit2')
        .isString()
        .notEmpty()
        .withMessage('Commit 2 is required'),
      query('format')
        .optional()
        .isIn(['unified', 'side-by-side', 'json'])
        .withMessage('Format must be unified, side-by-side, or json'),
      query('context')
        .optional()
        .isInt({ min: 0, max: 10 })
        .withMessage('Context must be between 0 and 10'),
      query('showMetadata')
        .optional()
        .isBoolean()
        .withMessage('showMetadata must be a boolean'),
      query('showContent')
        .optional()
        .isBoolean()
        .withMessage('showContent must be a boolean'),
      query('wordLevel')
        .optional()
        .isBoolean()
        .withMessage('wordLevel must be a boolean'),
      query('includeStats')
        .optional()
        .isBoolean()
        .withMessage('includeStats must be a boolean'),
    ],
    async (req: AuthenticatedRequest, res: Response) => {
      logApiRequest(req, { operation: 'compare_record_versions' });

      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({
            error: {
              message: 'Validation failed',
              details: errors.array(),
            },
          });
        }

        const { recordId } = req.params;
        const {
          commit1,
          commit2,
          format = 'unified',
          context = 3,
          showMetadata = true,
          showContent = true,
          wordLevel = false,
          includeStats = true,
        } = req.query;

        const civicPress = req.civicPress;
        if (!civicPress) {
          throw new Error('CivicPress not initialized');
        }

        const dataDir = civicPress.getDataDir();
        const recordPath = requireRecordPath(dataDir, recordId);

        const git = simpleGit(dataDir);

        // Validate commits exist
        try {
          await git.show([commit1 as string]);
          await git.show([commit2 as string]);
        } catch (error) {
          const err = new Error('One or both commits not found');
          (err as any).statusCode = 400;
          (err as any).code = 'COMMIT_NOT_FOUND';
          throw err;
        }

        const result = await compareRecordVersions(
          git,
          recordPath,
          commit1 as string,
          commit2 as string,
          {
            format: format as 'unified' | 'side-by-side' | 'json' | undefined,
            context: parseInt(context.toString()),
            showMetadata: showMetadata === 'true',
            showContent: showContent === 'true',
            wordLevel: wordLevel === 'true',
            includeStats: includeStats === 'true',
          }
        );

        if (!result) {
          const err = new Error('Record not found or no changes');
          (err as any).statusCode = 404;
          (err as any).code = 'NO_CHANGES';
          throw err;
        }

        sendSuccess(result, req, res, {
          operation: 'compare_record_versions',
          meta: {
            recordId,
            commit1,
            commit2,
            hasChanges: result.summary.hasChanges,
          },
        });
      } catch (error) {
        handleApiError(
          'compare_record_versions',
          error,
          req,
          res,
          'Failed to generate diff'
        );
      }
    }
  );

  // GET /api/diff/:recordId/history - Get record commit history
  router.get(
    '/:recordId/history',
    requirePermission('records:view'),
    async (req: AuthenticatedRequest, res: Response) => {
      logApiRequest(req, { operation: 'get_record_history' });

      try {
        const { recordId } = req.params;
        const { limit = 20, author, since } = req.query;

        const civicPress = req.civicPress;
        if (!civicPress) {
          throw new Error('CivicPress not initialized');
        }

        const dataDir = civicPress.getDataDir();
        const recordPath = requireRecordPath(dataDir, recordId);

        const git = simpleGit(dataDir);

        const commits = await getRecordCommitHistory(git, recordPath, {
          limit: parseInt(limit.toString()),
          author: author as string,
          since: since as string,
        });

        sendSuccess(
          {
            recordId,
            commits,
            total: commits.length,
          },
          req,
          res,
          {
            operation: 'get_record_history',
            meta: {
              recordId,
              totalCommits: commits.length,
            },
          }
        );
      } catch (error) {
        handleApiError(
          'get_record_history',
          error,
          req,
          res,
          'Failed to get record history'
        );
      }
    }
  );

  // GET /api/diff/:recordId/commits - Get commits that modified the record
  router.get(
    '/:recordId/commits',
    requirePermission('records:view'),
    async (req: AuthenticatedRequest, res: Response) => {
      logApiRequest(req, { operation: 'get_record_commits' });

      try {
        const { recordId } = req.params;
        const { limit = 20, author, since } = req.query;

        const civicPress = req.civicPress;
        if (!civicPress) {
          throw new Error('CivicPress not initialized');
        }

        const dataDir = civicPress.getDataDir();
        const recordPath = requireRecordPath(dataDir, recordId);

        const git = simpleGit(dataDir);

        // Get commits that modified this file
        const log = await git.log({
          file: recordPath,
          maxCount: parseInt(limit.toString()),
          author: author as string,
          since: since as string,
        });

        const commits = log.all.map((commit) => ({
          hash: commit.hash,
          shortHash: commit.hash.substring(0, 7),
          date: commit.date,
          author: commit.author_name,
          message: commit.message,
          changes: commit.diff?.files?.map((file) => file.file) || [],
        }));

        sendSuccess(
          {
            recordId,
            commits,
            total: commits.length,
          },
          req,
          res,
          {
            operation: 'get_record_commits',
            meta: {
              recordId,
              totalCommits: commits.length,
            },
          }
        );
      } catch (error) {
        handleApiError(
          'get_record_commits',
          error,
          req,
          res,
          'Failed to get record commits'
        );
      }
    }
  );

  // GET /api/diff/:recordId/versions - Get all versions of a record
  router.get(
    '/:recordId/versions',
    requirePermission('records:view'),
    async (req: AuthenticatedRequest, res: Response) => {
      logApiRequest(req, { operation: 'get_record_versions' });

      try {
        const { recordId } = req.params;
        const { limit = 20 } = req.query;

        const civicPress = req.civicPress;
        if (!civicPress) {
          throw new Error('CivicPress not initialized');
        }

        const dataDir = civicPress.getDataDir();
        const recordPath = requireRecordPath(dataDir, recordId);

        const git = simpleGit(dataDir);

        // Get all commits that modified this file
        const log = await git.log({
          file: recordPath,
          maxCount: parseInt(limit.toString()),
        });

        const versions = await Promise.all(
          log.all.map(async (commit) => {
            const content = await getFileContent(git, recordPath, commit.hash);
            const metadata = content ? parseRecordMetadata(content) : {};

            return {
              commit: {
                hash: commit.hash,
                shortHash: commit.hash.substring(0, 7),
                date: commit.date,
                author: commit.author_name,
                message: commit.message,
              },
              content,
              metadata,
            };
          })
        );

        sendSuccess(
          {
            recordId,
            versions,
            total: versions.length,
          },
          req,
          res,
          {
            operation: 'get_record_versions',
            meta: {
              recordId,
              totalVersions: versions.length,
            },
          }
        );
      } catch (error) {
        handleApiError(
          'get_record_versions',
          error,
          req,
          res,
          'Failed to get record versions'
        );
      }
    }
  );
}
