import { Router, Response } from 'express';
import { query, validationResult } from 'express-validator';
import {
  sendSuccess,
  logApiRequest,
  handleApiError,
  handleValidationError,
} from '../utils/api-logger.js';
import { Logger } from '@civicpress/core';

const logger = new Logger();

export const searchRouter = Router();

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
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    query('sort')
      .optional()
      .isIn([
        'relevance',
        'updated_desc',
        'created_desc',
        'title_asc',
        'title_desc',
      ])
      .withMessage(
        'Sort must be one of: relevance, updated_desc, created_desc, title_asc, title_desc'
      )
      .customSanitizer((value) => value?.toLowerCase()),
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

      const { q: query, type, limit, page, sort } = req.query;

      // Query only records table - all records there are published (by table location)
      // No status filtering needed - table location determines if record is published

      // Parse pagination parameters
      const pageSize = limit ? parseInt(limit as string) : 50;
      const currentPage = page ? parseInt(page as string) : 1;

      logger.info(
        `Searching records (${isAuthenticated ? 'authenticated' : 'public'})`,
        {
          query,
          type,
          pageSize,
          currentPage,
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
        await import('../services/records-service.js')
      ).RecordsService(civicPress);
      const result = await recordsService.searchRecords(
        query as string,
        {
          type: type as string,
          // No status filter - table location (records table) determines published state
          limit: pageSize,
          page: currentPage,
          sort: (sort as string) || 'relevance', // Default to relevance for search
        },
        (req as any).user
      );

      logger.info(
        `Search completed successfully (${isAuthenticated ? 'authenticated' : 'public'})`,
        {
          query,
          totalResults: result.records.length,
          totalCount: result.totalCount,
          currentPage: result.currentPage,
          totalPages: result.totalPages,
          requestId: (req as any).requestId,
          userId: (req as any).user?.id,
          userRole: (req as any).user?.role,
          isAuthenticated,
        }
      );

      sendSuccess(
        {
          results: result.records,
          totalCount: result.totalCount,
          currentPage: result.currentPage,
          totalPages: result.totalPages,
          pageSize: result.pageSize,
          query: query as string,
          sort: result.sort || 'relevance',
        },
        req,
        res,
        {
          operation,
          meta: {
            sort: result.sort || 'relevance',
          },
        }
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
      const searchService = civicPress.getDatabaseService().getSearchService();

      let suggestions: any[] = [];
      if (searchService) {
        // Use search service to get structured suggestions (words + titles)
        const structuredSuggestions = await searchService.getSuggestions(
          query as string,
          parseInt(limit as string),
          true // enableTypoTolerance
        );
        // Ensure all suggestions have type field
        suggestions = structuredSuggestions.map((s: any) => ({
          text: s.text,
          source: s.source,
          type: s.type || ('title' as const), // Default to 'title' if type is missing
          frequency: s.frequency,
        }));
      } else {
        // Fallback to record manager
        const textSuggestions = await recordManager.getSearchSuggestions(
          query as string,
          {
            limit: parseInt(limit as string),
          }
        );
        // Convert to structured format
        suggestions = textSuggestions.map((text: string) => ({
          text,
          source: 'title',
          type: 'title' as const,
        }));
      }

      // Separate words and titles for easier UI consumption
      const words = suggestions
        .filter((s) => s.type === 'word')
        .map((s) => s.text);
      const titles = suggestions
        .filter((s) => s.type === 'title')
        .map((s) => s.text);

      logger.info(
        `Search suggestions completed successfully (${isAuthenticated ? 'authenticated' : 'public'})`,
        {
          query,
          wordsCount: words.length,
          titlesCount: titles.length,
          totalCount: suggestions.length,
          requestId: (req as any).requestId,
          userId: (req as any).user?.id,
          userRole: (req as any).user?.role,
          isAuthenticated,
        }
      );

      sendSuccess(
        {
          suggestions: suggestions.map((s) => s.text), // Keep flat array for backward compatibility
          words, // New: separate words array
          titles, // New: separate titles array
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
