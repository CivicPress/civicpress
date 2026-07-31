/**
 * Unit tests for the cloud-provider storage operations (S3 / Azure / GCS).
 *
 * Coverage gap closed: every existing storage test drives `active_provider:
 * 'local'`, so the S3/Azure/GCS upload/download/delete/stream code in
 * `cloud-uuid-storage/{upload,download,file-mgmt,streaming}-ops.ts` had ZERO
 * coverage even though it is real SDK code now reachable via the API (the
 * `storage.yml`-is-applied fix). These tests exercise it with fake SDK clients
 * injected on the host so they run hermetically — the Azure/GCS SDKs are
 * `optionalDependencies` and are frequently not installed.
 *
 * Strategy:
 *   - The per-provider clients (`s3Client` / `azureContainerClient` /
 *     `gcsBucket`) are PUBLIC fields on the orchestrator; we set fakes on them
 *     directly, so the provider-init path is not exercised here (that has its
 *     own suite in `provider-init.test.ts`).
 *   - S3 ops additionally call `loadAwsS3Sdk()` for the command classes, so we
 *     mock the sdk-loader to hand back fake `PutObjectCommand` /
 *     `GetObjectCommand` / `DeleteObjectCommand` that just capture their input.
 *   - Circuit breaker + quota are disabled in config so each test isolates the
 *     provider op itself (both have their own suites).
 */

import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { Readable, Writable } from 'stream';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { CloudUuidStorageService } from '../cloud-uuid-storage-service.js';
import type {
  StorageConfig,
  StorageProvider,
  StorageFile,
  MulterFile,
  StorageDatabaseService,
} from '../types/storage.types.js';

// Mock the SDK loader so S3 ops get fake command classes (and Azure/GCS loaders
// resolve harmlessly). The command classes just record their `input` so tests
// can assert on the exact SDK call the op built.
vi.mock('../cloud-uuid-storage/sdk-loader.js', () => {
  class PutObjectCommand {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  }
  class GetObjectCommand {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  }
  class DeleteObjectCommand {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  }
  const awsMod = { PutObjectCommand, GetObjectCommand, DeleteObjectCommand };
  return {
    loadAwsS3Sdk: async () => awsMod,
    loadAzureBlobSdk: async () => ({}),
    loadGcsStorageSdk: async () => ({}),
  };
});

// ----- Test doubles -------------------------------------------------------

// In-memory database double implementing only the methods the ops call.
class MockDatabaseService {
  private files = new Map<string, StorageFile>();

  seed(file: StorageFile): void {
    this.files.set(file.id, file);
  }
  async createStorageFile(file: StorageFile): Promise<void> {
    this.files.set(file.id, file);
  }
  async getStorageFileById(id: string): Promise<StorageFile | null> {
    return this.files.get(id) ?? null;
  }
  async getStorageFilesByFolder(folder: string): Promise<StorageFile[]> {
    return [...this.files.values()].filter((f) => f.folder === folder);
  }
  async deleteStorageFile(id: string): Promise<boolean> {
    return this.files.delete(id);
  }
}

const silentLogger = () =>
  ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) as never;

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

const tempDirs: string[] = [];

async function newService(
  active: 's3' | 'azure' | 'gcs',
  provider: StorageProvider
): Promise<{ service: CloudUuidStorageService; db: MockDatabaseService }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'civicpress-cloud-ops-'));
  tempDirs.push(dir);
  const config: StorageConfig = {
    backend: { type: 'local' },
    active_provider: active,
    providers: {
      local: { type: 'local', enabled: true, path: 'storage' },
      [active]: provider,
    },
    folders: {
      public: {
        path: 'public',
        access: 'public',
        allowed_types: ['*'],
        max_size: '100MB',
      },
    },
    // Isolate the provider op from the breaker + quota layers (both tested
    // separately) so a single op maps to a single SDK call.
    global: { circuit_breaker_enabled: false, quota_enforcement: false },
    metadata: {},
  } as unknown as StorageConfig;

  const service = new CloudUuidStorageService(config, dir);
  service.logger = silentLogger();
  const db = new MockDatabaseService();
  service.setDatabaseService(db as unknown as StorageDatabaseService);
  return { service, db };
}

