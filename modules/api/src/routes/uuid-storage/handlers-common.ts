import multer from 'multer';
import {
  CloudUuidStorageService,
  StorageConfigManager,
  initializeStorageService,
} from '@civicpress/storage';
import path from 'path';
import { AuthenticatedRequest } from '../../middleware/auth.js';

// Configure multer for file uploads
export const upload = multer({
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
export async function getStorageService(
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
export function getStorageConfigManager(
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
