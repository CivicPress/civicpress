import { Router, Response } from 'express';
import { query, validationResult } from 'express-validator';
import {
  AuthenticatedRequest,
  requireRecordPermission,
} from '../middleware/auth.js';
import { Logger } from '@civicpress/core';
import type { GitCommit } from '@civicpress/core';
import {
  sendSuccess,
  handleApiError,
  logApiRequest,
  handleValidationError,
} from '../utils/api-logger.js';

const logger = new Logger();

/** Minimal shape of the GitEngine this router needs (keeps it test-fakeable). */
interface HistoryGitEngine {
  getHistory: (
    limit?: number,
    pathspec?: string,
    skip?: number
  ) => Promise<GitCommit[]>;
  countCommits: (pathspec?: string) => Promise<number>;
}

/**
 * Resolve the requested record to a git pathspec.
 *
 * Returns the record's real file path so the log can be scoped with
 * `git log -- <path>`. When the record can't be resolved, signals that the
 * caller must fall back to the commit-MESSAGE match, which git cannot express
 * and therefore has to happen in JS over the full log.
 */
async function resolveRecordPathspec(
  req: AuthenticatedRequest,
  record: string | undefined
): Promise<{ pathspec?: string; messageFallback: boolean }> {
  if (!record) {
    return { messageFallback: false };
  }
  try {
    const rec = await req.civicPress?.getRecordManager().getRecord(record);
    const recordPath = (rec as { path?: string } | null | undefined)?.path;
    if (recordPath) {
      return { pathspec: recordPath, messageFallback: false };
    }
  } catch (error) {
    logger.warn('Could not resolve record path for history pathspec', {
      record,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  return { messageFallback: true };
}

/** Fallback: message match (id or `<id>.md`), no no-op replace. */
function filterByMessage(history: GitCommit[], record: string): GitCommit[] {
  const messageNeedle = `${record}.md`;
  return history.filter(
    (commit) =>
      commit.message.includes(record) || commit.message.includes(messageNeedle)
  );
}

/**
 * Fetch ONE page of commit history plus the total for the requested filters.
 *
 * Git history is a log, not a table — there is nothing to SQL-paginate here.
 * What it CAN do is stop over-fetching: both handlers below used to call
 * `getHistory()` with no limit on every request, pulling the repository's
 * ENTIRE commit log into memory just to `.slice()` ten commits out of it, so
 * per-request memory grew with the age of the repo.
 *
 * Two regimes, because `totalCommits` is defined over the FILTERED set:
 *
 *  - No author/date filter and no message fallback: git can do the whole job.
 *    `--skip`/`--max-count` return exactly one page and `rev-list --count`
 *    returns the true total, so nothing beyond the page is ever materialized.
 *
 *  - Otherwise: the author/date predicates and the commit-MESSAGE fallback are
 *    applied in JS, and a correct total requires counting the whole filtered
 *    set — so the full log genuinely IS needed, and is fetched exactly as
 *    before. Narrowing it with git's own `--author`/`--since` was rejected
 *    deliberately: git's `--author` is a case-sensitive regex over
 *    "Name <email>", while this endpoint does a case-insensitive substring
 *    match against name OR email, and swapping them would silently change
 *    which commits callers get back.
 */
async function fetchHistoryPage(
  req: AuthenticatedRequest,
  gitEngine: HistoryGitEngine,
  params: {
    record?: string;
    limit: number;
    offset: number;
    author?: string;
    since?: string;
    until?: string;
  }
): Promise<{ commits: GitCommit[]; total: number }> {
  const { record, limit, offset, author, since, until } = params;

  const scope = await resolveRecordPathspec(req, record);

  const needsInMemoryFilter = Boolean(
    author || since || until || scope.messageFallback
  );

  if (!needsInMemoryFilter) {
    const [commits, total] = await Promise.all([
      gitEngine.getHistory(limit, scope.pathspec, offset),
      gitEngine.countCommits(scope.pathspec),
    ]);
    return { commits, total };
  }

  let history = await gitEngine.getHistory(undefined, scope.pathspec);

  if (scope.messageFallback && record) {
    history = filterByMessage(history, record);
  }

  if (author) {
    const needle = author.toLowerCase();
    history = history.filter(
      (commit) =>
        commit.author_name?.toLowerCase().includes(needle) ||
        commit.author_email?.toLowerCase().includes(needle)
    );
  }

  if (since || until) {
    const sinceDate = since ? new Date(since) : null;
    const untilDate = until ? new Date(until) : null;

    history = history.filter((commit) => {
      const commitDate = new Date(commit.date);
      if (sinceDate && commitDate < sinceDate) return false;
      if (untilDate && commitDate > untilDate) return false;
      return true;
    });
  }

  return {
    commits: history.slice(offset, offset + limit),
    total: history.length,
  };
}

export function createHistoryRouter() {
  const router = Router();

  // GET /api/history - Get Git commit history
  router.get(
    '/',
    requireRecordPermission('view'),
    [
      query('record')
        .optional()
        .isString()
        .withMessage('Record must be a string'),
      query('limit')
        .optional()
        .isInt({ min: 1, max: 100 })
        .withMessage('Limit must be between 1 and 100'),
      query('offset')
        .optional()
        .isInt({ min: 0 })
        .withMessage('Offset must be a non-negative integer'),
      query('author')
        .optional()
        .isString()
        .withMessage('Author must be a string'),
      query('since')
        .optional()
        .isISO8601()
        .withMessage('Since date must be ISO 8601 format'),
      query('until')
        .optional()
        .isISO8601()
        .withMessage('Until date must be ISO 8601 format'),
    ],
    async (req: AuthenticatedRequest, res: Response) => {
      logApiRequest(req, { operation: 'get_history' });

      try {
        // Validate request
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return handleValidationError('get_history', errors.array(), req, res);
        }

        const {
          record,
          limit = '10',
          offset = '0',
          author,
          since,
          until,
        } = req.query;
        const civicPress = req.civicPress;

        if (!civicPress) {
          throw new Error('CivicPress not initialized');
        }

        logger.info('Getting Git history', {
          record,
          limit,
          offset,
          author,
          since,
          until,
          requestId: req.requestId,
        });

        // Get Git engine from CivicPress
        const gitEngine = civicPress.getGitEngine();

        const historyLimit = parseInt(limit as string) || 10;
        const historyOffset = parseInt(offset as string) || 0;

        // Scope by record via a git pathspec when one is requested. Resolve
        // the record's actual file path and let git filter (git log -- path);
        // fall back to a commit-message match only when the record can't be
        // resolved. (The old code substring-matched the message with a no-op
        // `.replace('/','/')`, which both missed and over-matched commits.)
        const { commits: paginatedHistory, total: totalCommits } =
          await fetchHistoryPage(req, gitEngine, {
            record: record as string | undefined,
            limit: historyLimit,
            offset: historyOffset,
            author: author as string | undefined,
            since: since as string | undefined,
            until: until as string | undefined,
          });

        // Transform commit data for API response
        const transformedHistory = paginatedHistory.map((commit) => ({
          hash: commit.hash,
          shortHash: commit.hash.substring(0, 8),
          message: commit.message,
          author: commit.author_name || 'Unknown',
          email: commit.author_email,
          date: commit.date,
          timestamp: new Date(commit.date).toISOString(),
          record: record || 'all',
        }));

        const response = {
          history: transformedHistory,
          summary: {
            totalCommits,
            returnedCommits: transformedHistory.length,
            limit: historyLimit,
            offset: historyOffset,
            record: record || 'all',
            filters: {
              author: author || null,
              since: since || null,
              until: until || null,
            },
          },
        };

        logger.info('History retrieved successfully', {
          totalCommits,
          returnedCommits: transformedHistory.length,
          requestId: req.requestId,
        });

        sendSuccess(response, req, res, {
          operation: 'get_history',
          meta: {
            totalCommits,
            returnedCommits: transformedHistory.length,
          },
        });
      } catch (error) {
        handleApiError('get_history', error, req, res, 'Failed to get history');
      }
    }
  );

  // GET /api/history/:record - Get history for specific record
  router.get(
    '/:record',
    requireRecordPermission('view'),
    [
      query('limit')
        .optional()
        .isInt({ min: 1, max: 100 })
        .withMessage('Limit must be between 1 and 100'),
      query('offset')
        .optional()
        .isInt({ min: 0 })
        .withMessage('Offset must be a non-negative integer'),
      query('author')
        .optional()
        .isString()
        .withMessage('Author must be a string'),
      query('since')
        .optional()
        .isISO8601()
        .withMessage('Since date must be ISO 8601 format'),
      query('until')
        .optional()
        .isISO8601()
        .withMessage('Until date must be ISO 8601 format'),
    ],
    async (req: AuthenticatedRequest, res: Response) => {
      logApiRequest(req, { operation: 'get_record_history' });

      try {
        // Validate request
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return handleValidationError(
            'get_record_history',
            errors.array(),
            req,
            res
          );
        }

        const { record } = req.params;
        const { limit = '10', offset = '0', author, since, until } = req.query;
        const civicPress = req.civicPress;

        if (!civicPress) {
          throw new Error('CivicPress not initialized');
        }

        logger.info('Getting record history', {
          record,
          limit,
          offset,
          author,
          since,
          until,
          requestId: req.requestId,
        });

        // Get Git engine from CivicPress
        const gitEngine = civicPress.getGitEngine();

        const historyLimit = parseInt(limit as string) || 10;
        const historyOffset = parseInt(offset as string) || 0;

        // Scope by record via a git pathspec (see `fetchHistoryPage`, which
        // also explains why only the unfiltered case can be paged by git).
        const { commits: paginatedHistory, total: totalCommits } =
          await fetchHistoryPage(req, gitEngine, {
            record,
            limit: historyLimit,
            offset: historyOffset,
            author: author as string | undefined,
            since: since as string | undefined,
            until: until as string | undefined,
          });

        // Transform commit data for API response
        const transformedHistory = paginatedHistory.map((commit) => ({
          hash: commit.hash,
          shortHash: commit.hash.substring(0, 8),
          message: commit.message,
          author: commit.author_name || 'Unknown',
          email: commit.author_email,
          date: commit.date,
          timestamp: new Date(commit.date).toISOString(),
          record: record,
        }));

        const response = {
          history: transformedHistory,
          summary: {
            totalCommits,
            returnedCommits: transformedHistory.length,
            limit: historyLimit,
            offset: historyOffset,
            record: record,
            filters: {
              author: author || null,
              since: since || null,
              until: until || null,
            },
          },
        };

        logger.info('Record history retrieved successfully', {
          record,
          totalCommits,
          returnedCommits: transformedHistory.length,
          requestId: req.requestId,
        });

        sendSuccess(response, req, res, {
          operation: 'get_record_history',
          meta: {
            record,
            totalCommits,
            returnedCommits: transformedHistory.length,
          },
        });
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

  return router;
}