// Fake S3 client: a `send` that drains a streamed Body (so the streaming
// byte-counter sees the bytes) and otherwise returns whatever the test wants.
function injectS3(
  service: CloudUuidStorageService,
  sendImpl?: (cmd: { input: { Body?: unknown } }) => Promise<unknown>
) {
  const send = vi.fn(
    sendImpl ??
      (async (cmd: { input: { Body?: unknown } }) => {
        const body = cmd?.input?.Body as Readable | undefined;
        if (body && typeof (body as Readable).pipe === 'function') {
          for await (const _chunk of body) void _chunk; // drain
        }
        return {};
      })
  );
  service.s3Client = { send } as never;
  return { send };
}

function injectAzure(service: CloudUuidStorageService) {
  const uploadData = vi.fn().mockResolvedValue(undefined);
  const uploadStream = vi.fn(async (stream: Readable) => {
    if (stream && typeof stream.pipe === 'function') {
      for await (const _chunk of stream) void _chunk; // drain
    }
  });
  const download = vi.fn();
  const deleteIfExists = vi.fn().mockResolvedValue({ succeeded: true });
  const blockBlob = { uploadData, uploadStream, download, deleteIfExists };
  const getBlockBlobClient = vi.fn(() => blockBlob);
  service.azureContainerClient = { getBlockBlobClient } as never;
  return { uploadData, uploadStream, download, deleteIfExists, getBlockBlobClient };
}

function injectGCS(service: CloudUuidStorageService) {
  const save = vi.fn().mockResolvedValue(undefined);
  const exists = vi.fn(async () => [true]);
  const download = vi.fn(async () => [Buffer.from('')]);
  const del = vi.fn().mockResolvedValue(undefined);
  const createWriteStream = vi.fn(
    () => new Writable({ write(_c, _e, cb) { cb(); } })
  );
  const gcsFile = { save, exists, download, delete: del, createWriteStream };
  const file = vi.fn(() => gcsFile);
  service.gcsBucket = { file } as never;
  return { save, exists, download, del, createWriteStream, file };
}

function seedFile(
  db: MockDatabaseService,
  providerPath: string,
  overrides: Partial<StorageFile> = {}
): string {
  const id = 'file-' + Math.abs(hashCode(providerPath)).toString(16);
  db.seed({
    id,
    original_name: 'seed',
    stored_filename: 'seed',
    folder: 'public',
    relative_path: 'public/seed',
    provider_path: providerPath,
    size: 0,
    mime_type: 'application/octet-stream',
    ...overrides,
  });
  return id;
}

// Deterministic id derivation (Math.random is unavailable in some sandboxes and
// we want stable ids anyway).
function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i);
  return h;
}

afterAll(async () => {
  await Promise.all(
    tempDirs.map((d) => fs.rm(d, { recursive: true, force: true }))
  );
});

beforeEach(() => {
  vi.clearAllMocks();
});

// ==========================================================================
// S3
// ==========================================================================

