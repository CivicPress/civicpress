import { Router, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { join } from 'path';
import { AuthenticatedRequest, requirePermission } from '../middleware/auth';
import { Logger } from '@civicpress/core';
import {
  sendSuccess,
  handleApiError,
  logApiRequest,
  handleValidationError,
} from '../utils/api-logger';

const logger = new Logger();

export function createIndexingRouter() {
  const router = Router();

  // POST /api/indexing/generate - Generate indexes
  router.post(
    '/generate',
    requirePermission('records:import'),
    body('rebuild').optional().isBoolean(),
    body('modules').optional().isArray(),
    body('types').optional().isArray(),
    body('statuses').optional().isArray(),
    body('syncDatabase').optional().isBoolean(),
    body('conflictResolution')
      .optional()
      .isIn(['file-wins', 'database-wins', 'timestamp', 'manual']),
    async (req: AuthenticatedRequest, res: Response) => {
      logApiRequest(req, { operation: 'generate_indexes' });

      logger.debug('Generate indexes route called', {
        requestId: (req as any).requestId,
        body: req.body,
      });

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        logger.warn('Validation error in indexing generate', {
          errors: errors.array(),
          requestId: (req as any).requestId,
        });
        return handleValidationError(
          'generate_indexes',
          errors.array(),
          req,
          res
        );
      }

      try {
        const {
          rebuild = false,
          modules,
          types,
          statuses,
          syncDatabase = false,
          conflictResolution = 'file-wins',
        } = req.body;

        logger.info('Generating indexes', {
          rebuild,
          modules,
          types,
          statuses,
          syncDatabase,
          conflictResolution,
          requestId: (req as any).requestId,
        });

        const civicPress = (req as any).civicPress;
        logger.debug('CivicPress instance check', {
          hasCivicPress: !!civicPress,
          requestId: (req as any).requestId,
        });

        if (!civicPress) {
          logger.error('CivicPress instance not available', {
            requestId: (req as any).requestId,
          });
          const error = new Error('CivicPress instance not available');
          (error as any).statusCode = 500;
          (error as any).code = 'CIVICPRESS_NOT_AVAILABLE';
          throw error;
        }

        const indexingService = civicPress.getIndexingService();
        logger.debug('IndexingService instance check', {
          hasIndexingService: !!indexingService,
          requestId: (req as any).requestId,
        });

        if (!indexingService) {
          logger.error('Indexing service not available', {
            requestId: (req as any).requestId,
          });
          const error = new Error('Indexing service not available');
          (error as any).statusCode = 500;
          (error as any).code = 'INDEXING_SERVICE_NOT_AVAILABLE';
          throw error;
        }

        const options = {
          rebuild,
          modules,
          types,
          statuses,
          syncDatabase,
          conflictResolution,
        };

        logger.debug('Calling generateIndexes', {
          options,
          requestId: (req as any).requestId,
        });

        const index = await indexingService.generateIndexes(options);

        logger.info('Indexes generated successfully', {
          totalRecords: index.metadata.totalRecords,
          modules: index.metadata.modules,
          types: index.metadata.types,
          statuses: index.metadata.statuses,
          requestId: (req as any).requestId,
        });

        sendSuccess(
          {
            index: {
              totalRecords: index.metadata.totalRecords,
              modules: index.metadata.modules,
              types: index.metadata.types,
              statuses: index.metadata.statuses,
              generated: index.metadata.generated,
            },
            syncDatabase,
            conflictResolution,
          },
          req,
          res,
          { operation: 'generate_indexes' }
        );
      } catch (error) {
        handleApiError(
          'generate_indexes',
          error,
          req,
          res,
          'Failed to generate indexes'
        );
      }
    }
  );

  // GET /api/indexing/status - Get indexing status
  router.get(
    '/status',
    requirePermission('records:view'),
    async (req: AuthenticatedRequest, res: Response) => {
      logApiRequest(req, { operation: 'get_index_status' });

      try {
        logger.info('Getting indexing status', {
          requestId: (req as any).requestId,
        });

        const civicPress = (req as any).civicPress;
        if (!civicPress) {
          const error = new Error('CivicPress instance not available');
          (error as any).statusCode = 500;
          (error as any).code = 'CIVICPRESS_NOT_AVAILABLE';
          throw error;
        }

        logger.debug('CivicPress instance available', {
          dataDir: civicPress.getDataDir(),
          requestId: (req as any).requestId,
        });

        const indexingService = civicPress.getIndexingService();
        if (!indexingService) {
          const error = new Error('Indexing service not available');
          (error as any).statusCode = 500;
          (error as any).code = 'INDEXING_SERVICE_NOT_AVAILABLE';
          throw error;
        }

        // Load the current index
        const indexPath = join(civicPress.getDataDir(), 'records', 'index.yml');
        logger.debug('Loading index from path', {
          indexPath,
          requestId: (req as any).requestId,
        });

        const index = indexingService.loadIndex(indexPath);

        if (!index) {
          logger.warn('No index found', {
            indexPath,
            requestId: (req as any).requestId,
          });
          const error = new Error('No index found');
          (error as any).statusCode = 404;
          (error as any).code = 'INDEX_NOT_FOUND';
          throw error;
        }

        logger.info('Index status retrieved successfully', {
          totalRecords: index.metadata.totalRecords,
          modules: index.metadata.modules,
          types: index.metadata.types,
          statuses: index.metadata.statuses,
          requestId: (req as any).requestId,
        });

        sendSuccess(
          {
            status: {
              totalRecords: index.metadata.totalRecords,
              modules: index.metadata.modules,
              types: index.metadata.types,
              statuses: index.metadata.statuses,
              generated: index.metadata.generated,
              lastUpdated: index.metadata.generated,
            },
          },
          req,
          res,
          { operation: 'get_index_status' }
        );
      } catch (error) {
        handleApiError(
          'get_index_status',
          error,
          req,
          res,
          'Failed to get indexing status'
        );
      }
    }
  );

  // POST /api/indexing/sync - Sync records to database
  router.post(
    '/sync',
    requirePermission('records:import'),
    body('conflictResolution')
      .optional()
      .isIn(['file-wins', 'database-wins', 'timestamp', 'manual']),
    async (req: AuthenticatedRequest, res: Response) => {
      logApiRequest(req, { operation: 'sync_records' });

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        logger.warn('Validation error in indexing sync', {
          errors: errors.array(),
          requestId: (req as any).requestId,
        });
        return handleValidationError('sync_records', errors.array(), req, res);
      }

      try {
        const { conflictResolution = 'file-wins' } = req.body;

        logger.info('Starting database sync', {
          conflictResolution,
          requestId: (req as any).requestId,
        });

        const civicPress = (req as any).civicPress;
        if (!civicPress) {
          const error = new Error('CivicPress instance not available');
          (error as any).statusCode = 500;
          (error as any).code = 'CIVICPRESS_NOT_AVAILABLE';
          throw error;
        }

        const indexingService = civicPress.getIndexingService();
        if (!indexingService) {
          const error = new Error('Indexing service not available');
          (error as any).statusCode = 500;
          (error as any).code = 'INDEXING_SERVICE_NOT_AVAILABLE';
          throw error;
        }

        // Generate indexes with sync enabled
        const index = await indexingService.generateIndexes({
          syncDatabase: true,
          conflictResolution,
        });

        logger.info('Database sync completed successfully', {
          totalRecords: index.metadata.totalRecords,
          conflictResolution,
          requestId: (req as any).requestId,
        });

        sendSuccess(
          {
            message: 'Database sync completed',
            results: {
              totalRecords: index.metadata.totalRecords,
              conflictResolution,
              generated: index.metadata.generated,
            },
          },
          req,
          res,
          { operation: 'sync_records' }
        );
      } catch (error) {
        handleApiError(
          'sync_records',
          error,
          req,
          res,
          'Failed to sync records to database'
        );
      }
    }
  );

  // GET /api/indexing/search - Search within index
  router.get(
    '/search',
    requirePermission('records:view'),
    async (req: AuthenticatedRequest, res: Response) => {
      logApiRequest(req, { operation: 'search_index' });

      try {
        const { q: query, type, status, module, tags } = req.query;

        if (!query) {
          logger.warn('Missing query parameter in search', {
            requestId: (req as any).requestId,
          });
          const error = new Error('Query parameter "q" is required');
          (error as any).statusCode = 400;
          throw error;
        }

        logger.info('Searching index', {
          query,
          type,
          status,
          module,
          tags,
          requestId: (req as any).requestId,
        });

        const civicPress = (req as any).civicPress;
        if (!civicPress) {
          const error = new Error('CivicPress instance not available');
          (error as any).statusCode = 500;
          (error as any).code = 'CIVICPRESS_NOT_AVAILABLE';
          throw error;
        }

        const indexingService = civicPress.getIndexingService();
        if (!indexingService) {
          const error = new Error('Indexing service not available');
          (error as any).statusCode = 500;
          (error as any).code = 'INDEXING_SERVICE_NOT_AVAILABLE';
          throw error;
        }

        // Load the current index
        const indexPath = join(civicPress.getDataDir(), 'records', 'index.yml');
        logger.debug('Loading index for search', {
          indexPath,
          requestId: (req as any).requestId,
        });

        const index = indexingService.loadIndex(indexPath);

        if (!index) {
          logger.warn('No index found for search', {
            indexPath,
            requestId: (req as any).requestId,
          });
          const error = new Error('No index found');
          (error as any).statusCode = 404;
          (error as any).code = 'INDEX_NOT_FOUND';
          throw error;
        }

        const searchOptions = {
          type: type as string,
          status: status as string,
          module: module as string,
          tags: tags ? (tags as string).split(',') : undefined,
        };

        const results = indexingService.searchIndex(
          index,
          query as string,
          searchOptions
        );

        logger.info('Search completed successfully', {
          query,
          totalResults: results.length,
          searchOptions,
          requestId: (req as any).requestId,
        });

        sendSuccess(
          {
            results: {
              query,
              total: results.length,
              records: results.map((entry: any) => ({
                title: entry.title,
                type: entry.type,
                status: entry.status,
                file: entry.file,
                tags: entry.tags,
                authors: entry.authors,
                created: entry.created,
                updated: entry.updated,
              })),
            },
          },
          req,
          res,
          { operation: 'search_index' }
        );
      } catch (error) {
        handleApiError(
          'search_index',
          error,
          req,
          res,
          'Failed to search index'
        );
      }
    }
  );

  /**
   * GET /api/indexing/stats
   * Get indexing statistics
   */
  router.get('/stats', async (req: AuthenticatedRequest, res: Response) => {
    logApiRequest(req, { operation: 'get_indexing_stats' });

    try {
      const civicPress = (req as any).civicPress;
      if (!civicPress) {
        const error = new Error('CivicPress instance not available');
        (error as any).statusCode = 500;
        (error as any).code = 'CIVICPRESS_NOT_AVAILABLE';
        throw error;
      }

      const indexingService = civicPress.getIndexingService();
      const stats = await indexingService.getIndexingStats();

      sendSuccess(
        {
          stats,
        },
        req,
        res,
        { operation: 'get_indexing_stats' }
      );
    } catch (error) {
      handleApiError('get_indexing_stats', error, req, res);
    }
  });

  /**
   * GET /api/indexing/validate
   * Validate all indexes
   */
  router.get('/validate', async (req: AuthenticatedRequest, res: Response) => {
    logApiRequest(req, { operation: 'validate_indexes' });

    try {
      const civicPress = (req as any).civicPress;
      if (!civicPress) {
        const error = new Error('CivicPress instance not available');
        (error as any).statusCode = 500;
        (error as any).code = 'CIVICPRESS_NOT_AVAILABLE';
        throw error;
      }

      const indexingService = civicPress.getIndexingService();
      const validation = await indexingService.validateIndexes();

      sendSuccess(
        {
          validation,
        },
        req,
        res,
        { operation: 'validate_indexes' }
      );
    } catch (error) {
      handleApiError('validate_indexes', error, req, res);
    }
  });

  return router;
}
