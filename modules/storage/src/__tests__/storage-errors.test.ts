/**
 * Unit Tests for Storage Error Classes
 */

import { describe, it, expect } from 'vitest';
import {
  StorageError,
  QuotaExceededError,
  ProviderUnavailableError,
  StorageTimeoutError,
  StorageValidationError,
  StorageFileNotFoundError,
  OrphanedFileError,
  StorageConfigurationError,
  BatchOperationError,
} from '../errors/storage-errors.js';

describe('StorageError', () => {
  it('should create error with message and context', () => {
    const error = new StorageError('Test error', {
      provider: 's3',
      operation: 'upload',
      fileId: 'test-id',
    });

    expect(error.message).toBe('Test error');
    expect(error.code).toBe('STORAGE_ERROR');
    expect(error.statusCode).toBe(500);
    expect(error.retryable).toBe(false);
    expect(error.context?.provider).toBe('s3');
    expect(error.context?.operation).toBe('upload');
    expect(error.context?.fileId).toBe('test-id');
    expect(error.correlationId).toBeDefined();
  });

  it('should generate correlation ID', () => {
    const error1 = new StorageError('Error 1');
    const error2 = new StorageError('Error 2');

    expect(error1.correlationId).toBeDefined();
    expect(error2.correlationId).toBeDefined();
    expect(error1.correlationId).not.toBe(error2.correlationId);
  });
});

describe('QuotaExceededError', () => {
  it('should create quota exceeded error', () => {
    const error = new QuotaExceededError(
      {
        used: 1000,
        limit: 500,
        available: 0,
        unit: 'bytes',
      },
      {
        folder: 'public',
        fileSize: 100,
      }
    );

    expect(error.code).toBe('STORAGE_QUOTA_EXCEEDED');
    expect(error.statusCode).toBe(413);
    expect(error.retryable).toBe(false);
    expect(error.message).toContain('quota exceeded');
    expect(error.context?.quota).toBeDefined();
    expect(error.context?.folder).toBe('public');
  });
});

describe('ProviderUnavailableError', () => {
  it('should create provider unavailable error', () => {
    const error = new ProviderUnavailableError('s3', 'Connection timeout', {
      operation: 'upload',
    });

    expect(error.code).toBe('STORAGE_PROVIDER_UNAVAILABLE');
    expect(error.statusCode).toBe(503);
    expect(error.retryable).toBe(true);
    expect(error.message).toContain('s3');
    expect(error.message).toContain('Connection timeout');
    expect(error.context?.provider).toBe('s3');
    expect(error.context?.reason).toBe('Connection timeout');
  });

  it('should create error without reason', () => {
    const error = new ProviderUnavailableError('s3');

    expect(error.message).toContain('s3');
    expect(error.context?.provider).toBe('s3');
  });
});

describe('StorageTimeoutError', () => {
  it('should create timeout error', () => {
    const error = new StorageTimeoutError('upload', 5000, {
      provider: 's3',
      fileSize: 1000,
    });

    expect(error.code).toBe('STORAGE_TIMEOUT');
    expect(error.statusCode).toBe(504);
    expect(error.retryable).toBe(true);
    expect(error.message).toContain('upload');
    expect(error.message).toContain('5s');
    expect(error.context?.operation).toBe('upload');
    expect(error.context?.timeout).toBe(5000);
    expect(error.context?.timeoutSeconds).toBe(5);
  });
});

describe('StorageValidationError', () => {
  it('should create validation error', () => {
    const error = new StorageValidationError('Invalid file type', {
      field: 'file',
      value: 'test.exe',
      rule: 'allowed_types',
      expected: ['pdf', 'doc'],
      folder: 'public',
    });

    expect(error.code).toBe('STORAGE_VALIDATION_ERROR');
    expect(error.statusCode).toBe(400);
    expect(error.retryable).toBe(false);
    expect(error.message).toBe('Invalid file type');
    expect(error.context?.field).toBe('file');
    expect(error.context?.value).toBe('test.exe');
  });
});

