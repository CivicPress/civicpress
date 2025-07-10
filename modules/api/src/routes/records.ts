import { Router, Request, Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import {
  AuthenticatedRequest,
  jwtAuth,
  requirePermission,
} from '../middleware/jwt-auth';
import { RecordsService } from '../services/records-service';

export function createRecordsRouter(recordsService: RecordsService) {
  const router = Router();

  // GET /api/v1/records - List all records
  router.get('/', async (req: Request, res: Response) => {
    try {
      const { type, status, limit, offset } = req.query;

      const result = await recordsService.listRecords({
        type: type as string,
        status: status as string,
        limit: limit ? parseInt(limit as string) : undefined,
        offset: offset ? parseInt(offset as string) : undefined,
      });

      res.json(result);
    } catch (error) {
      res.status(500).json({
        error: {
          message: 'Failed to list records',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
      });
    }
  });

  // GET /api/v1/records/:id - Get a specific record
  router.get(
    '/:id',
    param('id').isString().notEmpty(),
    async (req: Request, res: Response) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: {
            message: 'Invalid record ID',
            details: errors.array(),
          },
        });
      }

      try {
        const { id } = req.params;

        const record = await recordsService.getRecord(id);

        if (!record) {
          return res.status(404).json({
            error: {
              message: 'Record not found',
              code: 'RECORD_NOT_FOUND',
            },
          });
        }

        res.json(record);
      } catch (error) {
        res.status(500).json({
          error: {
            message: 'Failed to retrieve record',
            details: error instanceof Error ? error.message : 'Unknown error',
          },
        });
      }
    }
  );

  // POST /api/v1/records - Create a new record
  router.post(
    '/',
    jwtAuth,
    requirePermission('write'),
    body('title').isString().notEmpty(),
    body('type').isString().notEmpty(),
    body('content').optional().isString(),
    body('role').optional().isString(),
    body('metadata').optional().isObject(),
    async (req: AuthenticatedRequest, res: Response) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: {
            message: 'Invalid record data',
            details: errors.array(),
          },
        });
      }

      try {
        const { title, type, content, role, metadata } = req.body;
        const userRole = req.user?.role || role || 'unknown';

        const record = await recordsService.createRecord(
          {
            title,
            type,
            content,
            metadata,
          },
          userRole
        );

        res.status(201).json(record);
      } catch (error) {
        res.status(500).json({
          error: {
            message: 'Failed to create record',
            details: error instanceof Error ? error.message : 'Unknown error',
          },
        });
      }
    }
  );

  // PUT /api/v1/records/:id - Update a record
  router.put(
    '/:id',
    jwtAuth,
    requirePermission('write'),
    param('id').isString().notEmpty(),
    body('title').optional().isString(),
    body('content').optional().isString(),
    body('status').optional().isString(),
    body('metadata').optional().isObject(),
    async (req: AuthenticatedRequest, res: Response) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: {
            message: 'Invalid update data',
            details: errors.array(),
          },
        });
      }

      try {
        const { id } = req.params;
        const updates = req.body;
        const userRole = req.user?.role || 'unknown';

        const record = await recordsService.updateRecord(id, updates, userRole);

        if (!record) {
          return res.status(404).json({
            error: {
              message: 'Record not found',
              code: 'RECORD_NOT_FOUND',
            },
          });
        }

        res.json(record);
      } catch (error) {
        res.status(500).json({
          error: {
            message: 'Failed to update record',
            details: error instanceof Error ? error.message : 'Unknown error',
          },
        });
      }
    }
  );

  // DELETE /api/v1/records/:id - Archive a record
  router.delete(
    '/:id',
    jwtAuth,
    requirePermission('write'),
    param('id').isString().notEmpty(),
    async (req: AuthenticatedRequest, res: Response) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: {
            message: 'Invalid record ID',
            details: errors.array(),
          },
        });
      }

      try {
        const { id } = req.params;
        const userRole = req.user?.role || 'unknown';

        // First check if record exists
        const existingRecord = await recordsService.getRecord(id);
        if (!existingRecord) {
          return res.status(404).json({
            error: {
              message: 'Record not found',
              code: 'RECORD_NOT_FOUND',
            },
          });
        }

        const result = await recordsService.deleteRecord(id, userRole);

        if (result) {
          res.json({
            message: `Record ${id} archived successfully`,
            archivedAt: new Date().toISOString(),
            archiveLocation: `archive/${existingRecord.type}/${id}.md`,
            note: 'Record has been moved to archive and is no longer active',
          });
        } else {
          res.status(500).json({
            error: {
              message: 'Failed to delete record',
              details: 'Archive operation failed',
            },
          });
        }
      } catch (error) {
        res.status(500).json({
          error: {
            message: 'Failed to delete record',
            details: error instanceof Error ? error.message : 'Unknown error',
          },
        });
      }
    }
  );

  return router;
}
