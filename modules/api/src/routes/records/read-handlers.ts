import { Router, Response } from 'express';
import { param, query, validationResult } from 'express-validator';
import { optionalAuth } from '../../middleware/auth.js';
import { RecordsService } from '../../services/records-service.js';
import { userCan } from '@civicpress/core';
import {
  sendSuccess,
  handleApiError,
  logApiRequest,
} from '../../utils/api-logger.js';
import { logger, handleRecordsValidationError } from './handlers-common.js';

export function registerReadRoutes(
  router: Router,
  recordsService: RecordsService
): void {
  // GET /api/records - List records (handles both public and authenticated access)
  // IMPORTANT: Only returns published records from records table (all records in this table are published)
  router.get(
    '/',
    [
      query('type').optional().isString().withMessage('Type must be a string'),
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
        .isIn(['updated_desc', 'created_desc', 'title_asc', 'title_desc'])
        .withMessage(
          'Sort must be one of: updated_desc, created_desc, title_asc, title_desc'
        )
        .customSanitizer((value) => value?.toLowerCase()),
    ],
    optionalAuth(recordsService.getCivicPress()),
    async (req: any, res: Response) => {
      const isAuthenticated = (req as any).user !== undefined;
      const operation = isAuthenticated
        ? 'list_records_authenticated'
        : 'list_records_public';

      logApiRequest(req, { operation });

      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return handleRecordsValidationError(
            'list_records',
            errors.array(),
            req,
            res
          );
        }

        const { type, limit, page, sort } = req.query;

        // Validate relevance sort is not used on records endpoint
        if (sort === 'relevance') {
          const error = new Error(
            'Relevance sort not available for records listing'
          );
          (error as any).statusCode = 400;
          (error as any).code = 'INVALID_SORT_CONTEXT';
          (error as any).details =
            'Relevance sort is only available for search endpoint';
          throw error;
        }

        // Query only records table - all records there are published (by table location)
        // No status filtering needed - table location determines if record is published

        // Parse pagination parameters
        const pageSize = limit ? parseInt(limit as string) : 50;
        const currentPage = page ? parseInt(page as string) : 1;

        logger.info(
          `Listing records (${isAuthenticated ? 'authenticated' : 'public'})`,
          {
            type,
            pageSize,
            currentPage,
            requestId: (req as any).requestId,
            userId: (req as any).user?.id,
            userRole: (req as any).user?.role,
            isAuthenticated,
          }
        );

        const result = await recordsService.listRecords(
          {
            type: type as string,
            // No status filter - table location (records table) determines published state
            limit: pageSize,
            page: currentPage,
            sort: (sort as string) || 'created_desc', // Default to created_desc
          },
          (req as any).user
        );

        logger.info(
          `Records listed successfully (${isAuthenticated ? 'authenticated' : 'public'})`,
          {
            totalRecords: result.records?.length || 0,
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
            ...result,
            sort: result.sort || 'created_desc',
          },
          req,
          res,
          {
            operation,
            meta: {
              sort: result.sort || 'created_desc',
            },
          }
        );
      } catch (error) {
        handleApiError(operation, error, req, res, 'Failed to list records');
      }
    }
  );

  // GET /api/records/summary - Aggregate counts
  router.get('/summary', async (req: any, res: Response) => {
    const isAuthenticated = (req as any).user !== undefined;
    const operation = isAuthenticated
      ? 'records_summary_authenticated'
      : 'records_summary_public';

    logApiRequest(req, { operation });

    try {
      const { type } = req.query;

      // Query only records table - all records there are published (by table location)
      // No status filtering needed - table location determines if record is published

      logger.info(
        `Fetching record summary (${isAuthenticated ? 'authenticated' : 'public'})`,
        {
          type,
          requestId: (req as any).requestId,
          userId: (req as any).user?.id,
          userRole: (req as any).user?.role,
          isAuthenticated,
        }
      );

      const summary = await recordsService.getRecordSummary({
        type: type as string,
        // No status filter - table location (records table) determines published state
      });

      sendSuccess(summary, req, res, { operation });
    } catch (error) {
      handleApiError(
        operation,
        error,
        req,
        res,
        'Failed to get record summary'
      );
    }
  });

  // GET /api/records/:id/frontmatter - Get frontmatter YAML for a record (handles both public and authenticated access)
  // NOTE: This must come BEFORE /:id route to avoid matching "frontmatter" as an ID
  router.get(
    '/:id/frontmatter',
    param('id').isString().notEmpty(),
    optionalAuth(recordsService.getCivicPress()),
    async (req: any, res: Response) => {
      const isAuthenticated = (req as any).user !== undefined;
      const operation = isAuthenticated
        ? 'get_frontmatter_authenticated'
        : 'get_frontmatter_public';

      logApiRequest(req, { operation });

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return handleRecordsValidationError(
          'get_frontmatter',
          errors.array(),
          req,
          res
        );
      }

      try {
        const { id } = req.params;

        logger.info(
          `Getting frontmatter YAML for record ${id} (${isAuthenticated ? 'authenticated' : 'public'})`,
          {
            recordId: id,
            requestId: (req as any).requestId,
            userId: (req as any).user?.id,
            userRole: (req as any).user?.role,
            isAuthenticated,
          }
        );

        const yaml = await recordsService.getFrontmatterYaml(
          id,
          (req as any).user
        );

        if (!yaml) {
          const error = new Error('Record not found');
          (error as any).statusCode = 404;
          (error as any).code = 'RECORD_NOT_FOUND';
          throw error;
        }

        logger.info(
          `Frontmatter YAML for record ${id} retrieved successfully (${isAuthenticated ? 'authenticated' : 'public'})`,
          {
            recordId: id,
            requestId: (req as any).requestId,
            userId: (req as any).user?.id,
            userRole: (req as any).user?.role,
            isAuthenticated,
          }
        );

        // Return as plain text YAML (not JSON)
        res.setHeader('Content-Type', 'text/yaml; charset=utf-8');
        res.status(200).send(yaml);
      } catch (error) {
        handleApiError(
          operation,
          error,
          req,
          res,
          'Failed to get frontmatter YAML'
        );
      }
    }
  );

  // GET /api/records/:id - Get a specific record (handles both public and authenticated access)
  // Uses optional auth middleware - if user is authenticated, they can see drafts
  router.get(
    '/:id',
    param('id').isString().notEmpty(),
    // Optional auth - attach user if token is present, but don't require it
    optionalAuth(recordsService.getCivicPress()),
    async (req: any, res: Response) => {
      const isAuthenticated = (req as any).user !== undefined;
      const operation = isAuthenticated
        ? 'get_record_authenticated'
        : 'get_record_public';

      logApiRequest(req, { operation });

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return handleRecordsValidationError(
          'get_record',
          errors.array(),
          req,
          res
        );
      }

      try {
        const { id } = req.params;
        const { edit } = req.query; // Check if this is for edit mode

        logger.info(
          `Getting record ${id} (${isAuthenticated ? 'authenticated' : 'public'}, edit: ${edit === 'true'})`,
          {
            recordId: id,
            requestId: (req as any).requestId,
            userId: (req as any).user?.id,
            userRole: (req as any).user?.role,
            isAuthenticated,
            editMode: edit === 'true',
          }
        );

        // For edit mode: authenticated users with edit permission get draft if it exists
        // For view mode: always return published records from records table
        const user = (req as any).user;
        let record;

        if (
          edit === 'true' &&
          user &&
          typeof user === 'object' &&
          user.role &&
          user.username
        ) {
          // Edit mode: check for draft first, then fall back to published
          record = await recordsService.getDraftOrRecord(id, user);
        } else {
          // View mode: always return published version
          record = await recordsService.getRecord(id);

          // Add isDraft flag for view mode (always false since we're returning published)
          if (record) {
            record.isDraft = false;
          }

          // Check if there's a draft for this published record (for badge display)
          // Only check if record was found
          if (
            record &&
            user &&
            typeof user === 'object' &&
            user.role &&
            user.username
          ) {
            try {
              const hasPermission = await userCan(user, 'records:edit', {
                action: 'edit',
              });
              if (hasPermission) {
                // Check if a draft exists for this record ID
                const draft = await recordsService.getDraftOrRecord(id, user);
                record.hasUnpublishedChanges = draft?.isDraft === true;
              } else {
                record.hasUnpublishedChanges = false;
              }
            } catch (error) {
              // If permission check fails, assume no draft
              record.hasUnpublishedChanges = false;
            }
          }
          // If record is null (not found) or no valid user, hasUnpublishedChanges won't be set (which is fine for public users)
        }

        if (!record) {
          const error = new Error('Record not found');
          (error as any).statusCode = 404;
          (error as any).code = 'RECORD_NOT_FOUND';
          throw error;
        }

        logger.info(
          `Record ${id} retrieved successfully (${isAuthenticated ? 'authenticated' : 'public'})`,
          {
            recordId: id,
            recordType: record.type,
            recordStatus: record.status,
            requestId: (req as any).requestId,
            userId: (req as any).user?.id,
            userRole: (req as any).user?.role,
            isAuthenticated,
          }
        );

        sendSuccess(record, req, res, { operation });
      } catch (error) {
        handleApiError(operation, error, req, res, 'Failed to get record');
      }
    }
  );

  // GET /api/records/:id/raw - Get raw file content for a record (including frontmatter)
  router.get(
    '/:id/raw',
    param('id').isString().notEmpty(),
    async (req: any, res: Response) => {
      const isAuthenticated = (req as any).user !== undefined;
      const operation = isAuthenticated
        ? 'get_raw_record_authenticated'
        : 'get_raw_record_public';

      logApiRequest(req, { operation });

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return handleRecordsValidationError(
          'get_raw_record',
          errors.array(),
          req,
          res
        );
      }

      try {
        const { id } = req.params;

        logger.info(
          `Getting raw record ${id} (${isAuthenticated ? 'authenticated' : 'public'})`,
          {
            recordId: id,
            requestId: (req as any).requestId,
            userId: (req as any).user?.id,
            userRole: (req as any).user?.role,
            isAuthenticated,
          }
        );

        // For public users, only allow access to published records
        // For authenticated users with edit permission, allow access to drafts too
        const user = (req as any).user;

        if (!user) {
          // Public users: verify the record is published before allowing access
          const publishedRecord = await recordsService.getRecord(id);
          if (!publishedRecord || publishedRecord.status !== 'published') {
            const error = new Error('Record not found');
            (error as any).statusCode = 404;
            (error as any).code = 'RECORD_NOT_FOUND';
            throw error;
          }
        }
        // For authenticated users, getDraftOrRecord will handle draft vs published logic
        // But getRawRecord only works for published records (files exist)
        // So we'll check draft first for authenticated users, then fall back to raw
        let record;
        if (user) {
          // For authenticated users, check if it's a draft first
          const draftOrRecord = await recordsService.getDraftOrRecord(id, user);
          if (draftOrRecord?.isDraft) {
            // For drafts, construct raw content from draft data
            const frontmatterYaml = await recordsService.getFrontmatterYaml(
              id,
              user
            );
            const content =
              draftOrRecord.markdownBody || draftOrRecord.content || '';
            record = {
              id: draftOrRecord.id,
              title: draftOrRecord.title,
              type: draftOrRecord.type,
              status: draftOrRecord.status,
              content: frontmatterYaml
                ? `---\n${frontmatterYaml}\n---\n\n${content}`
                : content,
              metadata: draftOrRecord.metadata || {},
              path: draftOrRecord.path,
              created: draftOrRecord.created_at,
              author: draftOrRecord.author || draftOrRecord.created_by,
            };
          } else {
            // For published records, get raw file content
            record = await recordsService.getRawRecord(id);
          }
        } else {
          // Public users: only get published records via getRawRecord
          record = await recordsService.getRawRecord(id);
        }

        if (!record) {
          const error = new Error('Record not found');
          (error as any).statusCode = 404;
          (error as any).code = 'RECORD_NOT_FOUND';
          throw error;
        }

        logger.info(
          `Raw record ${id} retrieved successfully (${isAuthenticated ? 'authenticated' : 'public'})`,
          {
            recordId: id,
            recordType: record.type,
            recordStatus: record.status,
            requestId: (req as any).requestId,
            userId: (req as any).user?.id,
            userRole: (req as any).user?.role,
            isAuthenticated,
          }
        );

        sendSuccess(record, req, res, { operation });
      } catch (error) {
        handleApiError(operation, error, req, res, 'Failed to get raw record');
      }
    }
  );
}
