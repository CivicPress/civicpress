import { Router } from 'express';
import multer from 'multer';
import { body, param, query } from 'express-validator';
import { StorageService } from '@civicpress/storage';
import { StorageConfigManager } from '@civicpress/storage';
import {
  authMiddleware,
  requireStoragePermission,
} from '../middleware/auth.js';
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
    // Basic file type validation (will be enhanced in storage service)
    const allowedTypes =
      /jpeg|jpg|png|gif|pdf|doc|docx|txt|md|mp4|webm|mp3|wav/;
    const extname = allowedTypes.test(
      path.extname(file.originalname).toLowerCase()
    );
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  },
});

// Initialize storage services
let storageService: StorageService;
let configManager: StorageConfigManager;

// Initialize storage services (called when routes are first accessed)
const initializeStorage = async () => {
  if (!storageService) {
    configManager = new StorageConfigManager('.system-data');
    const config = await configManager.loadConfig();
    storageService = new StorageService(config, '.system-data');
    await storageService.initialize();
  }
};

// GET /api/v1/storage/config - Get storage configuration
router.get(
  '/config',
  requireStoragePermission('manage'),
  async (req: AuthenticatedRequest, res: Response) => {
    logApiRequest(req, { operation: 'get_storage_config' });

    try {
      await initializeStorage();
      const config = await configManager.loadConfig();

      return handleStorageSuccess('get_storage_config', { config }, req, res);
    } catch (error: any) {
      return handleStorageError('get_storage_config', error, req, res);
    }
  }
);

// PUT /api/v1/storage/config - Update storage configuration
router.put(
  '/config',
  requireStoragePermission('admin'),
  body('backend').optional().isObject(),
  body('folders').optional().isObject(),
  body('metadata').optional().isObject(),
  async (req: AuthenticatedRequest, res: Response) => {
    logApiRequest(req, { operation: 'update_storage_config' });

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return handleStorageValidationError(
        'update_storage_config',
        errors.array(),
        req,
        res
      );
    }

    try {
      await initializeStorage();
      const updatedConfig = await configManager.updateConfig(req.body);

      return handleStorageSuccess(
        'update_storage_config',
        { config: updatedConfig },
        req,
        res
      );
    } catch (error: any) {
      return handleStorageError('update_storage_config', error, req, res);
    }
  }
);

// POST /api/v1/storage/upload/:folder - Upload file to folder
router.post(
  '/upload/:folder',
  requireStoragePermission('upload'),
  param('folder').isString().notEmpty(),
  body('metadata').optional().isObject(),
  upload.single('file'),
  async (req: AuthenticatedRequest, res: Response) => {
    logApiRequest(req, { operation: 'upload_file', folder: req.params.folder });

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
      await initializeStorage();
      const folderName = req.params.folder;
      const userId = req.user?.id?.toString();
      const metadata = req.body.metadata
        ? JSON.parse(req.body.metadata)
        : undefined;

      const result = await storageService.uploadFile(
        folderName,
        req.file,
        userId
      );

      if (result.success) {
        return handleStorageSuccess(
          'upload_file',
          {
            file: result.file,
            url: result.url,
            path: result.path,
          },
          req,
          res
        );
      } else {
        return handleStorageError(
          'upload_file',
          new Error(result.error || 'Upload failed'),
          req,
          res
        );
      }
    } catch (error: any) {
      return handleStorageError('upload_file', error, req, res);
    }
  }
);