describe('S3 provider ops', () => {
  const provider: StorageProvider = {
    type: 's3',
    enabled: true,
    region: 'us-east-1',
    bucket: 'my-bucket',
  };

  it('uploadFile PUTs the object and returns an s3:// provider_path', async () => {
    const { service, db } = await newService('s3', provider);
    const { send } = injectS3(service);

    const res = await service.uploadFile({
      file: multerFile('doc.txt', Buffer.from('hello'), 'text/plain'),
      folder: 'public',
      uploaded_by: 'u1',
    });

    expect(res.success).toBe(true);
    const key = `public/${res.file!.stored_filename}`;
    expect(res.file!.provider_path).toBe(`s3://my-bucket/${key}`);

    expect(send).toHaveBeenCalledTimes(1);
    const cmd = send.mock.calls[0][0] as { constructor: { name: string }; input: any };
    expect(cmd.constructor.name).toBe('PutObjectCommand');
    expect(cmd.input).toMatchObject({
      Bucket: 'my-bucket',
      Key: key,
      ContentType: 'text/plain',
    });
    expect(cmd.input.Body).toEqual(Buffer.from('hello'));
    expect(cmd.input.Metadata.originalName).toBe('doc.txt');

    // DB row persisted with the provider path.
    const row = await db.getStorageFileById(res.file!.id);
    expect(row?.provider_path).toBe(res.file!.provider_path);
  });

  it('uploadFile honors provider.prefix in the object key', async () => {
    const { service } = await newService('s3', { ...provider, prefix: 'org1' });
    const { send } = injectS3(service);

    const res = await service.uploadFile({
      file: multerFile('a.txt', Buffer.from('x'), 'text/plain'),
      folder: 'public',
    });

    const cmd = send.mock.calls[0][0] as { input: any };
    expect(cmd.input.Key).toBe(`org1/public/${res.file!.stored_filename}`);
    expect(res.file!.provider_path).toBe(
      `s3://my-bucket/org1/public/${res.file!.stored_filename}`
    );
  });

  it('getFileContent uses transformToByteArray when available', async () => {
    const { service, db } = await newService('s3', provider);
    const id = seedFile(db, 's3://my-bucket/public/key.txt');
    injectS3(service, async () => ({
      Body: {
        transformToByteArray: async () => new Uint8Array(Buffer.from('data')),
      },
    }));

    const buf = await service.getFileContent(id);
    expect(buf).toEqual(Buffer.from('data'));
  });

  it('getFileContent falls back to async-iterating the Body stream', async () => {
    const { service, db } = await newService('s3', provider);
    const id = seedFile(db, 's3://my-bucket/public/key.txt');
    async function* body() {
      yield new Uint8Array(Buffer.from('ab'));
      yield new Uint8Array(Buffer.from('cd'));
    }
    const { send } = injectS3(service, async () => ({ Body: body() }));

    const buf = await service.getFileContent(id);
    expect(buf).toEqual(Buffer.from('abcd'));
    const cmd = send.mock.calls[0][0] as { constructor: { name: string }; input: any };
    expect(cmd.constructor.name).toBe('GetObjectCommand');
    expect(cmd.input).toMatchObject({ Bucket: 'my-bucket', Key: 'public/key.txt' });
  });

  it('getFileContent returns null when the object is absent (no Body)', async () => {
    const { service, db } = await newService('s3', provider);
    const id = seedFile(db, 's3://my-bucket/public/key.txt');
    injectS3(service, async () => ({})); // no Body

    expect(await service.getFileContent(id)).toBeNull();
  });

  it('deleteFile DELETEs the object and removes the DB row', async () => {
    const { service, db } = await newService('s3', provider);
    const id = seedFile(db, 's3://my-bucket/public/key.txt');
    const { send } = injectS3(service);

    const ok = await service.deleteFile(id, 'u1');
    expect(ok).toBe(true);
    const cmd = send.mock.calls[0][0] as { constructor: { name: string }; input: any };
    expect(cmd.constructor.name).toBe('DeleteObjectCommand');
    expect(cmd.input).toMatchObject({ Bucket: 'my-bucket', Key: 'public/key.txt' });
    expect(await db.getStorageFileById(id)).toBeNull();
  });

  it('downloadFileStream returns the Body stream and builds a Range header', async () => {
    const { service, db } = await newService('s3', provider);
    const id = seedFile(db, 's3://my-bucket/public/key.txt');
    const body = Readable.from([Buffer.from('streamed')]);
    const { send } = injectS3(service, async () => ({ Body: body }));

    const stream = await service.downloadFileStream(id, { start: 0, end: 99 });
    expect(stream).toBe(body);
    const cmd = send.mock.calls[0][0] as { input: any };
    expect(cmd.input.Range).toBe('bytes=0-99');
  });

  it('uploadFileStream streams to S3 and records the counted byte size', async () => {
    const { service } = await newService('s3', provider);
    const { send } = injectS3(service);

    const payload = Buffer.from('streamed-body-bytes');
    const res = await service.uploadFileStream({
      stream: Readable.from([payload]),
      filename: 's.bin',
      folder: 'public',
      size: payload.length,
      contentType: 'application/octet-stream',
      uploaded_by: 'u1',
    });

    expect(res.success).toBe(true);
    expect(res.file!.provider_path).toBe(
      `s3://my-bucket/public/${res.file!.stored_filename}`
    );
    expect(res.file!.size).toBe(payload.length);
    const cmd = send.mock.calls[0][0] as { constructor: { name: string } };
    expect(cmd.constructor.name).toBe('PutObjectCommand');
  });
});

