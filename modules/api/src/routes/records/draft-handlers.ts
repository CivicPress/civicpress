import { Router, Response } from 'express';
import { HttpError } from '../../utils/http-error.js';
import { body, param, validationResult } from 'express-validator';
import {
  AuthenticatedRequest,
  requireRecordPermission,
  authMiddleware,
} from '../../middleware/auth.js';
import { RecordsService } from '../../services/records-service.js';
import { userCan } from '@civicpress/core';
import {
  sendSuccess,
  handleApiError,
  logApiRequest,
} from '../../utils/api-logger.js';
import {
  logger,
  audit,
  handleRecordsValidationError,
} from './handlers-common.js';

export function registerDraftRoutes(
  router: Router,
  recordsService: RecordsService
): void {
  // GET /api/records/drafts - Get draft records (authenticated only)
  // NOTE: This must come BEFORE /:id route to avoid matching "drafts" as an ID
  // If user has records:edit permission, shows ALL drafts. Otherwise, shows only user's drafts.
  router.get(
    '/drafts',
    authMiddleware(recordsService.getCivicPress()),
    requireRecordPermission('view'),
    async (req: AuthenticatedRequest, res: Response) => {
      logApiRequest(req, { operation: 'list_drafts' });

      try {
        const { type, limit, offset } = req.query;

        // Check if user has records:edit permission (can see all drafts)
        const canEdit = await userCan(req.user!, 'records:edit');

        logger.info('Listing drafts', {
          type,
          limit,
          offset,
          requestId: req.requestId,
          userId: req.user?.id,
          userRole: req.user?.role,
          showAllDrafts: canEdit,
        });

        // List drafts from record_drafts table
        // Only filter by user if they don't have edit permission
        const userId = req.user?.id?.toString() || req.user?.username;
        const result = await recordsService.listDrafts({
          type: type as string,
          created_by: canEdit ? undefined : userId, // Show all drafts if user can edit, otherwise filter by user
          limit: limit ? parseInt(limit as string) : undefined,
          offset: offset ? parseInt(offset as string) : undefined,
        });

        logger.info('Drafts listed successfully', {
          totalRecords: result.drafts?.length || 0,
          requestId: req.requestId,
          userId: req.user?.id,
          userRole: req.user?.role,
          showAllDrafts: canEdit,
        });

        sendSuccess(result, req, res, { operation: 'list_drafts' });
      } catch (error) {
        handleApiError('list_drafts', error, req, res, 'Failed to list drafts');
      }
    }
  );

  // DELETE /api/v1/records/:id/draft - Delete draft (authenticated only)
  router.delete(
    '/:id/draft',
    authMiddleware(recordsService.getCivicPress()),
    requireRecordPermission('edit'),
    param('id').isString().notEmpty(),
    async (req: AuthenticatedRequest, res: Response) => {
      logApiRequest(req, { operation: 'delete_draft' });

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return handleRecordsValidationError(
          'delete_draft',
          errors.array(),
          req,
          res
        );
      }

      try {
        const { id } = req.params;
        const user = req.user;

        if (!user) {
          throw new HttpError(401, 'User authentication required');
        }

        // Check if draft exists and belongs to user
        const draft = await recordsService.getDraftOrRecord(id, user);
        if (!draft || !draft.isDraft) {
          throw new HttpError(404, 'Draft not found', 'DRAFT_NOT_FOUND');
        }

        // Verify ownership (optional - can be removed if admins should delete any draft)
        if (
          draft.created_by !== user.id?.toString() &&
          draft.created_by !== user.username
        ) {
          throw new HttpError(403, 
            'Permission denied: You can only delete your own drafts'
          );
        }

        // Delete draft
        await recordsService.deleteDraft(id);

        sendSuccess({ message: 'Draft deleted successfully', id }, req, res, {
          operation: 'delete_draft',
        });
        await audit.log({
          source: 'api',
          actor: {
            id: user.id,
            username: (user as any).username,
            role: user.role,
          },
          action: 'records:delete_draft',
          target: { type: 'draft', id },
          outcome: 'success',
        });
      } catch (error) {
        const user = req.user;
        const id = req.params?.id;
        await audit.log({
          source: 'api',
          actor: { id: user?.id, username: user?.username, role: user?.role },
          action: 'records:delete_draft',
          target: { type: 'draft', id },
          outcome: 'failure',
          message: String(error),
        });
        handleApiError(
          'delete_draft',
          error,
          req,
          res,
          'Failed to delete draft'
        );
      }
    }
  );

  // PUT /api/v1/records/:id/draft - Save draft (authenticated only)
  router.put(
    '/:id/draft',
    authMiddleware(recordsService.getCivicPress()),
    requireRecordPermission('edit'),
    param('id').isString().notEmpty(),
    body('title').optional().isString(),
    body('markdownBody').optional().isString(),
    body('status').optional().isString(), // Legal status (stored in YAML + DB)
    body('workflowState').optional().isString(), // Internal editorial status (DB-only, never in YAML)
    body('metadata').optional().isObject(),
    body('geography').optional().isObject(),
    body('attachedFiles').optional().isArray(),
    body('linkedRecords').optional().isArray(),
    body('linkedGeographyFiles').optional().isArray(),
    async (req: AuthenticatedRequest, res: Response) => {
      logApiRequest(req, { operation: 'save_draft' });

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return handleRecordsValidationError(
          'save_draft',
          errors.array(),
          req,
          res
        );
      }

      try {
        const { id } = req.params;
        const updates = req.body;
        const user = req.user;

        if (!user) {
          throw new HttpError(401, 'User authentication required');
        }

        // Check if draft exists, update it; otherwise create it
        const existingDraft = await recordsService.getDraftOrRecord(id, user);
        let draft;

        if (existingDraft?.isDraft) {
          // Update existing draft
          draft = await recordsService.updateDraft(id, updates, user);
        } else {
          // Create new draft (if record exists, we'll create a draft from it)
          // For now, we'll require the full data for creation
          if (!updates.title || !updates.type) {
            throw new HttpError(400, 
              'Title and type are required for new drafts'
            );
          }
          draft = await recordsService.createDraft(
            {
              title: updates.title,
              type: updates.type,
              status: updates.status,
              workflowState: updates.workflowState, // Internal editorial status (DB-only, never in YAML)
              markdownBody: updates.markdownBody,
              metadata: updates.metadata,
              geography: updates.geography,
              attachedFiles: updates.attachedFiles,
              linkedRecords: updates.linkedRecords,
              linkedGeographyFiles: updates.linkedGeographyFiles,
            },
            user,
            id // Use the ID from URL
          );
        }

        sendSuccess(draft, req, res, { operation: 'save_draft' });
        await audit.log({
          source: 'api',
          actor: {
            id: user.id,
            username: (user as any).username,
            role: user.role,
          },
          action: 'records:save_draft',
          target: { type: 'record', id },
          outcome: 'success',
        });
      } catch (error) {
        const user = req.user;
        const id = req.params?.id;
        await audit.log({
          source: 'api',
          actor: { id: user?.id, username: user?.username, role: user?.role },
          action: 'records:save_draft',
          target: { type: 'record', id },
          outcome: 'failure',
          message: String(error),
        });
        handleApiError('save_draft', error, req, res, 'Failed to save draft');
      }
    }
  );

  // POST /api/v1/records/:id/publish - Publish draft (authenticated only)
  router.post(
    '/:id/publish',
    authMiddleware(recordsService.getCivicPress()),
    requireRecordPermission('edit'),
    param('id').isString().notEmpty(),
    body('status').optional().isString(),
    async (req: AuthenticatedRequest, res: Response) => {
      logApiRequest(req, { operation: 'publish_record' });

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return handleRecordsValidationError(
          'publish_record',
          errors.array(),
          req,
          res
        );
      }

      try {
        const { id } = req.params;
        const { status } = req.body;
        const user = req.user;

        if (!user) {
          throw new HttpError(401, 'User authentication required');
        }

        const record = await recordsService.publishDraft(id, user, status);

        sendSuccess(record, req, res, {
          operation: 'publish_record',
          statusCode: 201,
        });
        await audit.log({
          source: 'api',
          actor: {
            id: user.id,
            username: (user as any).username,
            role: user.role,
          },
          action: 'records:publish',
          target: { type: 'record', id },
          outcome: 'success',
        });
      } catch (error) {
        const user = req.user;
        const id = req.params?.id;
        await audit.log({
          source: 'api',
          actor: { id: user?.id, username: user?.username, role: user?.role },
          action: 'records:publish',
          target: { type: 'record', id },
          outcome: 'failure',
          message: String(error),
        });
        handleApiError(
          'publish_record',
          error,
          req,
          res,
          'Failed to publish record'
        );
      }
    }
  );
}
