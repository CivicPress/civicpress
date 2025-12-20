import { Router } from 'express';
import multer from 'multer';
import { body, param, query } from 'express-validator';
import {
  CloudUuidStorageService,
  StorageConfigManager,
  initializeStorageService,
  type MulterFile,
} from '@civicpress/storage';
import { userCan } from '@civicpress/core';
import { requireStoragePermission } from '../middleware/auth.js';
import {
  handleStorageSuccess,
  handleStorageError,
  handleStorageValidationError,
} from '../handlers/storage-handlers.js';
import { logApiRequest } from '../utils/api-logger.js';
import { validationResult } from 'express-validator';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { Response } from 'express';
import path from 'path';
import { Buffer } from 'node:buffer';

const router = Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB default limit
  },
  fileFilter: (req, file, cb) => {
    // Enhanced file type validation for Office documents and other file types
    const allowedExtensions = [
      'jpeg',
      'jpg',
      'png',
      'gif',
      'pdf',
      'doc',
      'docx',
      'txt',
      'md',
      'mp4',
      'webm',
      'mp3',
      'wav',
      'rtf',
      'epub',
      'xls',
      'xlsx',
      'ppt',
      'pptx',
      'geojson',
      'kml',
      'gpx',
      'shp',
      'json',
      'xml',
      'csv',
    ];

    const allowedMimeTypes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'text/markdown',
      'text/rtf',
      'video/mp4',
      'video/webm',
      'audio/mpeg',
      'audio/wav',
      'application/epub+zip',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/geo+json',
      'application/vnd.google-earth.kml+xml',
      'application/json',
      'application/xml',
      'text/csv',
    ];

    const fileExtension = path
      .extname(file.originalname)
      .toLowerCase()
      .replace('.', '');
    const hasValidExtension = allowedExtensions.includes(fileExtension);
    const hasValidMimeType = allowedMimeTypes.includes(file.mimetype);

    // Allow if either extension or MIME type is valid (more flexible)
    if (hasValidExtension || hasValidMimeType) {
      return cb(null, true);
    } else {
      cb(new Error(`Invalid file type: ${file.mimetype} (${fileExtension})`));
    }
  },
});

/**
 * Get storage service from DI container
 *
 * This helper function retrieves the storage service from the DI container
 * and ensures it's properly initialized. This follows Pattern 2 (Service Registration)
 * from the Module Integration Guide.
 *
 * @param req - Authenticated request with CivicPress instance
 * @returns Storage service instance
 * @throws Error if CivicPress instance or storage service is not available
 */
async function getStorageService(
  req: AuthenticatedRequest
): Promise<CloudUuidStorageService> {
  // Get CivicPress instance from request context
  const civicPress = (req as any).context?.civicPress || req.civicPress;
  if (!civicPress) {
    throw new Error('CivicPress instance not available');
  }

  // Get storage service from DI container
  // Using Pattern 2 (Service Registration) from Module Integration Guide
  let storageService: CloudUuidStorageService;
  try {
    // Note: getService supports generics but TypeScript may not infer correctly
    // Using type assertion for now
    storageService = civicPress.getService(
      'storage'
    ) as CloudUuidStorageService;
    if (!storageService) {
      throw new Error('Storage service resolved but is null/undefined');
    }
  } catch (error: any) {
    // Check if it's a ServiceNotFoundError
    if (
      error?.name === 'ServiceNotFoundError' ||
      error?.constructor?.name === 'ServiceNotFoundError'
    ) {
      throw new Error(
        `Storage service not found in DI container. This usually means the storage module was not registered during initialization. Original error: ${error?.message || error}`
      );
    }

    throw new Error(
      `Storage service not available. Storage module may not be registered in DI container. Original error: ${error?.message || error}`
    );
  }

  // Ensure storage service is initialized (handles async config loading)
  await initializeStorageService(storageService);

  return storageService;
}

/**
 * Get storage config manager from DI container
 *
 * @param req - Authenticated request with CivicPress instance
 * @returns Storage config manager instance
 * @throws Error if CivicPress instance or config manager is not available
 */
