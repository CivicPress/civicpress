/**
 * Unit tests for the cloud-provider SDK-client bootstrap
 * (`cloud-uuid-storage/provider-init.ts`).
 *
 * Coverage gap closed: the per-provider client construction (credential wiring,
 * Azure connection-string vs shared-key branches, GCS bucket exists/create and
 * keyFilename handling, and every missing-credential error) had no coverage.
 *
 * The cloud SDKs are `optionalDependencies` (often not installed), so we mock
 * the `sdk-loader` to hand back fake constructor classes wired to hoisted spies.
 * That lets us assert exactly how each client is constructed without importing a
 * real SDK, and control the async surfaces (`createIfNotExists`, bucket
 * `exists`/`create`) the init path drives.
 */

import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { CloudUuidStorageService } from '../cloud-uuid-storage-service.js';
import type { StorageConfig, StorageProvider } from '../types/storage.types.js';

// Hoisted spies shared between the mock factory and the tests.
const H = vi.hoisted(() => ({
  s3Ctor: vi.fn(),
  sharedKeyCtor: vi.fn(),
  blobFromConn: vi.fn(),
  blobCtor: vi.fn(),
  getContainerClient: vi.fn(),
  createIfNotExists: vi.fn(),
  storageCtor: vi.fn(),
  bucketFn: vi.fn(),
  bucketExists: vi.fn(),
  bucketCreate: vi.fn(),
}));

vi.mock('../cloud-uuid-storage/sdk-loader.js', () => {
  class S3Client {
    cfg: unknown;
    constructor(cfg: unknown) {
      H.s3Ctor(cfg);
      this.cfg = cfg;
    }
  }
  class StorageSharedKeyCredential {
    constructor(account: string, key: string) {
      H.sharedKeyCtor(account, key);
    }
  }
  class BlobServiceClient {
    static fromConnectionString(cs: string) {
      H.blobFromConn(cs);
      return new BlobServiceClient('__from_conn__');
    }
    constructor(arg1?: unknown, arg2?: unknown) {
      H.blobCtor(arg1, arg2);
      (this as { getContainerClient?: unknown }).getContainerClient = (
        name: string
      ) => {
        H.getContainerClient(name);
        return { createIfNotExists: H.createIfNotExists };
      };
    }
  }
  class Storage {
    opts: unknown;
    constructor(opts: unknown) {
      H.storageCtor(opts);
      this.opts = opts;
      (this as { bucket?: unknown }).bucket = (name: string) => {
        H.bucketFn(name);
        return { name, exists: H.bucketExists, create: H.bucketCreate };
      };
    }
  }
  return {
    loadAwsS3Sdk: async () => ({ S3Client }),
    loadAzureBlobSdk: async () => ({ BlobServiceClient, StorageSharedKeyCredential }),
    loadGcsStorageSdk: async () => ({ Storage }),
  };
});

const silentLogger = () =>
  ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) as never;

function makeService(): {
  service: CloudUuidStorageService;
  getCredentials: ReturnType<typeof vi.fn>;
} {
  const config = {
    backend: { type: 'local' },
    active_provider: 'local',
    providers: {},
    folders: {},
    global: { circuit_breaker_enabled: false },
    metadata: {},
  } as unknown as StorageConfig;
  const service = new CloudUuidStorageService(config, '/tmp/civicpress-init');
  service.logger = silentLogger();
  const getCredentials = vi.fn();
  service.credentialManager = { getCredentials } as never;
  return { service, getCredentials };
}

const tempDirs: string[] = [];
afterAll(async () => {
  await Promise.all(
    tempDirs.map((d) => fs.rm(d, { recursive: true, force: true }))
  );
});

beforeEach(() => {
  vi.clearAllMocks();
  // Re-establish default async behavior (clearAllMocks keeps impls, so reset
  // the stateful ones explicitly for a clean slate each test).
  H.createIfNotExists.mockResolvedValue({});
  H.bucketExists.mockResolvedValue([true]);
  H.bucketCreate.mockResolvedValue(undefined);
});

// ==========================================================================
// S3
// ==========================================================================

