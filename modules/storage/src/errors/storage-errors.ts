/**
 * Storage Error Classes
 *
 * Storage-specific error classes extending CivicPressError
 */

import {
  CivicPressError,
  ValidationError,
  NotFoundError,
  InternalError,
} from '@civicpress/core';

/**
 * Base error class for all storage-related errors
 */
export class StorageError extends CivicPressError {
  code = 'STORAGE_ERROR';
  statusCode = 500;
  retryable: boolean = false; // Default, override in subclasses

  constructor(
    message: string,
    context?: {
      provider?: string;
      operation?: string;
      fileId?: string;
      folder?: string;
      [key: string]: any;
    }
  ) {
    super(message, context);
  }
}

/**
 * Quota Exceeded Error
 */
export class QuotaExceededError extends StorageError {
  override code = 'STORAGE_QUOTA_EXCEEDED';
  override statusCode = 413; // Payload Too Large
  override retryable = false;

  constructor(
    quota: {
      used: number;
      limit: number;
      available: number;
      unit: 'bytes' | 'KB' | 'MB' | 'GB';
    },
    context?: {
      folder?: string;
      fileSize?: number;
      provider?: string;
    }
  ) {
    const availableFormatted = formatBytes(quota.available, quota.unit);
    const limitFormatted = formatBytes(quota.limit, quota.unit);
    const message = `Storage quota exceeded. Available: ${availableFormatted}, Limit: ${limitFormatted}`;

    super(message, {
      quota,
      ...context,
    });
  }
}

/**
 * Provider Unavailable Error
 */
export class ProviderUnavailableError extends StorageError {
  override code = 'STORAGE_PROVIDER_UNAVAILABLE';
  override statusCode = 503; // Service Unavailable
  override retryable = true; // Retryable - provider may recover

  constructor(
    provider: string,
    reason?: string,
    context?: {
      operation?: string;
      fileId?: string;
      folder?: string;
    }
  ) {
    const message = reason
      ? `Storage provider '${provider}' unavailable: ${reason}`
      : `Storage provider '${provider}' unavailable`;

    super(message, {
      provider,
      reason,
      ...context,
    });
  }
}

/**
 * Storage Timeout Error
 */
export class StorageTimeoutError extends StorageError {
  override code = 'STORAGE_TIMEOUT';
  override statusCode = 504; // Gateway Timeout
  override retryable = true; // Retryable - may succeed on retry

  constructor(
    operation: string,
    timeout: number, // milliseconds
    context?: {
      provider?: string;
      fileId?: string;
      folder?: string;
      fileSize?: number;
    }
  ) {
    const timeoutSeconds = Math.round(timeout / 1000);
    const message = `Storage operation '${operation}' timed out after ${timeoutSeconds}s`;

    super(message, {
      operation,
      timeout,
      timeoutSeconds,
      ...context,
    });
  }
}

/**
 * Storage Validation Error
 */
export class StorageValidationError extends ValidationError {
  code = 'STORAGE_VALIDATION_ERROR';
  statusCode = 400; // Bad Request
  retryable = false; // Not retryable - client error

  constructor(
    message: string,
    validationDetails: {
      field?: string;
      value?: any;
      rule?: string;
      expected?: any;
      folder?: string;
    }
  ) {
    super(message, validationDetails);
  }
}

/**
 * Storage File Not Found Error
 */
export class StorageFileNotFoundError extends NotFoundError {
  code = 'STORAGE_FILE_NOT_FOUND';
  statusCode = 404; // Not Found
  retryable = false; // Not retryable

  constructor(
    fileId: string,
    context?: {
      folder?: string;
      provider?: string;
      path?: string;
    }
  ) {
    super(`Storage file '${fileId}' not found`, fileId);
    // Add storage-specific context
    if (context) {
      this.context = { ...this.context, ...context };
    }
  }
}

/**
 * Orphaned File Error
 */
export class OrphanedFileError extends StorageError {
  override code = 'STORAGE_ORPHANED_FILE';
  override statusCode = 500; // Internal Server Error
  override retryable = false; // Not retryable - requires manual intervention

  constructor(
    fileId: string,
    type: 'in_storage' | 'in_database' | 'both', // Where the orphan exists
    context?: {
      folder?: string;
      provider?: string;
      path?: string;
      dbPath?: string;
      storagePath?: string;
    }
  ) {
    const message = `Orphaned file '${fileId}': exists ${type === 'in_storage' ? 'in storage but not in database' : type === 'in_database' ? 'in database but not in storage' : 'with mismatched paths'}`;

    super(message, {
      fileId,
      orphanType: type,
      ...context,
    });
  }
}

/**
 * Storage Configuration Error
 */
export class StorageConfigurationError extends ValidationError {
  code = 'STORAGE_CONFIGURATION_ERROR';
  statusCode = 500; // Internal Server Error (configuration issues)
  retryable = false; // Not retryable - requires configuration fix

  constructor(
    message: string,
    configDetails?: {
      field?: string;
      provider?: string;
      missing?: string[];
      invalid?: Record<string, any>;
    }
  ) {
    super(message, configDetails);
  }
}

/**
 * Batch Operation Error
 */
export class BatchOperationError extends StorageError {
  override code = 'STORAGE_BATCH_OPERATION_ERROR';
  override statusCode = 207; // Multi-Status (partial success) or 500 (complete failure)
  override retryable = false; // Individual items may be retryable, but batch itself is not

  constructor(
    message: string,
    batchDetails: {
      operation: 'upload' | 'delete';
      total: number;
      successful: number;
      failed: number;
      errors?: Array<{
        item: string;
        error: string;
        errorCode?: string;
      }>;
    },
    context?: {
      folder?: string;
      provider?: string;
    }
  ) {
    super(message, {
      batch: batchDetails,
      ...context,
    });

    // Set status code based on success rate
    if (batchDetails.failed === batchDetails.total) {
      this.statusCode = 500; // Complete failure
    } else {
      this.statusCode = 207; // Partial success
    }
  }
}

/**
 * Helper function to format bytes
 */
function formatBytes(
  bytes: number,
  unit: 'bytes' | 'KB' | 'MB' | 'GB'
): string {
  const units: Record<string, number> = {
    bytes: 1,
    KB: 1024,
    MB: 1024 * 1024,
    GB: 1024 * 1024 * 1024,
  };

  const value = bytes / units[unit];
  return `${value.toFixed(2)}${unit}`;
}
