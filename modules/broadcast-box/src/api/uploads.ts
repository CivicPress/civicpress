/**
 * Upload Management API Routes
 *
 * REST API endpoints for Broadcast Box file uploads.
 *
 * These are a device surface: the appliance pushes its own recording. The
 * router is mounted behind `deviceAuthMiddleware` (see registerBroadcastBoxRoutes),
 * so every handler can rely on `req.device` being the authenticated device.
 * Each handler additionally enforces resource ownership — a device may only
 * create/upload/finalize/read uploads for a session it owns — by passing its
 * device id down to the UploadProcessor (which knows each upload's owner).
 */

import { Router, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import type { Logger } from '@civicpress/core';
import multer from 'multer';
import type { UploadProcessor } from '../services/upload-processor.js';
import type { CreateUploadRequest, UploadStatus } from '../types/index.js';
import type { DeviceAuthenticatedRequest } from '../middleware/device-auth.js';

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
    async (req: DeviceAuthenticatedRequest, res: Response) => {
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

        const request: CreateUploadRequest = {
          sessionId: req.body.sessionId,
          fileName: req.body.fileName,
          fileSize: req.body.fileSize,
          fileHash: req.body.fileHash,
          mimeType: req.body.mimeType,
        };

        // Authorization: the device may only create an upload for a session it
        // owns (enforced inside createUpload via the authenticated device id).
        const upload = await uploadProcessor.createUpload(
          request,
          req.device!.deviceId
        );

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

        const statusCode =
          error instanceof Error && error.message.startsWith('Forbidden')
            ? 403
            : 500;

        res.status(statusCode).json({
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
    async (req: DeviceAuthenticatedRequest, res: Response) => {
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

        const chunkNumber = parseInt(req.body.chunkNumber);
        const chunk = req.file.buffer;

        // Authorization: the device may only upload to its own upload job.
        await uploadProcessor.processChunk(
          req.params.id,
          chunk,
          chunkNumber,
          req.device!.deviceId
        );

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
          error instanceof Error && error.message.startsWith('Forbidden')
            ? 403
            : error instanceof Error && error.message.includes('not found')
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
    async (req: DeviceAuthenticatedRequest, res: Response) => {
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

        // Authorization: the device may only finalize its own upload job.
        const storageLocation = await uploadProcessor.finalizeUpload(
          req.params.id,
          req.device!.deviceId
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
          error instanceof Error && error.message.startsWith('Forbidden')
            ? 403
            : error instanceof Error && error.message.includes('not found')
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
    async (req: DeviceAuthenticatedRequest, res: Response) => {
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

        const upload = await uploadProcessor.getUpload(req.params.id);

        if (!upload) {
          return res.status(404).json({
            success: false,
            error: {
              message: 'Upload not found',
            },
          });
        }

        // Authorization: a device may only read its own upload job.
        if (upload.deviceId !== req.device!.deviceId) {
          return res.status(403).json({
            success: false,
            error: {
              message: 'Forbidden: device does not own this upload',
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
   * List uploads (scoped to the authenticated device)
   */
  router.get(
    '/',
    [
      query('sessionId').optional().isUUID(),
      query('status').optional().isString(),
      query('limit').optional().isInt({ min: 1, max: 100 }),
      query('offset').optional().isInt({ min: 0 }),
    ],
    async (req: DeviceAuthenticatedRequest, res: Response) => {
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

        const filters = {
          sessionId: req.query.sessionId as string | undefined,
          // A device only ever sees its own uploads: the authenticated device
          // scopes the list, so any client-supplied deviceId filter is ignored.
          deviceId: req.device!.deviceId,
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