describe('StorageFileNotFoundError', () => {
  it('should create file not found error', () => {
    const error = new StorageFileNotFoundError('file-id-123', {
      folder: 'public',
      provider: 's3',
    });

    expect(error.code).toBe('STORAGE_FILE_NOT_FOUND');
    expect(error.statusCode).toBe(404);
    expect(error.retryable).toBe(false);
    expect(error.message).toContain('file-id-123');
    expect(error.context?.folder).toBe('public');
    expect(error.context?.provider).toBe('s3');
  });
});

describe('OrphanedFileError', () => {
  it('should create orphaned file error for in_storage', () => {
    const error = new OrphanedFileError('file-id', 'in_storage', {
      folder: 'public',
      storagePath: '/storage/file.txt',
    });

    expect(error.code).toBe('STORAGE_ORPHANED_FILE');
    expect(error.statusCode).toBe(500);
    expect(error.retryable).toBe(false);
    expect(error.message).toContain('in storage but not in database');
    expect(error.context?.fileId).toBe('file-id');
    expect(error.context?.orphanType).toBe('in_storage');
  });

  it('should create orphaned file error for in_database', () => {
    const error = new OrphanedFileError('file-id', 'in_database', {
      folder: 'public',
      dbPath: '/db/file.txt',
    });

    expect(error.message).toContain('in database but not in storage');
    expect(error.context?.orphanType).toBe('in_database');
  });

  it('should create orphaned file error for both', () => {
    const error = new OrphanedFileError('file-id', 'both', {
      folder: 'public',
      dbPath: '/db/file.txt',
      storagePath: '/storage/file2.txt',
    });

    expect(error.message).toContain('mismatched paths');
    expect(error.context?.orphanType).toBe('both');
  });
});

describe('StorageConfigurationError', () => {
  it('should create configuration error', () => {
    const error = new StorageConfigurationError('Invalid provider config', {
      field: 'bucket',
      provider: 's3',
      missing: ['region', 'credentials'],
    });

    expect(error.code).toBe('STORAGE_CONFIGURATION_ERROR');
    expect(error.statusCode).toBe(500);
    expect(error.retryable).toBe(false);
    expect(error.message).toBe('Invalid provider config');
    expect(error.context?.field).toBe('bucket');
    expect(error.context?.missing).toEqual(['region', 'credentials']);
  });
});

describe('BatchOperationError', () => {
  it('should create batch operation error with partial success', () => {
    const error = new BatchOperationError(
      'Some files failed',
      {
        operation: 'upload',
        total: 10,
        successful: 7,
        failed: 3,
        errors: [
          {
            item: 'file1.txt',
            error: 'Quota exceeded',
            errorCode: 'STORAGE_QUOTA_EXCEEDED',
          },
          { item: 'file2.txt', error: 'Timeout', errorCode: 'STORAGE_TIMEOUT' },
        ],
      },
      { folder: 'public' }
    );

    expect(error.code).toBe('STORAGE_BATCH_OPERATION_ERROR');
    expect(error.statusCode).toBe(207); // Multi-Status for partial success
    expect(error.retryable).toBe(false);
    expect(error.context?.batch).toBeDefined();
    expect(error.context?.batch?.successful).toBe(7);
    expect(error.context?.batch?.failed).toBe(3);
  });

  it('should set status 500 for complete failure', () => {
    const error = new BatchOperationError('All files failed', {
      operation: 'upload',
      total: 5,
      successful: 0,
      failed: 5,
      errors: [
        { item: 'file1.txt', error: 'Error 1' },
        { item: 'file2.txt', error: 'Error 2' },
      ],
    });

    expect(error.statusCode).toBe(500); // Complete failure
  });
});

describe('Error Serialization', () => {
  it('should serialize error to JSON', () => {
    const error = new StorageError('Test error', {
      provider: 's3',
      operation: 'upload',
    });

    const json = error.toJSON();
    const parsed = json; // toJSON() already returns an object, not a string

    expect(parsed.message).toBe('Test error');
    expect(parsed.code).toBe('STORAGE_ERROR');
    expect(parsed.statusCode).toBe(500);
    expect(parsed.correlationId).toBeDefined();
    expect(parsed.context?.provider).toBe('s3');
  });
});
