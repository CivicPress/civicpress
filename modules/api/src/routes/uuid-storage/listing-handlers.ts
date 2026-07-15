import { Router, Response } from 'express';
import { param, query, validationResult } from 'express-validator';
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
  getStorageService,
  getStorageConfigManager,
} from './handlers-common.js';

export function registerListingRoutes(router: Router): void {
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
        } catch (error: unknown) {
          // If config file doesn't exist, return default config instead of error
          // This is expected in test environments and fresh installations
          const errMessage =
            error instanceof Error ? error.message : String(error);
          if (
            errMessage.includes('not found') ||
            errMessage.includes('Storage configuration not found')
          ) {
            config = configManager.getDefaultConfig();
          } else {
            // Re-throw other errors (permission issues, invalid YAML, etc.)
            throw error;
          }
        }

        return handleStorageSuccess('get_storage_config', { config }, req, res);
      } catch (error: unknown) {
        return handleStorageError('get_storage_config', error, req, res);
      }
    }
  );

  // GET /api/v1/storage/folders/:folder/files - List files in folder
  // storage-002 (Critical) — public-folder bypass applied here, matching
  // the pattern already used for GET /files/:id and GET /files/:id/info.
  // Previously this route required `storage:download` unconditionally,
  // so citizens could not enumerate files in folders configured as
  // access: 'public'. Auth is now done inside the handler so the
  // folder's access mode can be consulted first.
  router.get(
    '/folders/:folder/files',
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

        // Determine folder's access mode (same pattern as
        // GET /files/:id and GET /files/:id/info).
        const configManager = getStorageConfigManager(req);
        let config;
        try {
          config = await configManager.loadConfig();
        } catch (configError: unknown) {
          const configErrMessage =
            configError instanceof Error
              ? configError.message
              : String(configError);
          if (
            configErrMessage.includes('not found') ||
            configErrMessage.includes('Storage configuration not found')
          ) {
            config = configManager.getDefaultConfig();
          } else {
            throw configError;
          }
        }
        const folderConfig = config.folders?.[folderName];
        if (!folderConfig) {
          res.status(404).json({
            success: false,
            error: {
              message: `Storage folder '${folderName}' not found`,
              code: 'FOLDER_NOT_FOUND',
            },
          });
          return;
        }
        const folderAccess = folderConfig.access ?? 'private';

        // FA-STOR-001: folder ENUMERATION is never anonymous. The prior
        // public-folder bypass (added for storage-002) let anyone list every
        // recording/transcript UUID + a ready-made download URL without any
        // record being published — the enumeration amplifier for FA-BB-002.
        // Listing now always requires auth; private folders additionally require
        // storage:read_private so a raw-recordings folder can't be enumerated by
        // the default public/clerk roles. Per-file GET stays public for public
        // folders, so citizen playback (which resolves ids from a published
        // record's attached_files, never from listing) is unaffected.
        if (!req.user) {
          res.status(401).json({
            success: false,
            error: {
              message: 'Authentication required',
              code: 'UNAUTHENTICATED',
            },
          });
          return;
        }
        // FA-STOR-002 (re-audit): fail closed. Only an explicitly public or
        // authenticated folder may be listed with the ordinary storage:download
        // grant; 'private', a missing access level, OR any unrecognized value
        // demands the admin-only storage:read_private — matching the shared
        // checkFileAccess gate used by download/info, so a mis-typed access
        // string can't downgrade a confidential folder to enumerable.
        const required =
          folderAccess === 'public' || folderAccess === 'authenticated'
            ? 'storage:download'
            : 'storage:read_private';
        const hasPermission = await userCan(req.user, required, {
          action: 'view',
        });
        if (!hasPermission) {
          res.status(403).json({
            success: false,
            error: {
              message: 'Permission denied: Cannot list files in this folder',
              code: 'INSUFFICIENT_PERMISSIONS',
              required,
            },
          });
          return;
        }

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
      } catch (error: unknown) {
        return handleStorageError('list_files', error, req, res);
      }
    }
  );
}
