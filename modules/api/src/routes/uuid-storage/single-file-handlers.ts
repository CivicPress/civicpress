import { Router, Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import { userCan } from '@civicpress/core';
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
} from './handlers-common.js';

export function registerSingleFileRoutes(router: Router): void {
  // POST /api/v1/storage/files - Upload file (unified endpoint)
  router.post(
    '/files',
    requireStoragePermission('upload'),
    upload.single('file'),
    body('folder').isString().notEmpty(),
    body('description').optional().isString(),
    (error: any, req: AuthenticatedRequest, res: Response, next: any) => {
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
      } catch (error: any) {
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
        } catch (error: any) {
          // If config file doesn't exist, use default config
          if (
            error?.message?.includes('not found') ||
            error?.message?.includes('Storage configuration not found')
          ) {
            config = configManager.getDefaultConfig();
          } else {
            throw error;
          }
        }
        const folderConfig = config.folders?.[fileInfo.folder];
        const folderAccess = folderConfig?.access ?? 'private';
        const isPublicFolder = folderAccess === 'public';

        if (!req.user) {
          if (!isPublicFolder) {
            res.status(401).json({
              success: false,
              error: {
                message: 'Authentication required',
                code: 'UNAUTHENTICATED',
              },
            });
            return;
          }
        } else if (!isPublicFolder) {
          const hasPermission = await userCan(req.user, 'storage:download', {
            action: 'download',
            folder: fileInfo.folder,
          } as any);

          if (!hasPermission) {
            res.status(403).json({
              success: false,
              error: {
                message: 'Permission denied: Cannot download storage resources',
                code: 'INSUFFICIENT_PERMISSIONS',
                required: 'storage:download',
                user: {
                  id: req.user.id,
                  username: req.user.username,
                  role: req.user.role,
                },
              },
            });
            return;
          }
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
      } catch (error: any) {
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
        } catch (error: any) {
          // If config file doesn't exist, use default config
          if (
            error?.message?.includes('not found') ||
            error?.message?.includes('Storage configuration not found')
          ) {
            config = configManager.getDefaultConfig();
          } else {
            throw error;
          }
        }
        const folderConfig = config.folders?.[fileInfo.folder];
        const folderAccess = folderConfig?.access ?? 'private';
        const isPublicFolder = folderAccess === 'public';

        if (!req.user) {
          if (!isPublicFolder) {
            res.status(401).json({
              success: false,
              error: {
                message: 'Authentication required',
                code: 'UNAUTHENTICATED',
              },
            });
            return;
          }
        } else if (!isPublicFolder) {
          const hasPermission = await userCan(req.user, 'storage:download', {
            action: 'download',
            folder: fileInfo.folder,
          } as any);

          if (!hasPermission) {
            res.status(403).json({
              success: false,
              error: {
                message: 'Permission denied: Cannot download storage resources',
                code: 'INSUFFICIENT_PERMISSIONS',
                required: 'storage:download',
                user: {
                  id: req.user.id,
                  username: req.user.username,
                  role: req.user.role,
                },
              },
            });
            return;
          }
        }

        const fileContent = await storageService.getFileContent(fileId);
        if (!fileContent) {
          return handleStorageError(
            'download_file',
            new Error(`File content not found for ID '${fileId}'`),
            req,
            res,
            404
          );
        }

        // Set appropriate headers
        res.setHeader('Content-Type', fileInfo.mime_type);
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="${fileInfo.original_name}"`
        );
        res.setHeader('Content-Length', fileInfo.size.toString());

        // Send the file content
        res.send(fileContent);
      } catch (error: any) {
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
      } catch (error: any) {
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
      } catch (error: any) {
        return handleStorageError('update_file', error, req, res);
      }
    }
  );
}
