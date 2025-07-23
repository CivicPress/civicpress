import { Router, Response } from 'express';
import { query, validationResult } from 'express-validator';
import { AuthenticatedRequest, requirePermission } from '../middleware/auth';
import {
  sendSuccess,
  logApiRequest,
  handleApiError,
  handleValidationError,
} from '../utils/api-logger';
import { Logger } from '@civicpress/core';

// Declare setTimeout and clearTimeout for TypeScript
declare const setTimeout: any;
declare const clearTimeout: any;

const logger = new Logger();

export const searchRouter = Router();

// Development-only delay middleware for testing loading states
const addDevDelay = async (req: any, res: any, next: any) => {
  // Check if we're in development mode (NODE_ENV not set or equals 'development')
  const isDev = !process.env.NODE_ENV || process.env.NODE_ENV === 'development';

  console.log(
    '🔍 Search delay middleware - NODE_ENV:',
    process.env.NODE_ENV,
    'isDev:',
    isDev
  );

  if (isDev) {
    console.log('🔄 Adding 3-second delay for search endpoint:', req.path);
    // Simple delay using promise
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, 3000);
      // Clean up timer if request is cancelled
      req.on('close', () => clearTimeout(timer));
    });
  }
  next();
};

// Apply delay middleware to search routes in development
searchRouter.use(addDevDelay);

// GET /api/search - Search records
searchRouter.get(
  '/',
  requirePermission('records:view'),
  [
    query('q')
      .isString()
      .notEmpty()
      .withMessage('Query parameter "q" is required'),
    query('type').optional().isString().withMessage('Type must be a string'),
    query('status')
      .optional()
      .isString()
      .withMessage('Status must be a string'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
    query('offset')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Offset must be a non-negative integer'),
  ],
  async (req: AuthenticatedRequest, res: Response) => {
    logApiRequest(req, { operation: 'search_records' });

    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return handleValidationError(
          'search_records',
          errors.array(),
          req,
          res
        );
      }

      const { q: query, type, status, limit, offset } = req.query;

      logger.info('Searching records', {
        query,
        type,
        status,
        limit,
        offset,
        requestId: (req as any).requestId,
      });

      const civicPress = (req as any).civicPress;
      if (!civicPress) {
        throw new Error('CivicPress instance not available');
      }

      const recordManager = civicPress.getRecordManager();
      const result = await recordManager.searchRecords(query as string, {
        type: type as string,
        status: status as string,
        limit: limit ? parseInt(limit as string) : undefined,
        offset: offset ? parseInt(offset as string) : undefined,
      });

      logger.info('Search completed successfully', {
        query,
        totalResults: result.total,
        requestId: (req as any).requestId,
      });

      sendSuccess(
        {
          results: result.records,
          total: result.total,
          query: query as string,
        },
        req,
        res,
        { operation: 'search_records' }
      );
    } catch (error) {
      handleApiError(
        'search_records',
        error,
        req,
        res,
        'Failed to search records'
      );
    }
  }
);