function getStorageConfigManager(
  req: AuthenticatedRequest
): StorageConfigManager {
  // Get CivicPress instance from request context
  const civicPress = (req as any).context?.civicPress || req.civicPress;
  if (!civicPress) {
    throw new Error('CivicPress instance not available');
  }

  // Get storage config manager from DI container
  // Using Pattern 2 (Service Registration) from Module Integration Guide
  try {
    // Note: getService supports generics but TypeScript may not infer correctly
    // Using type assertion for now
    return civicPress.getService(
      'storageConfigManager'
    ) as StorageConfigManager;
  } catch {
    throw new Error(
      'Storage config manager not available. Storage module may not be registered in DI container.'
    );
  }
}

// Reset storage services (for testing) - no longer needed but kept for backward compatibility
export const resetStorageServices = () => {
  // No-op: Services are now managed by DI container
  // This function is kept for backward compatibility with tests
};

// GET /api/v1/storage/config - Get storage configuration
router.get(
  '/config',
  requireStoragePermission('manage'),
  async (req: AuthenticatedRequest, res: Response) => {
    logApiRequest(req, { operation: 'get_storage_config' });

    try {
      const configManager = getStorageConfigManager(req);

      let config;
      try {
        config = await configManager.loadConfig();
      } catch (error: any) {
        // If config file doesn't exist, return default config instead of error
        // This is expected in test environments and fresh installations
        if (
          error?.message?.includes('not found') ||
          error?.message?.includes('Storage configuration not found')
        ) {
          config = configManager.getDefaultConfig();
        } else {
          // Re-throw other errors (permission issues, invalid YAML, etc.)
          throw error;
        }
      }

      return handleStorageSuccess('get_storage_config', { config }, req, res);
    } catch (error: any) {
      return handleStorageError('get_storage_config', error, req, res);
    }
  }
);

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
      const files = (Array.isArray(req.files) ? req.files : []) as any[];
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
      const multerFiles: MulterFile[] = files.map((file: any) => ({
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
    } catch (error: any) {
      return handleStorageError('batch_upload', error, req, res);
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
    } catch (error: any) {
      return handleStorageError('batch_delete', error, req, res);
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

// GET /api/v1/storage/folders/:folder/files - List files in folder
router.get(
  '/folders/:folder/files',
  requireStoragePermission('download'),
  param('folder').isString().notEmpty(),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('search').optional().isString(),
  query('type').optional().isString(),
  async (req: AuthenticatedRequest, res: Response) => {
    logApiRequest(req, { operation: 'list_files', folder: req.params.folder });

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return handleStorageValidationError(
        'list_files',
        errors.array(),
        req,
        res
      );
    }

    try {
      const storageService = await getStorageService(req);
      const folderName = req.params.folder;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      const search = req.query.search as string;
      const type = req.query.type as string;

      const files = await storageService.listFiles(folderName);

      // Apply filters
      let filteredFiles = files;

      if (search) {
        filteredFiles = filteredFiles.filter((file) =>
          file.original_name.toLowerCase().includes(search.toLowerCase())
        );
      }

      if (type) {
        filteredFiles = filteredFiles.filter((file) =>
          file.mime_type.includes(type)
        );
      }

      // Apply pagination
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + limit;
      const paginatedFiles = filteredFiles.slice(startIndex, endIndex);

      // Format response
      const formattedFiles = paginatedFiles.map((file) => ({
        id: file.id,
        original_name: file.original_name,
        relative_path: file.relative_path,
        size: file.size,
        mime_type: file.mime_type,
        description: file.description,
        uploaded_by: file.uploaded_by,
        created_at: file.created_at,
        updated_at: file.updated_at,
        url: `/api/v1/storage/files/${file.id}`,
      }));

      return handleStorageSuccess(
        'list_files',
        {
          files: formattedFiles,
          pagination: {
            page,
            limit,
            total: filteredFiles.length,
            pages: Math.ceil(filteredFiles.length / limit),
          },
        },
        req,
        res
      );
    } catch (error: any) {
      return handleStorageError('list_files', error, req, res);
    }
  }
);

export default router;
