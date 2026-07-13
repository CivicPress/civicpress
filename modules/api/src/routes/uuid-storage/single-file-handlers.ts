import { Router, Response, NextFunction } from 'express';
import { body, param, validationResult } from 'express-validator';
import { AuthenticatedRequest } from '../../middleware/auth.js';
import { requireStoragePermission } from '../../middleware/auth.js';
import {
  handleStorageSuccess,
  handleStorageError,
  handleStorageValidationError,
} from '../../handlers/storage-handlers.js';
import { logApiRequest } from '../../utils/api-logger.js';
import {
  upload,
  getStorageService,
  getStorageConfigManager,
  checkFileAccess,
} from './handlers-common.js';

export function registerSingleFileRoutes(router: Router): void {
  // POST /api/v1/storage/files - Upload file (unified endpoint)
  router.post(
    '/files',
    requireStoragePermission('upload'),
    upload.single('file'),
    body('folder').isString().notEmpty(),
    body('description').optional().isString(),
    (error: Error, req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      if (error) {
        return handleStorageError(
          'upload_file',
          new Error(`Invalid file type: ${error.message}`),
          req,
          res,
          400
        );
      }
      next();
    },
    async (req: AuthenticatedRequest, res: Response) => {
      logApiRequest(req, { operation: 'upload_file', folder: req.body.folder });

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return handleStorageValidationError(
          'upload_file',
          errors.array(),
          req,
          res
        );
      }

      if (!req.file) {
        return handleStorageError(
          'upload_file',
          new Error('No file provided'),
          req,
          res
        );
      }

      try {
        const storageService = await getStorageService(req);
        const folderName = req.body.folder;
        const description = req.body.description;
        const userId = req.user?.id?.toString();

        const result = await storageService.uploadFile({
          file: req.file,
          folder: folderName,
          description,
          uploaded_by: userId,
        });

        if (result.success && result.file) {
          return handleStorageSuccess(
            'upload_file',
            {
              id: result.file.id,
              original_name: result.file.original_name,
              path: result.file.relative_path,
              size: result.file.size,
              mime_type: result.file.mime_type,
              url: `/api/v1/storage/files/${result.file.id}`,
              folder: result.file.folder,
              description: result.file.description,
              created_at: result.file.created_at,
            },
            req,
            res
          );
        } else {
          // Determine status code based on error message
          const errorMessage = result.error || 'Upload failed';
          let statusCode: number | undefined;

          // Check if error is about file size
          if (
            errorMessage.toLowerCase().includes('size') ||
            errorMessage.toLowerCase().includes('limit') ||
            errorMessage.toLowerCase().includes('exceeds')
          ) {
            statusCode = 413; // Payload Too Large
          } else if (
            errorMessage.toLowerCase().includes('type') ||
            errorMessage.toLowerCase().includes('format') ||
            errorMessage.toLowerCase().includes('invalid')
          ) {
            statusCode = 400; // Bad Request
          }

          return handleStorageError(
            'upload_file',
            new Error(errorMessage),
            req,
            res,
            statusCode
          );
        }
      } catch (error: unknown) {
        return handleStorageError('upload_file', error, req, res);
      }
    }
  );

  // GET /api/v1/storage/files/:id/info - Get file information by UUID
  // NOTE: This route must come BEFORE /files/:id to avoid route conflicts
  router.get(
    '/files/:id/info',
    [param('id').isUUID()],
    async (req: AuthenticatedRequest, res: Response) => {
      logApiRequest(req, {
        operation: 'get_file_info',
        file_id: req.params.id,
      });

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return handleStorageValidationError(
          'get_file_info',
          errors.array(),
          req,
          res
        );
      }

      try {
        const storageService = await getStorageService(req);
        const fileId = req.params.id;

        const fileInfo = await storageService.getFileById(fileId);
        if (!fileInfo) {
          return handleStorageError(
            'get_file_info',
            new Error(`File with ID '${fileId}' not found`),
            req,
            res,
            404
          );
        }

        const configManager = getStorageConfigManager(req);
        let config;
        try {
          config = await configManager.loadConfig();
        } catch (error: unknown) {
          // If config file doesn't exist, use default config
          const errMessage =
            error instanceof Error ? error.message : String(error);
          if (
            errMessage.includes('not found') ||
            errMessage.includes('Storage configuration not found')
          ) {
            config = configManager.getDefaultConfig();
          } else {
            throw error;
          }
        }
        const folderConfig = config.folders?.[fileInfo.folder];
        // FA-STOR-002: same three-tier gate as download — /info leaks file
        // metadata (name, size, path) so it must honor the private tier too.
        const access = await checkFileAccess(folderConfig?.access, req.user);
        if (!access.ok) {
          res.status(access.status ?? 403).json({
            success: false,
            error: {
              message: access.message,
              code: access.code,
              ...(access.required ? { required: access.required } : {}),
            },
          });
          return;
        }

        return handleStorageSuccess(
          'get_file_info',
          {
            id: fileInfo.id,
            original_name: fileInfo.original_name,
            stored_filename: fileInfo.stored_filename,
            folder: fileInfo.folder,
            relative_path: fileInfo.relative_path,
            size: fileInfo.size,
            mime_type: fileInfo.mime_type,
            description: fileInfo.description,
            uploaded_by: fileInfo.uploaded_by,
            created_at: fileInfo.created_at,
            updated_at: fileInfo.updated_at,
          },
          req,
          res
        );
      } catch (error: unknown) {
        return handleStorageError('get_file_info', error, req, res);
      }
    }
  );

  // GET /api/v1/storage/files/:id - Download file by UUID
  // NOTE: This route must come AFTER /files/:id/info to avoid route conflicts
  router.get(
    '/files/:id',
    [param('id').isUUID()],
    async (req: AuthenticatedRequest, res: Response) => {
      logApiRequest(req, {
        operation: 'download_file',
        file_id: req.params.id,
      });

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return handleStorageValidationError(
          'download_file',
          errors.array(),
          req,
          res
        );
      }

      try {
        const storageService = await getStorageService(req);
        const fileId = req.params.id;

        const fileInfo = await storageService.getFileById(fileId);
        if (!fileInfo) {
          return handleStorageError(
            'download_file',
            new Error(`File with ID '${fileId}' not found`),
            req,
            res,
            404
          );
        }

        const configManager = getStorageConfigManager(req);
        let config;
        try {
          config = await configManager.loadConfig();
        } catch (error: unknown) {
          // If config file doesn't exist, use default config
          const errMessage =
            error instanceof Error ? error.message : String(error);
          if (
            errMessage.includes('not found') ||
            errMessage.includes('Storage configuration not found')
          ) {
            config = configManager.getDefaultConfig();
          } else {
            throw error;
          }
        }
        const folderConfig = config.folders?.[fileInfo.folder];
        // FA-STOR-002: three-tier gate (public / authenticated / private).
        const access = await checkFileAccess(folderConfig?.access, req.user);
        if (!access.ok) {
          res.status(access.status ?? 403).json({
            success: false,
            error: {
              message: access.message,
              code: access.code,
              ...(access.required ? { required: access.required } : {}),
            },
          });
          return;
        }

        // FA-BB-002 (Commit D): STREAM the file with HTTP Range support. The
        // prior whole-file Buffer path could not serve a multi-hour redacted
        // recording (>2GB Buffer ceiling, no seek); video players need 206s.
        const totalSize = fileInfo.size;
        const rangeHeader = req.headers.range;
        let start = 0;
        let end = totalSize - 1;
        let isPartial = false;

        if (rangeHeader) {
          // Single-range form only: "bytes=start-end" / "bytes=start-" /
          // "bytes=-suffix". Anything unsatisfiable → 416 per RFC 9110.
          const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
          const rawStart = match?.[1] ?? '';
          const rawEnd = match?.[2] ?? '';
          if (!match || (rawStart === '' && rawEnd === '')) {
            res
              .status(416)
              .setHeader('Content-Range', `bytes */${totalSize}`)
              .end();
            return;
          }
          if (rawStart === '') {
            // Suffix range: the last N bytes.
            const suffix = Math.min(Number(rawEnd), totalSize);
            start = totalSize - suffix;
            end = totalSize - 1;
          } else {
            start = Number(rawStart);
            end = rawEnd === '' ? totalSize - 1 : Math.min(Number(rawEnd), totalSize - 1);
          }
          if (start > end || start >= totalSize) {
            res
              .status(416)
              .setHeader('Content-Range', `bytes */${totalSize}`)
              .end();
            return;
          }
          isPartial = true;
        }

        const stream = await storageService.downloadFileStream(
          fileId,
          isPartial ? { start, end } : undefined
        );
        if (!stream) {
          return handleStorageError(
            'download_file',
            new Error(`File content not found for ID '${fileId}'`),
            req,
            res,
            404
          );
        }

        // Media plays inline (the UI's <video>/<audio> src points here);
        // everything else stays a download.
        const disposition = /^(video|audio)\//.test(fileInfo.mime_type)
          ? 'inline'
          : 'attachment';
        res.setHeader('Content-Type', fileInfo.mime_type);
        res.setHeader(
          'Content-Disposition',
          `${disposition}; filename="${fileInfo.original_name}"`
        );
        res.setHeader('Accept-Ranges', 'bytes');
        if (isPartial) {
          res.status(206);
          res.setHeader('Content-Range', `bytes ${start}-${end}/${totalSize}`);
          res.setHeader('Content-Length', String(end - start + 1));
        } else {
          res.setHeader('Content-Length', String(totalSize));
        }

        stream.on('error', (error: Error) => {
          if (!res.headersSent) {
            handleStorageError('download_file', error, req, res);
          } else {
            res.destroy(error);
          }
        });
        // A client abort must tear the source stream down (else a seek-happy
        // player leaks one open file descriptor per abandoned request).
        res.on('close', () => {
          stream.destroy();
        });
        stream.pipe(res);
      } catch (error: unknown) {
        return handleStorageError('download_file', error, req, res);
      }
    }
  );

  // DELETE /api/v1/storage/files/:id - Delete file by UUID
  router.delete(
    '/files/:id',
    requireStoragePermission('delete'),
    [param('id').isUUID()],
    async (req: AuthenticatedRequest, res: Response) => {
      logApiRequest(req, {
        operation: 'delete_file',
        file_id: req.params.id,
      });

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return handleStorageValidationError(
          'delete_file',
          errors.array(),
          req,
          res
        );
      }

      try {
        const storageService = await getStorageService(req);
        const fileId = req.params.id;
        const userId = req.user?.id?.toString();

        const success = await storageService.deleteFile(fileId, userId);

        if (success) {
          return handleStorageSuccess(
            'delete_file',
            { message: 'File deleted successfully', id: fileId },
            req,
            res
          );
        } else {
          return handleStorageError(
            'delete_file',
            new Error('Failed to delete file or file not found'),
            req,
            res,
            404
          );
        }
      } catch (error: unknown) {
        return handleStorageError('delete_file', error, req, res);
      }
    }
  );

  // PUT /api/v1/storage/files/:id - Update file metadata
  router.put(
    '/files/:id',
    requireStoragePermission('manage'),
    [param('id').isUUID(), body('description').optional().isString()],
    async (req: AuthenticatedRequest, res: Response) => {
      logApiRequest(req, {
        operation: 'update_file',
        file_id: req.params.id,
      });

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return handleStorageValidationError(
          'update_file',
          errors.array(),
          req,
          res
        );
      }

      try {
        const storageService = await getStorageService(req);
        const fileId = req.params.id;
        const userId = req.user?.id?.toString();

        const success = await storageService.updateFile(fileId, {
          description: req.body.description,
          updated_by: userId,
        });

        if (success) {
          const updatedFile = await storageService.getFileById(fileId);
          return handleStorageSuccess(
            'update_file',
            { message: 'File updated successfully', file: updatedFile },
            req,
            res
          );
        } else {
          return handleStorageError(
            'update_file',
            new Error('Failed to update file or file not found'),
            req,
            res,
            404
          );
        }
      } catch (error: unknown) {
        return handleStorageError('update_file', error, req, res);
      }
    }
  );
}
