import { Router, Response } from 'express';
import { query, validationResult } from 'express-validator';
import {
  sendSuccess,
  logApiRequest,
  handleApiError,
  handleValidationError,
} from '../utils/api-logger.js';
import { Logger } from '@civicpress/core';

// Declare setTimeout and clearTimeout for TypeScript
// declare const setTimeout: any;
// declare const clearTimeout: any;

const logger = new Logger();

export const searchRouter = Router();

// Development-only delay middleware for testing loading states
// const addDevDelay = async (req: any, res: any, next: any) => {
//   // Check if we're in development mode (NODE_ENV not set or equals 'development')
//   const isDev = !process.env.NODE_ENV || process.env.NODE_ENV === 'development';

//   console.log(
//     '🔍 Search delay middleware - NODE_ENV:',
//     process.env.NODE_ENV,
//     'isDev:',
//     isDev
//   );

//   if (isDev) {
//     console.log('🔄 Adding 3-second delay for search endpoint:', req.path);
//     // Simple delay using promise
//     await new Promise((resolve) => {
//       const timer = setTimeout(resolve, 3000);
//       // Clean up timer if request is cancelled
//       req.on('close', () => clearTimeout(timer));
//     });
//   }
//   next();
// };

// Apply delay middleware to search routes in development
// searchRouter.use(addDevDelay);

// GET /api/search - Search records (handles both public and authenticated access)
searchRouter.get(
  '/',
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
      .isInt({ min: 1, max: 300 })
      .withMessage('Limit must be between 1 and 300'),
    query('cursor')
      .optional()
      .isString()
      .withMessage('Cursor must be a string'),
  ],
  async (req: any, res: Response) => {
    const isAuthenticated = (req as any).user !== undefined;
    const operation = isAuthenticated
      ? 'search_records_authenticated'
      : 'search_records_public';

    logApiRequest(req, { operation });

    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return handleValidationError(operation, errors.array(), req, res);
      }

      const { q: query, type, status, limit, cursor } = req.query;

      logger.info(
        `Searching records (${isAuthenticated ? 'authenticated' : 'public'})`,
        {
          query,
          type,
          status,
          limit,
          cursor: cursor ? '***' : undefined, // Don't log the actual cursor
          requestId: (req as any).requestId,
          userId: (req as any).user?.id,
          userRole: (req as any).user?.role,
          isAuthenticated,
        }
      );

      const civicPress = (req as any).civicPress;
      if (!civicPress) {
        throw new Error('CivicPress instance not available');
      }

      const recordsService = new (
        await import('../services/records-service')
      ).RecordsService(civicPress);
      const result = await recordsService.searchRecords(query as string, {
        type: type as string,
        status: status as string,
        limit: limit ? parseInt(limit as string) : 20,
        cursor: cursor as string,
      });

      logger.info(
        `Search completed successfully (${isAuthenticated ? 'authenticated' : 'public'})`,
        {
          query,
          totalResults: result.records.length,
          hasMore: result.hasMore,
          requestId: (req as any).requestId,
          userId: (req as any).user?.id,
          userRole: (req as any).user?.role,
          isAuthenticated,
        }
      );

      sendSuccess(
        {
          results: result.records,
          nextCursor: result.nextCursor,
          hasMore: result.hasMore,
          query: query as string,
        },
        req,
        res,
        { operation }
      );
    } catch (error) {
      handleApiError(operation, error, req, res, 'Failed to search records');
    }
  }
);

// GET /api/search/suggestions - Get search suggestions
searchRouter.get(
  '/suggestions',
  [
    query('q')
      .isString()
      .notEmpty()
      .withMessage('Query parameter "q" is required'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 20 })
      .withMessage('Limit must be between 1 and 20'),
  ],
  async (req: any, res: Response) => {
    const isAuthenticated = (req as any).user !== undefined;
    const operation = 'search_suggestions';

    logApiRequest(req, { operation });

    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return handleValidationError(operation, errors.array(), req, res);
      }

      const { q: query, limit = 10 } = req.query;

      logger.info(
        `Getting search suggestions (${isAuthenticated ? 'authenticated' : 'public'})`,
        {
          query,
          limit,
          requestId: (req as any).requestId,
          userId: (req as any).user?.id,
          userRole: (req as any).user?.role,
          isAuthenticated,
        }
      );

      const civicPress = (req as any).civicPress;
      if (!civicPress) {
        throw new Error('CivicPress instance not available');
      }

      const recordManager = civicPress.getRecordManager();
      const suggestions = await recordManager.getSearchSuggestions(
        query as string,
        {
          limit: parseInt(limit as string),
        }
      );

      logger.info(
        `Search suggestions completed successfully (${isAuthenticated ? 'authenticated' : 'public'})`,
        {
          query,
          suggestionsCount: suggestions.length,
          requestId: (req as any).requestId,
          userId: (req as any).user?.id,
          userRole: (req as any).user?.role,
          isAuthenticated,
        }
      );

      sendSuccess(
        {
          suggestions,
          query: query as string,
        },
        req,
        res,
        { operation }
      );
    } catch (error) {
      handleApiError(
        operation,
        error,
        req,
        res,
        'Failed to get search suggestions'
      );
    }
  }
);
