import { Router, Response } from 'express';
import { HttpError } from '../../utils/http-error.js';
import { param, query, validationResult } from 'express-validator';
import { simpleGit } from 'simple-git';
import {
  sendSuccess,
  logApiRequest,
  handleApiError,
  handleValidationError,
} from '../../utils/api-logger.js';
import { requirePermission } from '../../middleware/auth.js';
import { AuthenticatedRequest } from '../../middleware/auth.js';
import { requireRecordPath, parseRecordMetadata } from './record-paths.js';
import { compareRecordVersions } from './diff-engine.js';
import {
  getRecordCommitHistory,
  getFileContent,
  historyFilterOptions,
} from './git-history.js';
import { isRevision } from './revision.js';

/** A boolean query parameter, or `fallback` when the request leaves it out. */
function flag(value: unknown, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return value === true || value === 'true' || value === '1';
}

/**
 * Filters shared by the three history routes. They had no validation at all:
 * `limit` went through `parseInt` and could reach git as `NaN`, and a filter
 * sent twice arrived as an array.
 */
const historyFilters = [
  param('recordId').isString().notEmpty().withMessage('Record ID is required'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 200 })
    .withMessage('limit must be an integer between 1 and 200'),
  query('author')
    .optional()
    .isString()
    .isLength({ min: 1, max: 200 })
    .withMessage('author must be a string of at most 200 characters'),
  query('since')
    .optional()
    .isString()
    .isLength({ min: 1, max: 64 })
    .withMessage('since must be a string of at most 64 characters'),
];

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
      // A revision, never a git option — see ./revision.ts.
      query('commit1')
        .custom(isRevision)
        .withMessage('commit1 must be a commit hash or ref'),
      query('commit2')
        .custom(isRevision)
        .withMessage('commit2 must be a commit hash or ref'),
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
          return handleValidationError(
            'compare_record_versions',
            errors.array(),
            req,
            res
          );
        }

        const { recordId } = req.params;
        const {
          commit1,
          commit2,
          format = 'unified',
          context = 3,
          showMetadata,
          showContent,
          wordLevel,
          includeStats,
        } = req.query;

        const civicPress = req.civicPress;
        if (!civicPress) {
          throw new Error('CivicPress not initialized');
        }

        const dataDir = civicPress.getDataDir();
        const recordPath = requireRecordPath(dataDir, recordId);

        const git = simpleGit(dataDir);

        // Validate commits exist. `rev-parse --verify` rather than `show`:
        // it resolves the name and prints a hash, where `show` rendered the
        // whole commit only to have the output thrown away. `^{commit}` makes
        // a tree or a blob that happens to share the name a miss. No
        // `--quiet`: with it git fails silently, and simple-git reports a
        // failure with nothing on stderr as success.
        try {
          for (const revision of [commit1, commit2]) {
            await git.revparse(['--verify', `${revision as string}^{commit}`]);
          }
        } catch {
          throw new HttpError(
            400,
            'One or both commits not found',
            'COMMIT_NOT_FOUND'
          );
        }

        const result = await compareRecordVersions(
          git,
          recordPath,
          commit1 as string,
          commit2 as string,
          {
            format: format as 'unified' | 'side-by-side' | 'json' | undefined,
            context: parseInt(context.toString()),
            // These defaulted to the boolean `true` and were then compared
            // with the STRING 'true', so a request that left them out got
            // `false` for all of them — and an empty diff. The documented
            // defaults are true, true, false, true.
            showMetadata: flag(showMetadata, true),
            showContent: flag(showContent, true),
            wordLevel: flag(wordLevel, false),
            includeStats: flag(includeStats, true),
          }
        );

        if (!result) {
          throw new HttpError(
            404,
            'Record not found or no changes',
            'NO_CHANGES'
          );
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
    historyFilters,
    async (req: AuthenticatedRequest, res: Response) => {
      logApiRequest(req, { operation: 'get_record_history' });

      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return handleValidationError(
            'get_record_history',
            errors.array(),
            req,
            res
          );
        }

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
    historyFilters,
    async (req: AuthenticatedRequest, res: Response) => {
      logApiRequest(req, { operation: 'get_record_commits' });

      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return handleValidationError(
            'get_record_commits',
            errors.array(),
            req,
            res
          );
        }

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
          ...historyFilterOptions(author, since),
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
    historyFilters,
    async (req: AuthenticatedRequest, res: Response) => {
      logApiRequest(req, { operation: 'get_record_versions' });

      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return handleValidationError(
            'get_record_versions',
            errors.array(),
            req,
            res
          );
        }

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
