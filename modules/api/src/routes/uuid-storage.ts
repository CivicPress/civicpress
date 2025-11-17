import { Router } from 'express';
import multer from 'multer';
import { body, param, query } from 'express-validator';
import {
  CloudUuidStorageService,
  StorageConfigManager,
} from '@civicpress/storage';
import { DatabaseService, userCan } from '@civicpress/core';
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

// Initialize storage services
let storageService: CloudUuidStorageService;
let configManager: StorageConfigManager;
let databaseService: DatabaseService;

// Reset storage services (for testing)
export const resetStorageServices = () => {
  storageService = null as any;
  configManager = null as any;
  databaseService = null as any;
};

// Initialize storage services (called when routes are first accessed)
const initializeStorage = async (req: AuthenticatedRequest) => {
  if (!storageService) {
    // Get CivicPress instance and data directory from request context
    const civicPress = (req as any).context?.civicPress;
    if (!civicPress) {
      throw new Error('CivicPress instance not available');
    }

    // Get system data directory
    // In production: .system-data is at project root
    // In tests: .system-data is at {dataDir}/.system-data
    // Check project root first, then fall back to contextDataDir for tests
    const contextDataDir = (req as any).context?.dataDir;
    let systemDataDir: string;

    // Default to project root .system-data (production)
    const projectRootSystemData = path.join(process.cwd(), '.system-data');

    // Check if we're in a test environment by checking if contextDataDir is in a temp directory
    // or if .system-data doesn't exist at project root
    const fs = await import('fs/promises');
    const isTestEnvironment =
      contextDataDir &&
      (contextDataDir.includes('/tmp/') ||
        contextDataDir.includes('test') ||
        process.env.NODE_ENV === 'test');

    try {
      await fs.access(projectRootSystemData);
      // .system-data exists at project root, use it (production)
      systemDataDir = projectRootSystemData;
    } catch {
      // .system-data doesn't exist at project root
      if (isTestEnvironment && contextDataDir) {
        // Test environment: use contextDataDir/.system-data
        systemDataDir = path.join(contextDataDir, '.system-data');
      } else {
        // Production but .system-data missing at root - use project root anyway
        // (will fail with clear error if missing)
        systemDataDir = projectRootSystemData;
      }
    }

    configManager = new StorageConfigManager(systemDataDir);

    try {
      const config = await configManager.loadConfig();
      storageService = new CloudUuidStorageService(config, systemDataDir);

      // Get database service from request context (injected by API)
      databaseService = (req as any).context?.databaseService;
      if (!databaseService) {
        throw new Error('Database service not available');
      }

      storageService.setDatabaseService(databaseService);
      await storageService.initialize();
    } catch (error: any) {
      // Log the actual error for debugging
      console.error('Storage initialization error:', {
        message: error.message,
        stack: error.stack,
        systemDataDir,
        configPath: configManager
          ? (configManager as any).configPath
          : 'unknown',
      });

      // If storage config doesn't exist, return a helpful error
      if (error.message.includes('Storage configuration not found')) {
        throw new Error(
          'Storage configuration not initialized. Please run "civic init" to set up storage.'
        );
      }
      // Re-throw with more context
      throw new Error(`Failed to load storage configuration: ${error.message}`);
    }
  }
};

// GET /api/v1/storage/config - Get storage configuration
router.get(
  '/config',
  requireStoragePermission('manage'),
  async (req: AuthenticatedRequest, res: Response) => {
    logApiRequest(req, { operation: 'get_storage_config' });

    try {
      await initializeStorage(req);
      const config = await configManager.loadConfig();

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
      await initializeStorage(req);
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

// GET /api/v1/storage/files/:id - Download file by UUID
router.get(
  '/files/:id',
  param('id').isUUID(),
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
      await initializeStorage(req);
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

      const config = await configManager.loadConfig();
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

// GET /api/v1/storage/files/:id/info - Get file information by UUID
router.get(
  '/files/:id/info',
  param('id').isUUID(),
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
      await initializeStorage(req);
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

      const config = await configManager.loadConfig();
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

// DELETE /api/v1/storage/files/:id - Delete file by UUID
router.delete(
  '/files/:id',
  requireStoragePermission('delete'),
  param('id').isUUID(),
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
      await initializeStorage(req);
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
  param('id').isUUID(),
  body('description').optional().isString(),
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
      await initializeStorage(req);
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
      await initializeStorage(req);
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
