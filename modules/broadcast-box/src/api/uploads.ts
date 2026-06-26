/**
 * Upload Management API Routes
 *
 * REST API endpoints for Broadcast Box file uploads
 */

import { Router, Response, Request } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import type { Logger } from '@civicpress/core';
import multer from 'multer';
import type { UploadProcessor } from '../services/upload-processor.js';
import type { CreateUploadRequest, UploadStatus } from '../types/index.js';

// Type for authenticated requests
interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    username: string;
    role: string;
  };
}

// Configure multer for chunk uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB per chunk
  },
});

export function createUploadsRouter(
  uploadProcessor: UploadProcessor,
  logger: Logger
): Router {
  const router = Router();

  /**
   * POST /api/v1/broadcast-box/uploads
   * Create a new upload job
   */
  router.post(
    '/',
    [
      body('sessionId').isUUID().withMessage('Session ID must be a valid UUID'),
      body('fileName')
        .isString()
        .notEmpty()
        .withMessage('File name is required'),
      body('fileSize')
        .isInt({ min: 1 })
        .withMessage('File size must be a positive integer'),
      body('fileHash')
        .isString()
        .notEmpty()
        .withMessage('File hash is required'),
      body('mimeType')
        .isString()
        .notEmpty()
        .withMessage('MIME type is required'),
    ],
    // TODO: Add authMiddleware
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({
            success: false,
            error: {
              message: 'Validation failed',
              details: errors.array(),
            },
          });
        }

        // Check permissions
        // TODO: Add permission check for broadcast-box:uploads:create

        const request: CreateUploadRequest = {
          sessionId: req.body.sessionId,
          fileName: req.body.fileName,
          fileSize: req.body.fileSize,
          fileHash: req.body.fileHash,
          mimeType: req.body.mimeType,
        };

        const upload = await uploadProcessor.createUpload(request);

        res.status(201).json({
          success: true,
          upload,
          uploadUrl: `/api/v1/broadcast-box/uploads/${upload.id}/chunks`,
        });
      } catch (error) {
        logger.error('Error creating upload', {
          operation: 'broadcast-box:api:uploads:create',
          error: error instanceof Error ? error.message : String(error),
        });

        res.status(500).json({
          success: false,
          error: {
            message:
              error instanceof Error
                ? error.message
                : 'Failed to create upload',
          },
        });
      }
    }
  );

  /**
   * POST /api/v1/broadcast-box/uploads/:id/chunks
   * Upload a chunk
   */
  router.post(
    '/:id/chunks',
    // multer MUST run before the body validators — it parses the multipart form,
    // so `chunkNumber` (a text field) isn't on req.body until after this.
    upload.single('chunk'),
    [
      param('id').isUUID().withMessage('Upload ID must be a valid UUID'),
      body('chunkNumber')
        .isInt({ min: 0 })
        .withMessage('Chunk number must be a non-negative integer'),
    ],
    // TODO: Add authMiddleware
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({
            success: false,
            error: {
              message: 'Validation failed',
              details: errors.array(),
            },
          });
        }

        if (!req.file) {
          return res.status(400).json({
            success: false,
            error: {
              message: 'Chunk file is required',
            },
          });
        }

        // Check permissions
        // TODO: Add permission check for broadcast-box:uploads:upload

        const chunkNumber = parseInt(req.body.chunkNumber);
        const chunk = req.file.buffer;

        await uploadProcessor.processChunk(req.params.id, chunk, chunkNumber);

        res.json({
          success: true,
          message: 'Chunk uploaded successfully',
        });
      } catch (error) {
        logger.error('Error uploading chunk', {
          operation: 'broadcast-box:api:uploads:chunk',
          uploadId: req.params.id,
          error: error instanceof Error ? error.message : String(error),
        });

        const statusCode =
          error instanceof Error && error.message.includes('not found')
            ? 404
            : error instanceof Error &&
                (error.message.includes('already complete') ||
                  error.message.includes('has failed'))
              ? 409
              : 500;

        res.status(statusCode).json({
          success: false,
          error: {
            message:
              error instanceof Error ? error.message : 'Failed to upload chunk',
          },
        });
      }
    }
  );

  /**
   * POST /api/v1/broadcast-box/uploads/:id/finalize
   * Finalize upload (combine chunks and store)
   */
  router.post(
    '/:id/finalize',
    [param('id').isUUID().withMessage('Upload ID must be a valid UUID')],
    // TODO: Add authMiddleware
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({
            success: false,
            error: {
              message: 'Validation failed',
              details: errors.array(),
            },
          });
        }

        // Check permissions
        // TODO: Add permission check for broadcast-box:uploads:finalize

        const storageLocation = await uploadProcessor.finalizeUpload(
          req.params.id
        );

        res.json({
          success: true,
          storageLocation,
          message: 'Upload finalized successfully',
        });
      } catch (error) {
        logger.error('Error finalizing upload', {
          operation: 'broadcast-box:api:uploads:finalize',
          uploadId: req.params.id,
          error: error instanceof Error ? error.message : String(error),
        });

        const statusCode =
          error instanceof Error && error.message.includes('not found')
            ? 404
            : error instanceof Error &&
                error.message.includes('not in uploading')
              ? 409
              : 500;

        res.status(statusCode).json({
          success: false,
          error: {
            message:
              error instanceof Error
                ? error.message
                : 'Failed to finalize upload',
          },
        });
      }
    }
  );

  /**
   * GET /api/v1/broadcast-box/uploads/:id
   * Get upload status
   */
  router.get(
    '/:id',
    [param('id').isUUID().withMessage('Upload ID must be a valid UUID')],
    // TODO: Add authMiddleware
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({
            success: false,
            error: {
              message: 'Validation failed',
              details: errors.array(),
            },
          });
        }

        // Check permissions
        // TODO: Add permission check for broadcast-box:uploads:view

        const upload = await uploadProcessor.getUpload(req.params.id);

        if (!upload) {
          return res.status(404).json({
            success: false,
            error: {
              message: 'Upload not found',
            },
          });
        }

        res.json({
          success: true,
          upload,
        });
      } catch (error) {
        logger.error('Error getting upload', {
          operation: 'broadcast-box:api:uploads:get',
          uploadId: req.params.id,
          error: error instanceof Error ? error.message : String(error),
        });
        res.status(500).json({
          success: false,
          error: {
            message: 'Failed to get upload',
          },
        });
      }
    }
  );

  /**
   * GET /api/v1/broadcast-box/uploads
   * List uploads with filters
   */
  router.get(
    '/',
    [
      query('sessionId').optional().isUUID(),
      query('deviceId').optional().isUUID(),
      query('status').optional().isString(),
      query('limit').optional().isInt({ min: 1, max: 100 }),
      query('offset').optional().isInt({ min: 0 }),
    ],
    // TODO: Add authMiddleware
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({
            success: false,
            error: {
              message: 'Validation failed',
              details: errors.array(),
            },
          });
        }

        // Check permissions
        // TODO: Add permission check for broadcast-box:uploads:list

        const filters = {
          sessionId: req.query.sessionId as string | undefined,
          deviceId: req.query.deviceId as string | undefined,
          status:
            (req.query.status as UploadStatus | undefined) &&
            [
              'pending',
              'uploading',
              'processing',
              'complete',
              'failed',
            ].includes(req.query.status as string)
              ? (req.query.status as UploadStatus)
              : undefined,
          limit: req.query.limit
            ? parseInt(req.query.limit as string)
            : undefined,
          offset: req.query.offset
            ? parseInt(req.query.offset as string)
            : undefined,
        };

        const uploads = await uploadProcessor.listUploads(filters);

        res.json({
          success: true,
          uploads,
        });
      } catch (error) {
        logger.error('Error listing uploads', {
          operation: 'broadcast-box:api:uploads:list',
          error: error instanceof Error ? error.message : String(error),
        });
        res.status(500).json({
          success: false,
          error: {
            message: 'Failed to list uploads',
          },
        });
      }
    }
  );

  return router;
}
