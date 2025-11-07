import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { BackupService, type BackupCreateResult } from '@civicpress/core';

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

describe('BackupService', () => {
  let tempRoot: string;

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'civic-backup-'));
  });

  afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it('creates a backup with data and local storage assets', async () => {
    const { dataDir, systemDataDir, storageFilePaths, outputDir, recordPath } =
      await createFixtureLayout(tempRoot);

    const result = await BackupService.createBackup({
      dataDir,
      systemDataDir,
      outputDir,
      includeStorage: true,
      includeGitBundle: false,
      version: 'test-version',
    });

    await assertBackup(result, storageFilePaths, recordPath);
  });

  it('restores a previously created backup', async () => {
    const { dataDir, systemDataDir, storageFilePaths, outputDir, recordPath } =
      await createFixtureLayout(tempRoot);

    const createResult = await BackupService.createBackup({
      dataDir,
      systemDataDir,
      outputDir,
      includeStorage: true,
      includeGitBundle: false,
    });

    const restoreTarget = path.join(tempRoot, 'restore', 'data');
    const restoreSystem = path.join(tempRoot, 'restore', 'system-data');

    const restoreResult = await BackupService.restoreBackup({
      backupDir: createResult.backupDir,
      dataDir: restoreTarget,
      systemDataDir: restoreSystem,
      restoreStorage: true,
      overwrite: true,
    });

    const restoredFile = path.join(restoreTarget, 'records', 'sample.md');
    expect(await pathExists(restoredFile)).toBe(true);

    const restoredStorageFile = path.join(
      restoreSystem,
      'storage',
      'public',
      'hello.txt'
    );
    expect(await pathExists(restoredStorageFile)).toBe(true);

    const restoredImageFile = path.join(
      restoreSystem,
      'storage',
      'public',
      'diagram.png'
    );
    expect(await pathExists(restoredImageFile)).toBe(true);

    const restoredContent = await fs.readFile(restoredFile, 'utf8');
    expect(restoredContent).toContain('![City Map]');
    expect(restoredContent).toContain('diagram.png');

    expect(restoreResult.metadata?.data.relativePath).toBe('data');
  });
});

async function createFixtureLayout(tempRoot: string) {
  const dataDir = path.join(tempRoot, 'data-src');
  const recordsDir = path.join(dataDir, 'records');
  await fs.mkdir(recordsDir, { recursive: true });
  const recordContent = `---
title: Test
---

Meeting minutes with supporting image.

![City Map](../../system-data/storage/public/diagram.png)

Internal attachment reference.
`;
  const recordPath = path.join(recordsDir, 'sample.md');
  await fs.writeFile(recordPath, recordContent);

  // Simulate nested git repository by creating .git directory
  await fs.mkdir(path.join(dataDir, '.git'), { recursive: true });

  const systemDataDir = path.join(tempRoot, 'system-data');
  const storageDir = path.join(systemDataDir, 'storage');
  await fs.mkdir(path.join(storageDir, 'public'), { recursive: true });
  const storageFilePath = path.join(storageDir, 'public', 'hello.txt');
  await fs.writeFile(storageFilePath, 'hello');

  const imageFilePath = path.join(storageDir, 'public', 'diagram.png');
  await fs.writeFile(imageFilePath, 'fake-image-bytes');

  const storageConfig = `
providers:
  local:
    type: local
    path: storage
active_provider: local
folders:
  public:
    path: public
    backup_included: true
`;
  await fs.mkdir(systemDataDir, { recursive: true });
  await fs.writeFile(
    path.join(systemDataDir, 'storage.yml'),
    storageConfig.trimStart(),
    'utf8'
  );

  const outputDir = path.join(tempRoot, 'exports', 'backups');

  return {
    dataDir,
    systemDataDir,
    storageFilePaths: [storageFilePath, imageFilePath],
    outputDir,
    recordPath,
  };
}

async function assertBackup(
  result: BackupCreateResult,
  storageSourceFiles: string[],
  recordSourcePath: string
) {
  const metadataPath = path.join(result.backupDir, 'metadata.json');
  expect(await pathExists(metadataPath)).toBe(true);

  const metadata = JSON.parse(
    await fs.readFile(metadataPath, 'utf8')
  ) as Record<string, any>;

  expect(metadata.data.relativePath).toBe('data');
  expect(metadata.storage?.included).toBe(true);

  const backedUpDataFile = path.join(
    result.backupDir,
    'data',
    'records',
    'sample.md'
  );
  expect(await pathExists(backedUpDataFile)).toBe(true);

  const backedUpMarkdown = await fs.readFile(backedUpDataFile, 'utf8');
  expect(backedUpMarkdown).toContain('diagram.png');

  for (const sourceFile of storageSourceFiles) {
    const filename = path.basename(sourceFile);
    const backedUpStorageFile = path.join(
      result.backupDir,
      'storage',
      'public',
      filename
    );

    expect(await pathExists(backedUpStorageFile)).toBe(true);

    const originalHash = await hashFile(sourceFile);
    const backupHash = await hashFile(backedUpStorageFile);
    expect(originalHash).toBe(backupHash);
  }

  const originalMarkdown = await fs.readFile(recordSourcePath, 'utf8');
  expect(backedUpMarkdown).toBe(originalMarkdown);
}

async function hashFile(filePath: string): Promise<string> {
  const data = await fs.readFile(filePath);
  return crypto.createHash('sha256').update(data).digest('hex');
}
