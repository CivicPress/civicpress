/**
 * Phase 2d W2-T18 — cloud-uuid-storage-service.ts characterization tests
 *
 * The original 2,711 LoC `CloudUuidStorageService` god-file was decomposed
 * (W2-T18) into a 539 LoC orchestrator + 8 collaborators under
 * `cloud-uuid-storage/`:
 *
 *   internals (pure helpers), validation, provider-init, upload-ops,
 *   download-ops, file-mgmt-ops, batch-ops, streaming-ops
 *
 * Pre-W2 the service had zero direct test coverage at this file level —
 * existing storage tests in `modules/storage/src/__tests__/*` cover the
 * reliability collaborators (retry, circuit-breaker, failover, lifecycle,
 * batch, streaming) but not the orchestrator's public surface or the pure
 * helpers carved out into `internals.ts`. This file pins both, so any
 * future tweak inside the decomposition can't silently change semantics.
 *
 * What this pins:
 * 1. internals (pure helpers):
 *    - parseSizeString — units (KB/MB/GB), case-insensitive suffix, fallback
 *    - formatBytes — bytes → human-readable with 2-decimal scaling
 *    - generateStoredFilename / -FromName — UUID injection + slugging
 *    - extractErrorCode — error → code map by message pattern
 *    - generateErrorSummary — count aggregation + sort-by-frequency
 *    - dbRecordToStorageFile — DB row → typed StorageFile
 *    - getLocalStoragePath — path resolution against host basePath
 * 2. StorageValidation: file-type wildcards, size limits, suspicious-ext
 *    warning, batch-level checks (folder, count, total-size)
 * 3. Orchestrator: public-API surface (the 28+ methods that route handlers
 *    + storage-services registration depend on) + setter/getter wiring
 *
 * Reliability collaborators (retry/circuit-breaker/failover/etc.) and the
 * heavy IO ops (upload/download/batch/streaming) are covered by the
 * existing `modules/storage/src/__tests__/*.test.ts` suite — out of scope
 * here.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  parseSizeString,
  formatBytes,
  generateStoredFilename,
  generateStoredFilenameFromName,
  extractErrorCode,
  generateErrorSummary,
  dbRecordToStorageFile,
  getLocalStoragePath,
  type StorageHostLike,
} from '../../../modules/storage/src/cloud-uuid-storage/internals.js';
import { StorageValidation } from '../../../modules/storage/src/cloud-uuid-storage/validation.js';
import { CloudUuidStorageService } from '../../../modules/storage/src/cloud-uuid-storage-service.js';
import type {
  StorageConfig,
  StorageFolder,
  MulterFile,
} from '../../../modules/storage/src/types/storage.types.js';

describe('cloud-uuid-storage internals — parseSizeString (W2-T18 characterization)', () => {
  it('parses bytes (B suffix)', () => {
    expect(parseSizeString('1024 B')).toBe(1024);
    expect(parseSizeString('1024B')).toBe(1024);
  });

  it('parses kilobytes, megabytes, gigabytes', () => {
    expect(parseSizeString('1 KB')).toBe(1024);
    expect(parseSizeString('1 MB')).toBe(1024 * 1024);
    expect(parseSizeString('1 GB')).toBe(1024 * 1024 * 1024);
  });

  it('accepts fractional values', () => {
    expect(parseSizeString('1.5 MB')).toBe(1.5 * 1024 * 1024);
    expect(parseSizeString('2.5KB')).toBe(2.5 * 1024);
  });

  it('is case-insensitive on the unit suffix', () => {
    expect(parseSizeString('1 mb')).toBe(1024 * 1024);
    expect(parseSizeString('10gb')).toBe(10 * 1024 * 1024 * 1024);
  });

  it('falls back to 1 MB for malformed input (defensive default)', () => {
    expect(parseSizeString('not a size')).toBe(1024 * 1024);
    expect(parseSizeString('')).toBe(1024 * 1024);
    expect(parseSizeString('10 XB')).toBe(1024 * 1024);
  });
});

describe('cloud-uuid-storage internals — formatBytes (W2-T18 characterization)', () => {
  it('returns "0 B" for zero', () => {
    expect(formatBytes(0)).toBe('0 B');
  });

  it('formats with 2-decimal precision and drops trailing zeros via parseFloat', () => {
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(1024 * 1024)).toBe('1 MB');
  });

  it('scales up to GB', () => {
    expect(formatBytes(1024 * 1024 * 1024)).toBe('1 GB');
    expect(formatBytes(2.5 * 1024 * 1024 * 1024)).toBe('2.5 GB');
  });
});

describe('cloud-uuid-storage internals — generateStoredFilename* (W2-T18 characterization)', () => {
  // FA-CORE-017: the buffer path now shares the sanitizing generator, so the
  // stored key is always a safe identifier (base slugged, id separated by "_").
  it('slugs the basename and appends the id: "<slug>_<id>.ext"', () => {
    const file = { originalname: 'document.pdf' } as MulterFile;
    expect(generateStoredFilename(file, 'abc-123')).toBe('document_abc-123.pdf');
  });

  it('slugs interior dots in multi-dot names (only the last is the extension)', () => {
    const file = { originalname: 'archive.tar.gz' } as MulterFile;
    expect(generateStoredFilename(file, 'uid')).toBe('archive_tar_uid.gz');
  });

  it('generateStoredFilenameFromName slugs the basename (non-alphanumeric → _)', () => {
    expect(generateStoredFilenameFromName('My Cool File!.pdf', 'uid-1')).toBe(
      'My_Cool_File__uid-1.pdf'
    );
  });

  it('preserves hyphens and underscores in the basename slug', () => {
    expect(generateStoredFilenameFromName('hello-world_v2.txt', 'uid')).toBe(
      'hello-world_v2_uid.txt'
    );
  });

  it('sanitizes a hostile extension (no spaces/separators survive)', () => {
    const file = { originalname: 'report.pd f' } as MulterFile;
    const out = generateStoredFilename(file, 'uid');
    expect(out).toBe('report_uid.pdf');
    expect(out).not.toContain(' ');
  });
});

describe('cloud-uuid-storage internals — extractErrorCode (W2-T18 characterization)', () => {
  it('reads .code from error objects when present', () => {
    expect(extractErrorCode({ code: 'EACCES' })).toBe('EACCES');
    expect(extractErrorCode({ code: 'NoSuchKey', other: 'ignored' })).toBe(
      'NoSuchKey'
    );
  });

  it('maps Error.message patterns to canonical storage codes', () => {
    expect(extractErrorCode(new Error('user quota exceeded'))).toBe(
      'STORAGE_QUOTA_EXCEEDED'
    );
    expect(extractErrorCode(new Error('request timeout'))).toBe(
      'STORAGE_TIMEOUT'
    );
    expect(extractErrorCode(new Error('file not found'))).toBe(
      'STORAGE_FILE_NOT_FOUND'
    );
    expect(extractErrorCode(new Error('unauthorized access'))).toBe(
      'STORAGE_UNAUTHORIZED'
    );
    expect(extractErrorCode(new Error('permission denied'))).toBe(
      'STORAGE_UNAUTHORIZED'
    );
  });

  it('maps string-error message patterns same way', () => {
    expect(extractErrorCode('quota')).toBe('STORAGE_QUOTA_EXCEEDED');
    expect(extractErrorCode('timeout')).toBe('STORAGE_TIMEOUT');
    expect(extractErrorCode('not found')).toBe('STORAGE_FILE_NOT_FOUND');
  });

  it('returns UNKNOWN_ERROR for unrecognized inputs', () => {
    expect(extractErrorCode(new Error('something else'))).toBe('UNKNOWN_ERROR');
    expect(extractErrorCode('random text')).toBe('UNKNOWN_ERROR');
    expect(extractErrorCode(null)).toBe('UNKNOWN_ERROR');
    expect(extractErrorCode(42)).toBe('UNKNOWN_ERROR');
  });
});

describe('cloud-uuid-storage internals — generateErrorSummary (W2-T18 characterization)', () => {
  it('counts by errorCode (defaults to UNKNOWN_ERROR when missing)', () => {
    const summary = generateErrorSummary([
      { error: 'a', errorCode: 'STORAGE_TIMEOUT' },
      { error: 'b', errorCode: 'STORAGE_TIMEOUT' },
      { error: 'c' },
    ]);
    expect(summary.byType).toEqual({
      STORAGE_TIMEOUT: 2,
      UNKNOWN_ERROR: 1,
    });
  });

  it('sorts byError by descending count', () => {
    const summary = generateErrorSummary([
      { error: 'rare', errorCode: 'X' },
      { error: 'common', errorCode: 'Y' },
      { error: 'common', errorCode: 'Y' },
      { error: 'common', errorCode: 'Y' },
    ]);
    expect(summary.byError[0]).toEqual({ error: 'common', count: 3 });
    expect(summary.byError[1]).toEqual({ error: 'rare', count: 1 });
  });

  it('reports total error count', () => {
    const summary = generateErrorSummary([
      { error: 'x' },
      { error: 'y' },
      { error: 'z' },
    ]);
    expect(summary.totalErrors).toBe(3);
  });

  it('handles empty input', () => {
    const summary = generateErrorSummary([]);
    expect(summary).toEqual({ byType: {}, byError: [], totalErrors: 0 });
  });
});

describe('cloud-uuid-storage internals — dbRecordToStorageFile (W2-T18 characterization)', () => {
  it('maps DB row fields verbatim and coerces created_at/updated_at to Date', () => {
    const row = {
      id: 'uid-1',
      original_name: 'doc.pdf',
      stored_filename: 'doc.uid-1.pdf',
      folder: 'documents',
      relative_path: 'documents/doc.uid-1.pdf',
      provider_path: 's3://bucket/documents/doc.uid-1.pdf',
      size: 4096,
      mime_type: 'application/pdf',
      description: 'A test',
      uploaded_by: 7,
      created_at: '2026-05-20T10:00:00Z',
      updated_at: '2026-05-20T10:30:00Z',
    };
    const file = dbRecordToStorageFile(row);
    expect(file.id).toBe('uid-1');
    expect(file.original_name).toBe('doc.pdf');
    expect(file.stored_filename).toBe('doc.uid-1.pdf');
    expect(file.folder).toBe('documents');
    expect(file.relative_path).toBe('documents/doc.uid-1.pdf');
    expect(file.provider_path).toBe('s3://bucket/documents/doc.uid-1.pdf');
    expect(file.size).toBe(4096);
    expect(file.mime_type).toBe('application/pdf');
    expect(file.description).toBe('A test');
    expect(file.uploaded_by).toBe(7);
    expect(file.created_at).toBeInstanceOf(Date);
    expect(file.created_at.toISOString()).toBe('2026-05-20T10:00:00.000Z');
    expect(file.updated_at).toBeInstanceOf(Date);
    expect(file.updated_at.toISOString()).toBe('2026-05-20T10:30:00.000Z');
  });
});

describe('cloud-uuid-storage internals — getLocalStoragePath (W2-T18 characterization)', () => {
  function makeHost(
    providers: StorageConfig['providers'] = {},
    basePath = '/tmp/civic-base'
  ): StorageHostLike {
    return {
      basePath,
      logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() } as any,
      config: {
        active_provider: 'local',
        providers,
        folders: {},
      } as StorageConfig,
    };
  }

  it('falls back to "<basePath>/storage" when no local provider is configured', () => {
    expect(getLocalStoragePath(makeHost())).toBe('/tmp/civic-base/storage');
  });

  it('uses local-provider path verbatim when absolute', () => {
    const host = makeHost({
      local: { type: 'local', path: '/var/civic/storage' } as any,
    });
    expect(getLocalStoragePath(host)).toBe('/var/civic/storage');
  });

  it('resolves relative local-provider path against basePath', () => {
    const host = makeHost(
      { local: { type: 'local', path: 'custom-storage' } as any },
      '/tmp/civic-base'
    );
    expect(getLocalStoragePath(host)).toBe('/tmp/civic-base/custom-storage');
  });

  it('defaults to "storage" subpath when local provider exists with no explicit path', () => {
    const host = makeHost({ local: { type: 'local' } as any }, '/tmp/civic-base');
    expect(getLocalStoragePath(host)).toBe('/tmp/civic-base/storage');
  });
});

describe('StorageValidation — validateFile (W2-T18 characterization)', () => {
  const validation = new StorageValidation({
    getConfig: () => ({ folders: {} }) as any,
  });

  function makeFile(over: Partial<MulterFile> = {}): MulterFile {
    return {
      originalname: 'doc.pdf',
      mimetype: 'application/pdf',
      size: 1024,
      buffer: Buffer.alloc(0),
      fieldname: 'file',
      encoding: '7bit',
      ...over,
    } as any as MulterFile;
  }

  function makeFolder(over: Partial<StorageFolder> = {}): StorageFolder {
    return {
      path: 'documents',
      allowed_types: ['pdf', 'txt'],
      max_size: '10 MB',
      ...over,
    } as StorageFolder;
  }

  it('accepts files whose extension is in allowed_types', () => {
    const result = validation.validateFile(
      makeFile({ originalname: 'a.pdf' }),
      makeFolder()
    );
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects files whose extension is NOT in allowed_types', () => {
    const result = validation.validateFile(
      makeFile({ originalname: 'a.exe' }),
      makeFolder()
    );
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/not allowed/i);
  });

  it('treats allowed_types=["*"] as a wildcard accepting any extension', () => {
    const result = validation.validateFile(
      makeFile({ originalname: 'a.xyz' }),
      makeFolder({ allowed_types: ['*'] })
    );
    expect(result.valid).toBe(true);
  });

  it('rejects files exceeding the folder max_size', () => {
    const result = validation.validateFile(
      makeFile({ size: 20 * 1024 * 1024 }), // 20 MB
      makeFolder({ max_size: '10 MB' })
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /exceeds limit/.test(e))).toBe(true);
  });

  it('REJECTS executable extensions outright (post-audit hardening: was warn-only)', () => {
    for (const name of [
      'install.exe',
      'run.bat',
      'go.cmd',
      'script.sh',
      'evil.ps1',
    ]) {
      const result = validation.validateFile(
        makeFile({ originalname: name }),
        // Even a wildcard folder must not accept executables.
        makeFolder({ allowed_types: ['*'] })
      );
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => /executable/i.test(e))).toBe(true);
    }
  });

  it('extension matching is case-insensitive (.PDF accepted when "pdf" allowed)', () => {
    const result = validation.validateFile(
      makeFile({ originalname: 'A.PDF' }),
      makeFolder()
    );
    expect(result.valid).toBe(true);
  });
});

describe('StorageValidation — validateBatchUpload (W2-T18 characterization)', () => {
  function makeConfig(): StorageConfig {
    return {
      active_provider: 'local',
      providers: { local: { type: 'local' } } as any,
      folders: {
        documents: {
          path: 'documents',
          allowed_types: ['pdf'],
          max_size: '10 MB',
        } as any,
      },
    } as StorageConfig;
  }

  function makeFile(over: any = {}): any {
    return {
      originalname: 'a.pdf',
      mimetype: 'application/pdf',
      size: 1024,
      buffer: Buffer.alloc(0),
      fieldname: 'file',
      encoding: '7bit',
      ...over,
    };
  }

  it('rejects when the target folder does not exist', () => {
    const validation = new StorageValidation({ getConfig: makeConfig });
    const result = validation.validateBatchUpload({
      folder: 'does-not-exist',
      files: [makeFile()],
    } as any);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/not found/i);
  });

  it('accepts a valid batch (1 small pdf to "documents")', () => {
    const validation = new StorageValidation({ getConfig: makeConfig });
    const result = validation.validateBatchUpload({
      folder: 'documents',
      files: [makeFile()],
    } as any);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects batches with more than 50 files (the hard-coded ceiling)', () => {
    const validation = new StorageValidation({ getConfig: makeConfig });
    const files = Array.from({ length: 51 }, () => makeFile());
    const result = validation.validateBatchUpload({
      folder: 'documents',
      files,
    } as any);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /Batch size exceeds/i.test(e))).toBe(true);
  });

  it('rejects batches whose total size exceeds 500 MB', () => {
    const validation = new StorageValidation({ getConfig: makeConfig });
    // 5 files × 200 MB = 1 GB; size check fails but per-file checks pass
    // (each file is under the folder's 10 MB limit only nominally — we lift
    // the folder limit by reusing makeConfig and overriding via spread)
    const config = makeConfig();
    config.folders.documents.max_size = '1 GB';
    const validation2 = new StorageValidation({ getConfig: () => config });
    const files = Array.from({ length: 5 }, () =>
      makeFile({ size: 200 * 1024 * 1024 })
    );
    const result = validation2.validateBatchUpload({
      folder: 'documents',
      files,
    } as any);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) => /Total batch size exceeds/i.test(e))
    ).toBe(true);
  });

  it('aggregates per-file errors with the originalname prefix', () => {
    const validation = new StorageValidation({ getConfig: makeConfig });
    const result = validation.validateBatchUpload({
      folder: 'documents',
      files: [makeFile({ originalname: 'evil.exe' })],
    } as any);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /^evil\.exe: /.test(e))).toBe(true);
  });
});

describe('CloudUuidStorageService orchestrator — public API surface (W2-T18 characterization)', () => {
  // The orchestrator exposes a lot of mutable setter / getter wiring on top
  // of the core file-ops surface. This pin makes sure the post-W2 class
  // didn't shrink the surface or rename a method route handlers or
  // storage-services registration relies on.
  const expectedMethods = [
    // construction-time / lifecycle
    'initializeS3Storage',
    'initializeAzureStorage',
    'initializeGCSStorage',
    'initialize',
    'shutdown',
    // optional manager wiring
    'setDatabaseService',
    'setCacheManager',
    'setConcurrencyLimiter',
    'setRetryManager',
    'setFailoverManager',
    'setCircuitBreakerManager',
    'setHealthChecker',
    'getHealthChecker',
    'setMetricsCollector',
    'getMetricsCollector',
    'getUsageReporter',
    'getQuotaManager',
    'setQuotaManager',
    'getOrphanedFileCleaner',
    'getLifecycleManager',
    // file ops (single-file)
    'uploadFile',
    'getFileById',
    'getFileContent',
    'listFiles',
    'deleteFile',
    'updateFile',
    // batch ops
    'batchUpload',
    'batchDelete',
    // streaming ops
    'uploadFileStream',
    'downloadFileStream',
    // configuration
    'getConfig',
    'updateConfig',
  ] as const;

  it('exposes all expected public methods on the prototype', () => {
    for (const name of expectedMethods) {
      expect(
        typeof (CloudUuidStorageService.prototype as any)[name],
        `missing or non-function method: ${name}`
      ).toBe('function');
    }
  });
});
