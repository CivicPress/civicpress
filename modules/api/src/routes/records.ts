import { Router, Request, Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import { AuthenticatedRequest } from '../middleware/auth';
import { RecordsService } from '../services/records-service';
import path from 'path';

export const recordsRouter = Router();

// Initialize the records service
let recordsService: RecordsService | null = null;

// Middleware to initialize the service
const initializeService = async (req: Request, res: Response, next: any) => {
  if (!recordsService) {
    try {
      const { CivicPress } = await import('@civicpress/core');
      // Use the data directory from environment variable or default
      const dataDir =
        process.env.CIVIC_DATA_DIR || path.resolve(process.cwd(), '../../data');
      const civicPress = new CivicPress();
      await civicPress.getCore().initialize();
      recordsService = new RecordsService(civicPress);
    } catch (error) {
      return res.status(500).json({
        error: {
          message: 'Failed to initialize CivicPress',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
      });
    }
  }
  next();
};

// GET /api/v1/records - List all records
recordsRouter.get(
  '/',
  initializeService,
  async (req: Request, res: Response) => {
    try {
      const { type, status, limit, offset } = req.query;

      const result = await recordsService!.listRecords({
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
  }
);

// GET /api/v1/records/:id - Get a specific record
recordsRouter.get(
  '/:id',
  initializeService,
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
      const { type } = req.query;

      const record = await recordsService!.getRecord(id, type as string);

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
recordsRouter.post(
  '/',
  initializeService,
  body('title').isString().notEmpty(),
  body('type').isString().notEmpty(),
  body('content').optional().isString(),
  body('template').optional().isString(),
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
      const { title, type, content, template, role, metadata } = req.body;
      const userRole = req.user?.apiKey || role || 'unknown';

      const record = await recordsService!.createRecord(
        {
          title,
          type,
          content,
          template,
          role: userRole,
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
recordsRouter.put(
  '/:id',
  initializeService,
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
      const userRole = req.user?.apiKey || 'unknown';

      const record = await recordsService!.updateRecord(id, updates, userRole);

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

// DELETE /api/v1/records/:id - Delete a record
recordsRouter.delete(
  '/:id',
  initializeService,
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
      const userRole = req.user?.apiKey || 'unknown';

      const deleted = await recordsService!.deleteRecord(id, userRole);

      if (!deleted) {
        return res.status(404).json({
          error: {
            message: 'Record not found',
            code: 'RECORD_NOT_FOUND',
          },
        });
      }

      res.json({
        message: `Record ${id} deleted successfully`,
        deletedAt: new Date().toISOString(),
      });
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
