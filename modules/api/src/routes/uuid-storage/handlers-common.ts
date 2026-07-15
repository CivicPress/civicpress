import multer from 'multer';
import {
  CloudUuidStorageService,
  StorageConfigManager,
  initializeStorageService,
} from '@civicpress/storage';
import { userCan } from '@civicpress/core';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { AuthenticatedRequest } from '../../middleware/auth.js';

/**
 * Decision returned by {@link checkFileAccess}. `ok:true` means serve; otherwise
 * `status`/`code`/`message` describe the deny response to send.
 */
export interface StorageAccessDecision {
  ok: boolean;
  status?: number;
  code?: string;
  message?: string;
  required?: string;
}

/**
 * The single three-tier storage access gate (FA-STOR-002). Consulted by every
 * read surface — file download, file `/info`, and folder listing — so the access
 * model can't drift between handlers (the check used to be hand-copied in three
 * places and only the download path was ever tightened).
 *
 *   public        → open to everyone, including anonymous callers
 *   authenticated → any logged-in user holding `storage:download`
 *   private / *   → `storage:read_private`, a permission NOT granted to the
 *                   default `public` role or to `clerk` (admin-only by default).
 *
 * Unknown/missing access levels fall through to the private tier — fail closed.
 */
export async function checkFileAccess(
  folderAccess: string | undefined,
  user: AuthenticatedRequest['user']
): Promise<StorageAccessDecision> {
  const access = folderAccess ?? 'private';

  if (access === 'public') {
    return { ok: true };
  }

  if (!user) {
    return {
      ok: false,
      status: 401,
      code: 'UNAUTHENTICATED',
      message: 'Authentication required',
    };
  }

  // 'authenticated' keeps the historical storage:download requirement (so
  // clerks/citizens keep permit access); anything else — private or an
  // unrecognized level — demands the stronger confidential permission.
  const required =
    access === 'authenticated' ? 'storage:download' : 'storage:read_private';
  const allowed = await userCan(user, required, { action: 'view' });
  if (!allowed) {
    return {
      ok: false,
      status: 403,
      code: 'INSUFFICIENT_PERMISSIONS',
      message:
        required === 'storage:read_private'
          ? 'Permission denied: confidential storage requires storage:read_private'
          : 'Permission denied: Cannot access storage resource',
      required,
    };
  }
  return { ok: true };
}

// FA-API-016: buffer uploads in a temp DIR, not in the heap. memoryStorage held
// each in-flight upload (≤100 MB single, ≤50×100 MB batch) entirely in memory,
// so a few concurrent uploads could exhaust the Node heap. diskStorage spills to
// os.tmpdir(); handlers stream the temp file into storage and unlink it after.
const uploadTmpDir =
  process.env.CIVIC_UPLOAD_TMP_DIR ||
  path.join(os.tmpdir(), 'civicpress-uploads');
try {
  fs.mkdirSync(uploadTmpDir, { recursive: true });
} catch {
  // best-effort; multer surfaces a clear error if the dir is unusable
}

// Configure multer for file uploads
export const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadTmpDir),
  }),
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
  const civicPress = req.context?.civicPress || req.civicPress;
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
  } catch (error: unknown) {
    const errorName = error instanceof Error ? error.name : undefined;
    const errorCtorName =
      error instanceof Error ? error.constructor?.name : undefined;
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    if (
      errorName === 'ServiceNotFoundError' ||
      errorCtorName === 'ServiceNotFoundError'
    ) {
      throw new Error(
        `Storage service not found in DI container. This usually means the storage module was not registered during initialization. Original error: ${errorMessage}`
      );
    }

    throw new Error(
      `Storage service not available. Storage module may not be registered in DI container. Original error: ${errorMessage}`
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
  const civicPress = req.context?.civicPress || req.civicPress;
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