// ==========================================================================
// Azure Blob
// ==========================================================================

describe('Azure provider ops', () => {
  const provider: StorageProvider = {
    type: 'azure',
    enabled: true,
    account_name: 'acct',
    container_name: 'cont',
  };

  it('uploadFile uploads block-blob data and returns an azure:// path', async () => {
    const { service } = await newService('azure', provider);
    const { uploadData, getBlockBlobClient } = injectAzure(service);

    const res = await service.uploadFile({
      file: multerFile('a.png', Buffer.from('img'), 'image/png'),
      folder: 'public',
    });

    expect(res.success).toBe(true);
    const blob = `public/${res.file!.stored_filename}`;
    expect(res.file!.provider_path).toBe(`azure://acct/cont/${blob}`);
    expect(getBlockBlobClient).toHaveBeenCalledWith(blob);
    const [buf, opts] = uploadData.mock.calls[0];
    expect(buf).toEqual(Buffer.from('img'));
    expect(opts.blobHTTPHeaders.blobContentType).toBe('image/png');
    expect(opts.tier).toBe('Hot');
    expect(opts.metadata.originalName).toBe('a.png');
  });

  it('uploadFile honors a custom access_tier', async () => {
    const { service } = await newService('azure', {
      ...provider,
      options: { access_tier: 'Cool' },
    });
    const { uploadData } = injectAzure(service);

    await service.uploadFile({
      file: multerFile('a.png', Buffer.from('img'), 'image/png'),
      folder: 'public',
    });
    expect(uploadData.mock.calls[0][1].tier).toBe('Cool');
  });

  it('getFileContent concatenates the readable stream body', async () => {
    const { service, db } = await newService('azure', provider);
    const id = seedFile(db, 'azure://acct/cont/key.png');
    const { download, getBlockBlobClient } = injectAzure(service);
    download.mockResolvedValue({
      readableStreamBody: Readable.from([Buffer.from('azure'), Buffer.from('data')]),
    });

    const buf = await service.getFileContent(id);
    expect(buf).toEqual(Buffer.from('azuredata'));
    expect(getBlockBlobClient).toHaveBeenCalledWith('key.png');
  });

  it('getFileContent returns null when the blob has no body', async () => {
    const { service, db } = await newService('azure', provider);
    const id = seedFile(db, 'azure://acct/cont/key.png');
    const { download } = injectAzure(service);
    download.mockResolvedValue({ readableStreamBody: undefined });

    expect(await service.getFileContent(id)).toBeNull();
  });

  it('deleteFile calls deleteIfExists and removes the DB row', async () => {
    const { service, db } = await newService('azure', provider);
    const id = seedFile(db, 'azure://acct/cont/key.png');
    const { deleteIfExists } = injectAzure(service);

    expect(await service.deleteFile(id)).toBe(true);
    expect(deleteIfExists).toHaveBeenCalledTimes(1);
    expect(await db.getStorageFileById(id)).toBeNull();
  });

  it('downloadFileStream maps range to (offset, count)', async () => {
    const { service, db } = await newService('azure', provider);
    const id = seedFile(db, 'azure://acct/cont/key.png');
    const body = Readable.from([Buffer.from('x')]);
    const { download } = injectAzure(service);
    download.mockResolvedValue({ readableStreamBody: body });

    const stream = await service.downloadFileStream(id, { start: 10, end: 19 });
    expect(stream).toBe(body);
    // count = end - start + 1 = 10
    expect(download).toHaveBeenCalledWith(10, 10);
  });

  it('uploadFileStream streams to Azure and records the counted size', async () => {
    const { service } = await newService('azure', provider);
    const { uploadStream } = injectAzure(service);

    const payload = Buffer.from('azure-stream-payload');
    const res = await service.uploadFileStream({
      stream: Readable.from([payload]),
      filename: 's.bin',
      folder: 'public',
      size: payload.length,
    });

    expect(res.success).toBe(true);
    expect(res.file!.provider_path).toBe(
      `azure://acct/cont/public/${res.file!.stored_filename}`
    );
    expect(res.file!.size).toBe(payload.length);
    expect(uploadStream).toHaveBeenCalledTimes(1);
  });
});

