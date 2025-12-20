import { Router, Response } from 'express';
import { query, validationResult } from 'express-validator';
import {
  AuthenticatedRequest,
  requireRecordPermission,
} from '../middleware/auth.js';
import { Logger } from '@civicpress/core';
import {
  sendSuccess,
  handleApiError,
  logApiRequest,
  handleValidationError,
} from '../utils/api-logger.js';

const logger = new Logger();

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
        const civicPress = (req as any).civicPress;

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
          requestId: (req as any).requestId,
        });

        // Get Git engine from CivicPress
        const gitEngine = civicPress.getGitEngine();

        // Get commit history - get all commits first, then filter and paginate
        const historyLimit = parseInt(limit as string) || 10;
        const historyOffset = parseInt(offset as string) || 0;

        // Get all commits first to get accurate total count
        let history = await gitEngine.getHistory();

        // Filter by record if specified
        if (record) {
          const recordPath = `${record}.md`;
          const recordStr = record as string;
          history = history.filter((commit: any) => {
            // Check if this commit affected the specified record
            return (
              commit.message.includes(recordStr) ||
              commit.message.includes(recordPath) ||
              commit.message.includes(recordStr.replace('/', '/'))
            );
          });
        }

        // Filter by author if specified
        if (author) {
          history = history.filter(
            (commit: any) =>
              commit.author_name
                ?.toLowerCase()
                .includes((author as string).toLowerCase()) ||
              commit.author_email
                ?.toLowerCase()
                .includes((author as string).toLowerCase())
          );
        }

        // Filter by date range if specified
        if (since || until) {
          const sinceDate = since ? new Date(since as string) : null;
          const untilDate = until ? new Date(until as string) : null;

          history = history.filter((commit: any) => {
            const commitDate = new Date(commit.date);
            if (sinceDate && commitDate < sinceDate) return false;
            if (untilDate && commitDate > untilDate) return false;
            return true;
          });
        }

        // Apply pagination
        const paginatedHistory = history.slice(
          historyOffset,
          historyOffset + historyLimit
        );

        // Transform commit data for API response
        const transformedHistory = paginatedHistory.map((commit: any) => ({
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
            totalCommits: history.length,
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
          totalCommits: history.length,
          returnedCommits: transformedHistory.length,
          requestId: (req as any).requestId,
        });

        sendSuccess(response, req, res, {
          operation: 'get_history',
          meta: {
            totalCommits: history.length,
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
        const civicPress = (req as any).civicPress;

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
          requestId: (req as any).requestId,
        });

        // Get Git engine from CivicPress
        const gitEngine = civicPress.getGitEngine();

        // Get commit history for specific record - get all commits first, then filter and paginate
        const historyLimit = parseInt(limit as string) || 10;
        const historyOffset = parseInt(offset as string) || 0;

        // Get all commits first to get accurate total count
        let history = await gitEngine.getHistory();

        // Filter by specific record
        const recordPath = `${record}.md`;
        history = history.filter((commit: any) => {
          // Check if this commit affected the specified record
          return (
            commit.message.includes(record) ||
            commit.message.includes(recordPath) ||
            commit.message.includes(record.replace('/', '/'))
          );
        });

        // Filter by author if specified
        if (author) {
          history = history.filter(
            (commit: any) =>
              commit.author_name
                ?.toLowerCase()
                .includes((author as string).toLowerCase()) ||
              commit.author_email
                ?.toLowerCase()
                .includes((author as string).toLowerCase())
          );
        }

        // Filter by date range if specified
        if (since || until) {
          const sinceDate = since ? new Date(since as string) : null;
          const untilDate = until ? new Date(until as string) : null;

          history = history.filter((commit: any) => {
            const commitDate = new Date(commit.date);
            if (sinceDate && commitDate < sinceDate) return false;
            if (untilDate && commitDate > untilDate) return false;
            return true;
          });
        }

        // Apply pagination
        const paginatedHistory = history.slice(
          historyOffset,
          historyOffset + historyLimit
        );

        // Transform commit data for API response
        const transformedHistory = paginatedHistory.map((commit: any) => ({
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
            totalCommits: history.length,
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
          totalCommits: history.length,
          returnedCommits: transformedHistory.length,
          requestId: (req as any).requestId,
        });

        sendSuccess(response, req, res, {
          operation: 'get_record_history',
          meta: {
            record,
            totalCommits: history.length,
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