describe('initializeS3Storage', () => {
  const provider: StorageProvider = {
    type: 's3',
    enabled: true,
    region: 'eu-west-1',
    bucket: 'b',
  };

  it('constructs the S3 client with region + credentials, forcePathStyle default false', async () => {
    const { service, getCredentials } = makeService();
    getCredentials.mockResolvedValue({ accessKeyId: 'AK', secretAccessKey: 'SK' });

    await service.initializeS3Storage(provider);

    expect(H.s3Ctor).toHaveBeenCalledTimes(1);
    const cfg = H.s3Ctor.mock.calls[0][0] as any;
    expect(cfg.region).toBe('eu-west-1');
    expect(cfg.credentials).toEqual({ accessKeyId: 'AK', secretAccessKey: 'SK' });
    expect(cfg.forcePathStyle).toBe(false);
    expect(cfg.endpoint).toBeUndefined();
    expect(service.s3Client).toBeTruthy();
  });

  it('includes the sessionToken when present', async () => {
    const { service, getCredentials } = makeService();
    getCredentials.mockResolvedValue({
      accessKeyId: 'AK',
      secretAccessKey: 'SK',
      sessionToken: 'ST',
    });

    await service.initializeS3Storage(provider);
    const cfg = H.s3Ctor.mock.calls[0][0] as any;
    expect(cfg.credentials.sessionToken).toBe('ST');
  });

  it('passes a custom endpoint + force_path_style option', async () => {
    const { service, getCredentials } = makeService();
    getCredentials.mockResolvedValue({ accessKeyId: 'AK', secretAccessKey: 'SK' });

    await service.initializeS3Storage({
      ...provider,
      endpoint: 'http://localhost:9000',
      options: { force_path_style: true },
    });
    const cfg = H.s3Ctor.mock.calls[0][0] as any;
    expect(cfg.endpoint).toBe('http://localhost:9000');
    expect(cfg.forcePathStyle).toBe(true);
  });

  it('throws when S3 credentials are missing', async () => {
    const { service, getCredentials } = makeService();
    getCredentials.mockResolvedValue(null);

    await expect(service.initializeS3Storage(provider)).rejects.toThrow(
      'S3 credentials not found'
    );
    expect(H.s3Ctor).not.toHaveBeenCalled();
  });
});

// ==========================================================================
// Azure Blob
// ==========================================================================

describe('initializeAzureStorage', () => {
  it('uses fromConnectionString and ensures the container exists', async () => {
    const { service, getCredentials } = makeService();
    getCredentials.mockResolvedValue({ connectionString: 'conn' });

    await service.initializeAzureStorage({
      type: 'azure',
      enabled: true,
      container_name: 'cont',
    });

    expect(H.blobFromConn).toHaveBeenCalledWith('conn');
    expect(H.getContainerClient).toHaveBeenCalledWith('cont');
    expect(H.createIfNotExists).toHaveBeenCalledTimes(1);
    expect(service.azureContainerClient).toBeTruthy();
  });

  it('uses account name + shared key when there is no connection string', async () => {
    const { service, getCredentials } = makeService();
    getCredentials.mockResolvedValue({ accountKey: 'KEY' });

    await service.initializeAzureStorage({
      type: 'azure',
      enabled: true,
      account_name: 'acct',
      container_name: 'cont',
    });

    expect(H.sharedKeyCtor).toHaveBeenCalledWith('acct', 'KEY');
    // new BlobServiceClient(accountUrl, sharedKeyCredential)
    const [url] = H.blobCtor.mock.calls[0];
    expect(url).toBe('https://acct.blob.core.windows.net');
    expect(service.azureContainerClient).toBeTruthy();
  });

  it('throws when credentials are incomplete (neither connectionString nor key)', async () => {
    const { service, getCredentials } = makeService();
    getCredentials.mockResolvedValue({}); // truthy but empty

    await expect(
      service.initializeAzureStorage({
        type: 'azure',
        enabled: true,
        account_name: 'acct',
        container_name: 'cont',
      })
    ).rejects.toThrow('Azure credentials incomplete');
  });

  it('throws when container_name is missing', async () => {
    const { service, getCredentials } = makeService();
    getCredentials.mockResolvedValue({ connectionString: 'conn' });

    await expect(
      service.initializeAzureStorage({ type: 'azure', enabled: true })
    ).rejects.toThrow('missing container_name');
  });

  it('throws when Azure credentials are missing', async () => {
    const { service, getCredentials } = makeService();
    getCredentials.mockResolvedValue(null);

    await expect(
      service.initializeAzureStorage({
        type: 'azure',
        enabled: true,
        container_name: 'cont',
      })
    ).rejects.toThrow('Azure credentials not found');
  });
});