// ==========================================================================
// Google Cloud Storage
// ==========================================================================

describe('GCS provider ops', () => {
  const provider: StorageProvider = {
    type: 'gcs',
    enabled: true,
    bucket: 'gbucket',
    project_id: 'proj',
  };

  it('uploadFile saves the object and returns a gs:// path', async () => {
    const { service } = await newService('gcs', provider);
    const { save, file } = injectGCS(service);

    const res = await service.uploadFile({
      file: multerFile('r.json', Buffer.from('{}'), 'application/json'),
      folder: 'public',
    });

    expect(res.success).toBe(true);
    const name = `public/${res.file!.stored_filename}`;
    expect(res.file!.provider_path).toBe(`gs://gbucket/${name}`);
    expect(file).toHaveBeenCalledWith(name);
    const [buf, opts] = save.mock.calls[0];
    expect(buf).toEqual(Buffer.from('{}'));
    expect(opts.metadata.contentType).toBe('application/json');
    expect(opts.metadata.metadata.originalName).toBe('r.json');
  });

  it('getFileContent downloads when the object exists', async () => {
    const { service, db } = await newService('gcs', provider);
    const id = seedFile(db, 'gs://gbucket/key.json');
    const { exists, download, file } = injectGCS(service);
    exists.mockResolvedValue([true]);
    download.mockResolvedValue([Buffer.from('gcsdata')]);

    const buf = await service.getFileContent(id);
    expect(buf).toEqual(Buffer.from('gcsdata'));
    expect(file).toHaveBeenCalledWith('key.json');
  });

  it('getFileContent returns null when the object does not exist', async () => {
    const { service, db } = await newService('gcs', provider);
    const id = seedFile(db, 'gs://gbucket/key.json');
    const { exists } = injectGCS(service);
    exists.mockResolvedValue([false]);

    expect(await service.getFileContent(id)).toBeNull();
  });

  it('deleteFile deletes the object and removes the DB row', async () => {
    const { service, db } = await newService('gcs', provider);
    const id = seedFile(db, 'gs://gbucket/key.json');
    const { del } = injectGCS(service);

    expect(await service.deleteFile(id)).toBe(true);
    expect(del).toHaveBeenCalledTimes(1);
    expect(await db.getStorageFileById(id)).toBeNull();
  });

  it('uploadFileStream streams to GCS via createWriteStream', async () => {
    const { service } = await newService('gcs', provider);
    const { createWriteStream } = injectGCS(service);

    const payload = Buffer.from('gcs-stream-payload');
    const res = await service.uploadFileStream({
      stream: Readable.from([payload]),
      filename: 'g.bin',
      folder: 'public',
      size: payload.length,
    });

    expect(res.success).toBe(true);
    expect(res.file!.provider_path).toBe(
      `gs://gbucket/public/${res.file!.stored_filename}`
    );
    expect(res.file!.size).toBe(payload.length);
    expect(createWriteStream).toHaveBeenCalledTimes(1);
  });

  it('downloadFileStream is unsupported for GCS and resolves to null', async () => {
    // The streaming-download switch handles local/s3/azure only; GCS hits the
    // default `throw`, which the outer catch turns into a null return. Pinned
    // here so the limitation is explicit rather than silent.
    const { service, db } = await newService('gcs', provider);
    const id = seedFile(db, 'gs://gbucket/key.json');
    injectGCS(service);

    expect(await service.downloadFileStream(id)).toBeNull();
  });
});
