import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import {
  BackupService,
  type BackupCreateResult,
  DatabaseService,
  DatabaseConfig,
} from '@civicpress/core';

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
    const {
      dataDir,
      systemDataDir,
      storageFilePaths,
      outputDir,
      recordPath,
      dbConfig,
    } = await createFixtureLayout(tempRoot);

    const result = await BackupService.createBackup({
      dataDir,
      systemDataDir,
      outputDir,
      includeStorage: true,
      includeGitBundle: false,
      version: 'test-version',
      databaseConfig: dbConfig,
    });

    await assertBackup(result, storageFilePaths, recordPath);
  });

  it('restores a previously created backup', async () => {
    const {
      dataDir,
      systemDataDir,
      storageFilePaths,
      outputDir,
      recordPath,
      dbConfig,
    } = await createFixtureLayout(tempRoot);

    const createResult = await BackupService.createBackup({
      dataDir,
      systemDataDir,
      outputDir,
      includeStorage: true,
      includeGitBundle: false,
      databaseConfig: dbConfig,
    });

    const restoreTarget = path.join(tempRoot, 'restore', 'data');
    const restoreSystem = path.join(tempRoot, 'restore', 'system-data');

    // Create a new database config for restore (simulating different location)
    const restoreDbConfig: DatabaseConfig = {
      type: 'sqlite',
      sqlite: {
        file: path.join(restoreSystem, 'civic.db'),
      },
    };

    const restoreResult = await BackupService.restoreBackup({
      backupDir: createResult.backupDir,
      dataDir: restoreTarget,
      systemDataDir: restoreSystem,
      restoreStorage: true,
      overwrite: true,
      databaseConfig: restoreDbConfig,
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

  it('exports storage-files.json when database config is provided', async () => {
    const { dataDir, systemDataDir, outputDir, dbConfig } =
      await createFixtureLayout(tempRoot);

    // Create some storage file records in the database
    const dbService = new DatabaseService(dbConfig);
    await dbService.initialize();
    await dbService.createStorageFile({
      id: 'test-uuid-1',
      original_name: 'test-file.txt',
      stored_filename: 'test-file.test-uuid-1.txt',
      folder: 'public',
      relative_path: 'public/test-file.test-uuid-1.txt',
      provider_path: path.join(
        systemDataDir,
        'storage',
        'public',
        'test-file.test-uuid-1.txt'
      ),
      size: 1024,
      mime_type: 'text/plain',
      description: 'Test file',
      uploaded_by: 'admin',
    });

    // Verify the file was created
    const allFiles = await dbService.getAllStorageFiles();
    expect(allFiles.length).toBeGreaterThan(0);

    await dbService.close(); // Close connection so backup can access it

    // Verify database file exists
    const dbPath = (dbConfig.sqlite as any).file;
    expect(await pathExists(dbPath)).toBe(true);

    const result = await BackupService.createBackup({
      dataDir,
      systemDataDir,
      outputDir,
      includeStorage: true,
      includeGitBundle: false,
      databaseConfig: dbConfig,
    });

    // Check warnings for any errors
    if (result.warnings.length > 0) {
      console.log('Backup warnings:', result.warnings);
    }

    expect(result.storageFilesExported).toBe(true);
    const storageFilesPath = path.join(result.backupDir, 'storage-files.json');
    expect(await pathExists(storageFilesPath)).toBe(true);

    const storageFilesContent = JSON.parse(
      await fs.readFile(storageFilesPath, 'utf8')
    );

    expect(storageFilesContent.schema.table).toBe('storage_files');
    expect(storageFilesContent.schema.version).toBe('1.0.0');
    expect(Array.isArray(storageFilesContent.data)).toBe(true);
    expect(storageFilesContent.data.length).toBeGreaterThan(0);

    const testFile = storageFilesContent.data.find(
      (f: any) => f.id === 'test-uuid-1'
    );
    expect(testFile).toBeDefined();
    expect(testFile.original_name).toBe('test-file.txt');
    expect(testFile.folder).toBe('public');
    expect(result.storageFilesExported).toBe(true);
  });

  it('exports storage-config.json with minimal configuration', async () => {
    const { dataDir, systemDataDir, outputDir, dbConfig } =
      await createFixtureLayout(tempRoot);

    // Verify storage config file exists before backup
    const sourceStorageConfigPath = path.join(systemDataDir, 'storage.yml');
    expect(await pathExists(sourceStorageConfigPath)).toBe(true);

    const result = await BackupService.createBackup({
      dataDir,
      systemDataDir,
      outputDir,
      includeStorage: true,
      includeGitBundle: false,
      databaseConfig: dbConfig,
    });

    // Check if storage config was exported
    expect(result.storageConfigExported).toBe(true);

    const storageConfigPath = path.join(
      result.backupDir,
      'storage-config.json'
    );
    expect(await pathExists(storageConfigPath)).toBe(true);

    const storageConfigContent = JSON.parse(
      await fs.readFile(storageConfigPath, 'utf8')
    );

    expect(storageConfigContent.schema.version).toBe('1.0.0');
    expect(storageConfigContent.folders).toBeDefined();
    expect(storageConfigContent.folders.public).toBeDefined();
    expect(storageConfigContent.folders.public.path).toBe('public');
    expect(storageConfigContent.folders.public.access).toBeDefined();
    // Should not contain credentials
    expect(storageConfigContent.providers).toBeUndefined();
  });

  it('restores storage files from JSON and updates provider_path', async () => {
    const { dataDir, systemDataDir, outputDir, dbConfig } =
      await createFixtureLayout(tempRoot);

    // Create storage file records
    const dbService = new DatabaseService(dbConfig);
    await dbService.initialize();
    await dbService.createStorageFile({
      id: 'restore-test-uuid',
      original_name: 'restore-test.txt',
      stored_filename: 'restore-test.restore-test-uuid.txt',
      folder: 'public',
      relative_path: 'public/restore-test.restore-test-uuid.txt',
      provider_path: path.join(
        systemDataDir,
        'storage',
        'public',
        'restore-test.restore-test-uuid.txt'
      ),
      size: 2048,
      mime_type: 'text/plain',
      description: 'File to restore',
    });
    await dbService.close(); // Close connection so backup can access it

    const createResult = await BackupService.createBackup({
      dataDir,
      systemDataDir,
      outputDir,
      includeStorage: true,
      includeGitBundle: false,
      databaseConfig: dbConfig,
    });

    const restoreTarget = path.join(tempRoot, 'restore', 'data');
    const restoreSystem = path.join(tempRoot, 'restore', 'system-data');

    // Create storage config for restore location
    await fs.mkdir(restoreSystem, { recursive: true });
    const restoreStorageConfig = `
providers:
  local:
    type: local
    path: storage
active_provider: local
folders:
  public:
    path: public
`;
    await fs.writeFile(
      path.join(restoreSystem, 'storage.yml'),
      restoreStorageConfig.trimStart(),
      'utf8'
    );

    const restoreDbConfig: DatabaseConfig = {
      type: 'sqlite',
      sqlite: {
        file: path.join(restoreSystem, 'civic.db'),
      },
    };

    const restoreResult = await BackupService.restoreBackup({
      backupDir: createResult.backupDir,
      dataDir: restoreTarget,
      systemDataDir: restoreSystem,
      restoreStorage: true,
      overwrite: true,
      databaseConfig: restoreDbConfig,
    });

    // Verify storage file was restored to database
    const restoreDbService = new DatabaseService(restoreDbConfig);
    await restoreDbService.initialize();
    const restoredFile =
      await restoreDbService.getStorageFileById('restore-test-uuid');

    expect(restoredFile).toBeDefined();
    expect(restoredFile.original_name).toBe('restore-test.txt');
    expect(restoredFile.folder).toBe('public');
    // Provider path should be updated to new location
    expect(restoredFile.provider_path).toContain(restoreSystem);
    expect(restoredFile.provider_path).toContain('storage/public');
  });

  it('handles duplicate storage files gracefully during restore', async () => {
    const { dataDir, systemDataDir, outputDir, dbConfig } =
      await createFixtureLayout(tempRoot);

    // Create initial backup
    const createResult = await BackupService.createBackup({
      dataDir,
      systemDataDir,
      outputDir,
      includeStorage: true,
      includeGitBundle: false,
      databaseConfig: dbConfig,
    });

    const restoreSystem = path.join(tempRoot, 'restore', 'system-data');
    await fs.mkdir(restoreSystem, { recursive: true });

    const restoreDbConfig: DatabaseConfig = {
      type: 'sqlite',
      sqlite: {
        file: path.join(restoreSystem, 'civic.db'),
      },
    };

    // Restore once
    await BackupService.restoreBackup({
      backupDir: createResult.backupDir,
      dataDir: path.join(tempRoot, 'restore', 'data'),
      systemDataDir: restoreSystem,
      restoreStorage: true,
      overwrite: true,
      databaseConfig: restoreDbConfig,
    });

    // Restore again (should handle duplicates with upsert)
    const restoreResult2 = await BackupService.restoreBackup({
      backupDir: createResult.backupDir,
      dataDir: path.join(tempRoot, 'restore', 'data'),
      systemDataDir: restoreSystem,
      restoreStorage: true,
      overwrite: true,
      databaseConfig: restoreDbConfig,
    });

    // Should not have errors about duplicates
    const duplicateErrors = restoreResult2.warnings.filter((w) =>
      w.includes('UNIQUE constraint')
    );
    expect(duplicateErrors.length).toBe(0);
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
    access: public
    allowed_types: ['txt', 'png']
    max_size: '10MB'
    backup_included: true
`;
  await fs.mkdir(systemDataDir, { recursive: true });
  await fs.writeFile(
    path.join(systemDataDir, 'storage.yml'),
    storageConfig.trimStart(),
    'utf8'
  );

  // Create database config for tests
  const dbConfig: DatabaseConfig = {
    type: 'sqlite',
    sqlite: {
      file: path.join(systemDataDir, 'civic.db'),
    },
  };

  const outputDir = path.join(tempRoot, 'exports', 'backups');

  return {
    dataDir,
    systemDataDir,
    storageFilePaths: [storageFilePath, imageFilePath],
    outputDir,
    recordPath,
    dbConfig,
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

  // Check if storage files and config were exported (if database was available)
  if (result.storageFilesExported) {
    expect(metadata.storage?.filesExported).toBe(true);
  }
  if (result.storageConfigExported) {
    expect(metadata.storage?.configExported).toBe(true);
  }

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