// ==========================================================================
// Google Cloud Storage
// ==========================================================================

describe('initializeGCSStorage', () => {
  const provider: StorageProvider = {
    type: 'gcs',
    enabled: true,
    bucket: 'gb',
  };

  it('constructs the Storage client with credentials and uses an existing bucket', async () => {
    const { service, getCredentials } = makeService();
    getCredentials.mockResolvedValue({
      projectId: 'p',
      credentials: { client_email: 'x' },
    });
    H.bucketExists.mockResolvedValue([true]);

    await service.initializeGCSStorage(provider);

    expect(H.storageCtor).toHaveBeenCalledTimes(1);
    const opts = H.storageCtor.mock.calls[0][0] as any;
    expect(opts.projectId).toBe('p');
    expect(opts.credentials).toEqual({ client_email: 'x' });
    expect(H.bucketFn).toHaveBeenCalledWith('gb');
    expect(H.bucketCreate).not.toHaveBeenCalled();
    expect(service.gcsBucket).toBeTruthy();
  });

  it('creates the bucket when it does not exist (create_bucket not disabled)', async () => {
    const { service, getCredentials } = makeService();
    getCredentials.mockResolvedValue({ projectId: 'p' });
    H.bucketExists.mockResolvedValue([false]);

    await service.initializeGCSStorage({
      ...provider,
      options: { location: 'EU', storage_class: 'NEARLINE' },
    });

    expect(H.bucketCreate).toHaveBeenCalledWith({
      location: 'EU',
      storageClass: 'NEARLINE',
    });
  });

  it('does NOT throw for a missing bucket when create_bucket is false (assumes it exists)', async () => {
    const { service, getCredentials } = makeService();
    getCredentials.mockResolvedValue({ projectId: 'p' });
    H.bucketExists.mockResolvedValue([false]);

    // The catch swallows the "does not exist" throw when create_bucket:false,
    // logging a warning and proceeding — pinned so the behavior is explicit.
    await expect(
      service.initializeGCSStorage({
        ...provider,
        options: { create_bucket: false },
      })
    ).resolves.toBeUndefined();
    expect(H.bucketCreate).not.toHaveBeenCalled();
    expect(service.gcsBucket).toBeTruthy();
  });

  it('propagates a bucket-existence check failure when create_bucket is not false', async () => {
    const { service, getCredentials } = makeService();
    getCredentials.mockResolvedValue({ projectId: 'p' });
    H.bucketExists.mockRejectedValue(new Error('perm denied'));

    await expect(service.initializeGCSStorage(provider)).rejects.toThrow(
      'perm denied'
    );
  });

  it('throws when GCS credentials are missing', async () => {
    const { service, getCredentials } = makeService();
    getCredentials.mockResolvedValue(null);

    await expect(service.initializeGCSStorage(provider)).rejects.toThrow(
      'GCS credentials not found'
    );
  });

  it('throws when the bucket name is missing', async () => {
    const { service, getCredentials } = makeService();
    getCredentials.mockResolvedValue({ projectId: 'p' });

    await expect(
      service.initializeGCSStorage({ type: 'gcs', enabled: true })
    ).rejects.toThrow('GCS bucket name is required');
  });

  it('throws when the keyFilename does not exist on disk', async () => {
    const { service, getCredentials } = makeService();
    getCredentials.mockResolvedValue({
      projectId: 'p',
      keyFilename: '/nonexistent/key.json',
    });

    await expect(service.initializeGCSStorage(provider)).rejects.toThrow(
      /service account key file not found/
    );
  });

  it('resolves and passes a keyFilename that exists', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'civicpress-gcs-key-'));
    tempDirs.push(dir);
    const keyPath = path.join(dir, 'key.json');
    await fs.writeFile(keyPath, '{}');

    const { service, getCredentials } = makeService();
    getCredentials.mockResolvedValue({ projectId: 'p', keyFilename: keyPath });
    H.bucketExists.mockResolvedValue([true]);

    await service.initializeGCSStorage(provider);
    const opts = H.storageCtor.mock.calls[0][0] as any;
    expect(opts.keyFilename).toBe(keyPath);
  });
});
