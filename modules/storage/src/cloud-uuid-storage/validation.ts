/**
 * Validation collaborator for CloudUuidStorageService.
 *
 * Phase 2d W2-T18: moved verbatim from the prior monolith. Holds the file +
 * batch validators. Pure helpers (`parseSizeString`, `formatBytes`,
 * etc.) live in `./internals.ts`.
 */

import path from 'path';
import type {
  StorageConfig,
  StorageFolder,
  FileValidationResult,
  MulterFile,
  BatchUploadRequest,
} from '../types/storage.types.js';
import { parseSizeString, formatBytes } from './internals.js';

export interface StorageValidationDeps {
  /**
   * Read live from the host: validateBatchUpload's folder lookup needs to
   * reflect the orchestrator's current config after `updateConfig`.
   */
  config: StorageConfig;
}

export class StorageValidation {
  constructor(private readonly deps: { getConfig: () => StorageConfig }) {}

  /**
   * Validate file against folder configuration
   */
  validateFile(file: MulterFile, folder: StorageFolder): FileValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check file type. '*' is a wildcard meaning "any extension allowed";
    // without the wildcard check, folders configured with allowed_types: ['*']
    // rejected every upload because ['*'].includes('txt') is false.
    const fileExtension = path
      .extname(file.originalname)
      .toLowerCase()
      .slice(1);
    const isExtensionAllowed =
      folder.allowed_types.includes('*') ||
      folder.allowed_types.includes(fileExtension);
    if (!isExtensionAllowed) {
      errors.push(
        `File type '${fileExtension}' not allowed in folder '${folder.path}'`
      );
    }

    // Check file size
    const maxSizeBytes = parseSizeString(folder.max_size);
    if (file.size > maxSizeBytes) {
      errors.push(
        `File size ${formatBytes(file.size)} exceeds limit ${folder.max_size}`
      );
    }

    // Executable / installer / script types are DENIED outright — a warning
    // that nobody reads while the upload proceeds is not a control
    // (post-audit hardening). This is an extension deny-list, not a full
    // content sniff, but it covers the common executable set across
    // Windows / *nix / cross-platform runtimes.
    // Unambiguous executable / installer / script extensions only. Ambiguous
    // ones (e.g. .bin firmware blobs, .app bundles-as-dirs) are deliberately
    // omitted — this is a deny-list of things that are executable by nature,
    // not a data-file blocker.
    const EXECUTABLE_EXTENSIONS = new Set([
      // Windows
      'exe', 'bat', 'cmd', 'com', 'scr', 'msi', 'cpl', 'vbs', 'vbe',
      'jse', 'wsf', 'wsh', 'ps1', 'psm1', 'reg',
      // *nix / shells
      'sh', 'bash', 'zsh', 'ksh', 'csh',
      // cross-platform runtimes / installers
      'jar', 'deb', 'rpm', 'apk',
    ]);
    if (EXECUTABLE_EXTENSIONS.has(fileExtension)) {
      errors.push(
        `Executable file type '${fileExtension}' is not allowed for upload`
      );
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate batch upload request
   */
  validateBatchUpload(request: BatchUploadRequest): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];
    const config = this.deps.getConfig();

    // Check folder exists
    const folder = config.folders[request.folder];
    if (!folder) {
      errors.push(`Folder '${request.folder}' not found`);
      return { valid: false, errors };
    }

    // Get batch limits from config
    const maxFilesPerBatch = 50; // Default, will be configurable
    const maxBatchSizeBytes = 524288000; // 500MB default

    // Validate file count
    if (request.files.length > maxFilesPerBatch) {
      errors.push(
        `Batch size exceeds maximum: ${request.files.length} > ${maxFilesPerBatch} files`
      );
    }

    // Validate total batch size
    const totalSize = request.files.reduce((sum, file) => sum + file.size, 0);
    if (totalSize > maxBatchSizeBytes) {
      errors.push(
        `Total batch size exceeds maximum: ${formatBytes(totalSize)} > ${formatBytes(maxBatchSizeBytes)}`
      );
    }

    // Validate each file
    for (const file of request.files) {
      const validation = this.validateFile(file, folder);
      if (!validation.valid) {
        errors.push(`${file.originalname}: ${validation.errors.join(', ')}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
