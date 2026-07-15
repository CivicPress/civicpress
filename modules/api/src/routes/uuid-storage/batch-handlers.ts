import { Router, Response } from 'express';
import fs from 'fs';
import { body, validationResult } from 'express-validator';
import { type MulterFile } from '@civicpress/storage';
import { AuthenticatedRequest } from '../../middleware/auth.js';
import { requireStoragePermission } from '../../middleware/auth.js';
import {
  handleStorageSuccess,
  handleStorageError,
  handleStorageValidationError,
} from '../../handlers/storage-handlers.js';
import { logApiRequest } from '../../utils/api-logger.js';
import { Buffer } from 'node:buffer';
import { upload, getStorageService } from './handlers-common.js';

export function registerBatchRoutes(router: Router): void {
  // POST /api/v1/storage/files/batch - Batch upload files
  router.post(
    '/files/batch',
    requireStoragePermission('upload'),
    upload.array('files', 50), // Max 50 files
    body('folder').isString().notEmpty(),
    async (req: AuthenticatedRequest, res: Response) => {
      logApiRequest(req, {
        operation: 'batch_upload',
        file_count: Array.isArray(req.files) ? req.files.length : 0,
      });

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return handleStorageValidationError(
          'batch_upload',
          errors.array(),
          req,
          res
        );
      }

      try {
        const storageService = await getStorageService(req);
        // Type assertion for multer files array - multer provides Express.Multer.File[] type
        const files: Express.Multer.File[] = Array.isArray(req.files)
          ? req.files
          : [];
        const folder = req.body.folder as string;
        const userId = req.user?.id?.toString();

        if (files.length === 0) {
          return handleStorageValidationError(
            'batch_upload',
            [{ msg: 'No files provided', param: 'files' }],
            req,
            res
          );
        }

        // Convert multer files to MulterFile format
        const multerFiles: MulterFile[] = files.map((file) => ({
          fieldname: file.fieldname,
          originalname: file.originalname,
          encoding: file.encoding,
          mimetype: file.mimetype,
          size: file.size,
          destination: file.destination || '',
          filename: file.filename || file.originalname,
          path: file.path || '',
          buffer: file.buffer || Buffer.alloc(0), // Ensure buffer is always defined
        }));

        const result = await storageService.batchUpload(
          {
            files: multerFiles,
            folder,
            uploaded_by: userId,
          },
          {
            maxConcurrency: 5, // Configurable later
          }
        );

        return handleStorageSuccess(
          'batch_upload',
          {
            successful: result.successful,
            failed: result.failed,
            total: result.total,
            successfulCount: result.successfulCount,
            failedCount: result.failedCount,
          },
          req,
          res
        );
      } catch (error: unknown) {
        return handleStorageError('batch_upload', error, req, res);
      } finally {
        // FA-API-016: remove all multer temp files (success or failure).
        const uploaded = Array.isArray(req.files) ? req.files : [];
        await Promise.all(
          uploaded.map((f) =>
            f?.path
              ? fs.promises.unlink(f.path).catch(() => {
                  // best-effort; OS temp dir is reaped anyway
                })
              : Promise.resolve()
          )
        );
      }
    }
  );

  // DELETE /api/v1/storage/files/batch - Batch delete files
  router.delete(
    '/files/batch',
    requireStoragePermission('delete'),
    body('fileIds')
      .isArray({ min: 1, max: 100 })
      .withMessage('fileIds must be an array with 1-100 items'),
    body('fileIds.*').isUUID().withMessage('Each fileId must be a valid UUID'),
    async (req: AuthenticatedRequest, res: Response) => {
      logApiRequest(req, {
        operation: 'batch_delete',
        file_count: (req.body.fileIds as string[])?.length || 0,
      });

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return handleStorageValidationError(
          'batch_delete',
          errors.array(),
          req,
          res
        );
      }

      try {
        const storageService = await getStorageService(req);
        const fileIds = req.body.fileIds as string[];
        const userId = req.user?.id?.toString();

        const result = await storageService.batchDelete(
          {
            fileIds,
            userId,
          },
          {
            maxConcurrency: 10, // Configurable later
          }
        );

        return handleStorageSuccess(
          'batch_delete',
          {
            successful: result.successful,
            failed: result.failed,
            total: result.total,
            successfulCount: result.successfulCount,
            failedCount: result.failedCount,
          },
          req,
          res
        );
      } catch (error: unknown) {
        return handleStorageError('batch_delete', error, req, res);
      }
    }
  );
}