// GET /api/v1/storage/files/:folder - List files in folder
router.get(
  '/files/:folder',
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
      await initializeStorage();
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
          file.name.toLowerCase().includes(search.toLowerCase())
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

      return handleStorageSuccess(
        'list_files',
        {
          files: paginatedFiles,
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

// GET /api/v1/storage/download/:folder/:filename - Download file
router.get(
  '/download/:folder/:filename',
  requireStoragePermission('download'),
  param('folder').isString().notEmpty(),
  param('filename').isString().notEmpty(),
  async (req: AuthenticatedRequest, res: Response) => {
    logApiRequest(req, {
      operation: 'download_file',
      folder: req.params.folder,
      filename: req.params.filename,
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
      await initializeStorage();
      const folderName = req.params.folder;
      const fileName = req.params.filename;

      // Get file info first to check if it exists
      const filePath = path.join(
        '.system-data',
        'storage',
        folderName,
        fileName
      );
      const fileInfo = await storageService.getFileInfo(filePath);

      // Set appropriate headers
      res.setHeader('Content-Type', fileInfo.mime_type);
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${fileInfo.name}"`
      );
      res.setHeader('Content-Length', fileInfo.size.toString());

      // Stream the file
      const fs = require('fs');
      const fileStream = fs.createReadStream(filePath);
      fileStream.pipe(res);
    } catch (error: any) {
      return handleStorageError('download_file', error, req, res);
    }
  }
);

// DELETE /api/v1/storage/files/:folder/:filename - Delete file
router.delete(
  '/files/:folder/:filename',
  requireStoragePermission('delete'),
  param('folder').isString().notEmpty(),
  param('filename').isString().notEmpty(),
  async (req: AuthenticatedRequest, res: Response) => {
    logApiRequest(req, {
      operation: 'delete_file',
      folder: req.params.folder,
      filename: req.params.filename,
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
      await initializeStorage();
      const folderName = req.params.folder;
      const fileName = req.params.filename;
      const userId = req.user?.id?.toString();

      const filePath = path.join(
        '.system-data',
        'storage',
        folderName,
        fileName
      );
      const success = await storageService.deleteFile(filePath, userId);

      if (success) {
        return handleStorageSuccess(
          'delete_file',
          { message: 'File deleted successfully' },
          req,
          res
        );
      } else {
        return handleStorageError(
          'delete_file',
          new Error('Failed to delete file'),
          req,
          res
        );
      }
    } catch (error: any) {
      return handleStorageError('delete_file', error, req, res);
    }
  }
);

// GET /api/v1/storage/files/:folder/:filename/info - Get file information
router.get(
  '/files/:folder/:filename/info',
  requireStoragePermission('download'),
  param('folder').isString().notEmpty(),
  param('filename').isString().notEmpty(),
  async (req: AuthenticatedRequest, res: Response) => {
    logApiRequest(req, {
      operation: 'get_file_info',
      folder: req.params.folder,
      filename: req.params.filename,
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
      await initializeStorage();
      const folderName = req.params.folder;
      const fileName = req.params.filename;

      const filePath = path.join(
        '.system-data',
        'storage',
        folderName,
        fileName
      );
      const fileInfo = await storageService.getFileInfo(filePath);

      return handleStorageSuccess(
        'get_file_info',
        { file: fileInfo },
        req,
        res
      );
    } catch (error: any) {
      return handleStorageError('get_file_info', error, req, res);
    }
  }
);

// POST /api/v1/storage/folders - Add new folder
router.post(
  '/folders',
  requireStoragePermission('admin'),
  body('name').isString().notEmpty(),
  body('config').isObject(),
  body('config.path').isString().notEmpty(),
  body('config.access').isIn(['public', 'authenticated', 'private']),
  body('config.allowed_types').isArray(),
  body('config.max_size').isString().notEmpty(),
  async (req: AuthenticatedRequest, res: Response) => {
    logApiRequest(req, { operation: 'add_folder' });

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return handleStorageValidationError(
        'add_folder',
        errors.array(),
        req,
        res
      );
    }

    try {
      await initializeStorage();
      const { name, config } = req.body;

      const updatedConfig = await configManager.addFolder(name, config);

      return handleStorageSuccess(
        'add_folder',
        { config: updatedConfig },
        req,
        res
      );
    } catch (error: any) {
      return handleStorageError('add_folder', error, req, res);
    }
  }
);

// PUT /api/v1/storage/folders/:name - Update folder configuration
router.put(
  '/folders/:name',
  requireStoragePermission('admin'),
  param('name').isString().notEmpty(),
  body('config').isObject(),
  async (req: AuthenticatedRequest, res: Response) => {
    logApiRequest(req, { operation: 'update_folder' });

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return handleStorageValidationError(
        'update_folder',
        errors.array(),
        req,
        res
      );
    }

    try {
      await initializeStorage();
      const folderName = req.params.name;
      const updates = req.body.config;

      const updatedConfig = await configManager.updateFolder(
        folderName,
        updates
      );

      return handleStorageSuccess(
        'update_folder',
        { config: updatedConfig },
        req,
        res
      );
    } catch (error: any) {
      return handleStorageError('update_folder', error, req, res);
    }
  }
);

// DELETE /api/v1/storage/folders/:name - Remove folder
router.delete(
  '/folders/:name',
  requireStoragePermission('admin'),
  param('name').isString().notEmpty(),
  async (req: AuthenticatedRequest, res: Response) => {
    logApiRequest(req, { operation: 'remove_folder' });

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return handleStorageValidationError(
        'remove_folder',
        errors.array(),
        req,
        res
      );
    }

    try {
      await initializeStorage();
      const folderName = req.params.name;

      const updatedConfig = await configManager.removeFolder(folderName);

      return handleStorageSuccess(
        'remove_folder',
        {
          message: `Folder '${folderName}' removed successfully`,
          config: updatedConfig,
        },
        req,
        res
      );
    } catch (error: any) {
      return handleStorageError('remove_folder', error, req, res);
    }
  }
);

export default router;
