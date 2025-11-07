import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
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
    const { dataDir, systemDataDir, storageFilePath, outputDir } =
      await createFixtureLayout(tempRoot);

    const result = await BackupService.createBackup({
      dataDir,
      systemDataDir,
      outputDir,
      includeStorage: true,
      includeGitBundle: false,
      version: 'test-version',
    });

    await assertBackup(result, storageFilePath);
  });

  it('restores a previously created backup', async () => {
    const { dataDir, systemDataDir, storageFilePath, outputDir } =
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

    expect(restoreResult.metadata?.data.relativePath).toBe('data');
  });
});

async function createFixtureLayout(tempRoot: string) {
  const dataDir = path.join(tempRoot, 'data-src');
  const recordsDir = path.join(dataDir, 'records');
  await fs.mkdir(recordsDir, { recursive: true });
  await fs.writeFile(
    path.join(recordsDir, 'sample.md'),
    '---\ntitle: Test\n---\nContent'
  );

  // Simulate nested git repository by creating .git directory
  await fs.mkdir(path.join(dataDir, '.git'), { recursive: true });

  const systemDataDir = path.join(tempRoot, 'system-data');
  const storageDir = path.join(systemDataDir, 'storage');
  await fs.mkdir(path.join(storageDir, 'public'), { recursive: true });
  const storageFilePath = path.join(storageDir, 'public', 'hello.txt');
  await fs.writeFile(storageFilePath, 'hello');

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

  return { dataDir, systemDataDir, storageFilePath, outputDir };
}

async function assertBackup(
  result: BackupCreateResult,
  storageSourceFile: string
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

  const backedUpStorageFile = path.join(
    result.backupDir,
    'storage',
    'public',
    'hello.txt'
  );

  expect(await pathExists(backedUpStorageFile)).toBe(true);

  const originalContent = await fs.readFile(storageSourceFile, 'utf8');
  const backupContent = await fs.readFile(backedUpStorageFile, 'utf8');
  expect(originalContent).toBe(backupContent);
}
