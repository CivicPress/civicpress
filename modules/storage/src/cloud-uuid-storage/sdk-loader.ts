/**
 * Lazy loader for the cloud-provider SDKs.
 *
 * Phase 2d W4-T1: AWS / Azure / GCS SDKs are declared in
 * `package.json` `optionalDependencies` so installs without cloud features
 * (e.g. `pnpm install --no-optional`) don't pull them. Consumers must call
 * `loadAwsS3Sdk()` / `loadAzureBlobSdk()` / `loadGcsStorageSdk()` instead of
 * importing the SDK directly. Type-only imports (`import type { ... }`) at
 * call sites are fine because they're erased at runtime.
 *
 * Each loader is memoised: the dynamic `import()` resolves once per process
 * and subsequent calls hit the cached module. Missing SDKs throw
 * `OptionalDependencyMissing` with a clear `pnpm add ...` remediation path.
 */

import { OptionalDependencyMissing } from '@civicpress/core';

let awsS3Module: typeof import('@aws-sdk/client-s3') | null = null;
let azureBlobModule: typeof import('@azure/storage-blob') | null = null;
let gcsStorageModule: typeof import('@google-cloud/storage') | null = null;

export async function loadAwsS3Sdk(): Promise<
  typeof import('@aws-sdk/client-s3')
> {
  if (awsS3Module) return awsS3Module;
  try {
    awsS3Module = await import('@aws-sdk/client-s3');
    return awsS3Module;
  } catch {
    throw new OptionalDependencyMissing(
      '@aws-sdk/client-s3',
      'S3 storage provider'
    );
  }
}

export async function loadAzureBlobSdk(): Promise<
  typeof import('@azure/storage-blob')
> {
  if (azureBlobModule) return azureBlobModule;
  try {
    azureBlobModule = await import('@azure/storage-blob');
    return azureBlobModule;
  } catch {
    throw new OptionalDependencyMissing(
      '@azure/storage-blob',
      'Azure Blob storage provider'
    );
  }
}

export async function loadGcsStorageSdk(): Promise<
  typeof import('@google-cloud/storage')
> {
  if (gcsStorageModule) return gcsStorageModule;
  try {
    gcsStorageModule = await import('@google-cloud/storage');
    return gcsStorageModule;
  } catch {
    throw new OptionalDependencyMissing(
      '@google-cloud/storage',
      'Google Cloud Storage provider'
    );
  }
}
