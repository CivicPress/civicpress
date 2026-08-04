/**
 * LIVE S3 integration test.
 *
 * Every other storage test drives the cloud providers against a MOCKED SDK
 * boundary (fake `s3Client.send`). This one exercises the real
 * upload / download / delete ops against a real S3-compatible server — minio —
 * so the actual AWS SDK wire calls, streaming, and byte round-trip are covered.
 *
 * OPT-IN: runs only when `CIVIC_TEST_LIVE_S3=1`, so normal CI stays hermetic
 * (no server required). To run it:
 *
 *   # 1. start minio (any S3-compatible server works)
 *   minio server /tmp/minio-data --address :9000    # user/pass minioadmin
 *   # 2. run the suite
 *   CIVIC_TEST_LIVE_S3=1 npx vitest run modules/storage/src/__tests__/live-s3-minio.test.ts
 *
 * Overridable env (defaults target a local minio):
 *   CIVIC_TEST_S3_ENDPOINT   default http://127.0.0.1:9000
 *   S3_ACCESS_KEY_ID         default minioadmin
 *   S3_SECRET_ACCESS_KEY     default minioadmin
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import {
  S3Client,
  CreateBucketCommand,
  HeadBucketCommand,
} from '@aws-sdk/client-s3';
import { CloudUuidStorageService } from '../cloud-uuid-storage-service.js';
import type {
  StorageConfig,
  StorageProvider,
  StorageFile,
  MulterFile,
  StorageDatabaseService,
} from '../types/storage.types.js';

const LIVE = process.env.CIVIC_TEST_LIVE_S3 === '1';
const ENDPOINT = process.env.CIVIC_TEST_S3_ENDPOINT || 'http://127.0.0.1:9000';
const ACCESS = process.env.S3_ACCESS_KEY_ID || 'minioadmin';
const SECRET = process.env.S3_SECRET_ACCESS_KEY || 'minioadmin';
const BUCKET = 'civic-live-test';

// Minimal in-memory DB double — only the methods the ops touch.
class MockDb {
  private files = new Map<string, StorageFile>();
  async createStorageFile(f: StorageFile) {
    this.files.set(f.id, f);
  }
  async getStorageFileById(id: string) {
    return this.files.get(id) ?? null;
  }
  async getStorageFilesByFolder(folder: string) {
    return [...this.files.values()].filter((f) => f.folder === folder);
  }
  async deleteStorageFile(id: string) {
    return this.files.delete(id);
  }
}

const silentLogger = () =>
  ({ debug() {}, info() {}, warn() {}, error() {} }) as never;

function multerFile(
  originalname: string,
  buffer: Buffer,
  mimetype = 'application/octet-stream'
): MulterFile {
  return {
    fieldname: 'file',
    originalname,
    encoding: '7bit',
    mimetype,
    size: buffer.length,
    destination: '',
    filename: originalname,
    path: '',
    buffer,
  };
}

describe.skipIf(!LIVE)('S3 live integration (minio)', () => {
  let service: CloudUuidStorageService;
  let dir = '';

  beforeAll(async () => {
    const client = new S3Client({
      region: 'us-east-1',
      endpoint: ENDPOINT,
      forcePathStyle: true,
      credentials: { accessKeyId: ACCESS, secretAccessKey: SECRET },
    });

    // Ensure the bucket exists (idempotent).
    try {
      await client.send(new HeadBucketCommand({ Bucket: BUCKET }));
    } catch {
      await client.send(new CreateBucketCommand({ Bucket: BUCKET }));
    }

    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'civic-live-s3-'));
    const provider: StorageProvider = {
      type: 's3',
      enabled: true,
      region: 'us-east-1',
      bucket: BUCKET,
      endpoint: ENDPOINT,
      options: { force_path_style: true },
    } as StorageProvider;

    const config = {
      backend: { type: 'local' },
      active_provider: 's3',
      providers: {
        local: { type: 'local', enabled: true, path: 'storage' },
        s3: provider,
      },
      folders: {
        public: {
          path: 'public',
          access: 'public',
          allowed_types: ['*'],
          max_size: '100MB',
        },
      },
      global: { circuit_breaker_enabled: false, quota_enforcement: false },
      metadata: {},
    } as unknown as StorageConfig;

    service = new CloudUuidStorageService(config, dir);
    service.logger = silentLogger();
    service.setDatabaseService(new MockDb() as unknown as StorageDatabaseService);
    // Drive the real ops against minio through the same public field the mocked
    // suite uses — no fake `send`, so the actual SDK PUT/GET/DELETE hit the wire.
    service.s3Client = client as never;
  });

  afterAll(async () => {
    if (dir) await fs.rm(dir, { recursive: true, force: true });
  });

  it('round-trips a file end to end: upload → getFileContent → delete', async () => {
    const payload = Buffer.from(
      'civic live storage payload — real minio round-trip 🏛️'
    );

    const res = await service.uploadFile({
      file: multerFile('live.txt', payload, 'text/plain'),
      folder: 'public',
      uploaded_by: 'live-test',
    });
    expect(res.success).toBe(true);
    expect(res.file!.provider_path).toMatch(
      /^s3:\/\/civic-live-test\/public\//
    );

    // Read the bytes back out of minio.
    const got = await service.getFileContent(res.file!.id);
    expect(got).toEqual(payload);

    // Delete and confirm it's gone.
    const deleted = await service.deleteFile(res.file!.id);
    expect(deleted).toBe(true);
    expect(await service.getFileById(res.file!.id)).toBeNull();
  });

  it('lists an uploaded object then cleans it up', async () => {
    const res = await service.uploadFile({
      file: multerFile('listed.bin', Buffer.from([1, 2, 3, 4]), 'application/octet-stream'),
      folder: 'public',
    });
    expect(res.success).toBe(true);

    const listed = await service.listFiles('public');
    expect(listed.some((f) => f.id === res.file!.id)).toBe(true);

    await service.deleteFile(res.file!.id);
  });
});
