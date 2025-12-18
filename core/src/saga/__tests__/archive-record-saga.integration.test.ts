/**
 * ArchiveRecordSaga Integration Tests
 *
 * Tests the complete saga flow for archiving records.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CivicPress, CivicPressConfig } from '../../civic-core.js';
import { ArchiveRecordSaga } from '../archive-record-saga.js';
import {
  SagaExecutor,
  SagaStateStore,
  IdempotencyManager,
  ResourceLockManager,
} from '../index.js';
import { DatabaseService } from '../../database/database-service.js';
import { RecordManager } from '../../records/record-manager.js';
import { AuthUser } from '../../auth/auth-service.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';

describe('ArchiveRecordSaga Integration', () => {
  let testDir: string;
  let config: CivicPressConfig;
  let civic: CivicPress;
  let db: DatabaseService;
  let recordManager: RecordManager;
  let sagaExecutor: SagaExecutor;
  let testUser: AuthUser;
  let existingRecordId: string;

  beforeEach(async () => {
    // Create test directory
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'civicpress-saga-test-'));
    await fs.mkdir(path.join(testDir, '.system-data'), { recursive: true });
    await fs.mkdir(path.join(testDir, '.civic'), { recursive: true });
    await fs.mkdir(path.join(testDir, 'records'), { recursive: true });

    // Initialize Git repository
    execSync('git init', { cwd: testDir, stdio: 'ignore' });
    execSync('git config user.name "Test User"', {
      cwd: testDir,
      stdio: 'ignore',
    });
    execSync('git config user.email "test@example.com"', {
      cwd: testDir,
      stdio: 'ignore',
    });

    // Create config
    config = {
      dataDir: testDir,
      database: {
        type: 'sqlite',
        sqlite: {
          file: path.join(testDir, '.system-data', 'test.db'),
        },
      },
    };

    // Initialize CivicPress
    civic = new CivicPress(config);
    await civic.initialize();

    // Get services
    db = civic.getDatabaseService();
    recordManager = civic.getRecordManager();

    // Create saga executor
    const stateStore = new SagaStateStore(db);
    const idempotencyManager = new IdempotencyManager(stateStore);
    const lockManager = new ResourceLockManager(db);
    sagaExecutor = new SagaExecutor(
      stateStore,
      idempotencyManager,
      lockManager
    );

    // Create test user
    testUser = {
      id: 1,
      username: 'testuser',
      role: 'admin',
      email: 'test@example.com',
      name: 'Test User',
    };

    // Create an existing published record for testing
    await recordManager.createRecord(
      {
        title: 'Record to Archive',
        type: 'bylaw',
        content: '# Content to Archive',
        status: 'published',
        metadata: {},
      },
      testUser
    );
    // Get the actual ID that was generated
    const records = await db.query('SELECT id FROM records WHERE title = ?', [
      'Record to Archive',
    ]);
    if (records.length > 0) {
      existingRecordId = records[0].id;
    }
  });

  afterEach(async () => {
    if (civic) {
      try {
        await civic.shutdown();
      } catch (error) {
        // Ignore shutdown errors
      }
    }
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Successful Archive Flow', () => {
    it('should archive a record successfully', async () => {
      // Create saga
      const saga = new ArchiveRecordSaga(
        db,
        recordManager,
        civic.getGitEngine(),
        civic.getHookSystem(),
        testDir
      );

      // Create context
      const context = {
        correlationId: `test-${Date.now()}`,
        startedAt: new Date(),
        recordId: existingRecordId,
        user: testUser,
        metadata: {
          recordId: existingRecordId,
        },
      };

      // Execute saga
      const result = await sagaExecutor.execute(saga, context);

      // Verify saga completed successfully
      expect(result.result).toBe(true);
      expect(result.compensated).toBe(false);

      // Verify record status was updated to archived
      const record = await db.getRecord(existingRecordId);
      expect(record).toBeDefined();
      expect(record?.status).toBe('archived');
      expect(record?.metadata).toBeDefined();
      const metadata = JSON.parse(record.metadata || '{}');
      expect(metadata.archived_by).toBe(testUser.username);
      expect(metadata.archived_at).toBeDefined();

      // Verify file was moved to archive
      const originalPath = context.originalFilePath;
      if (originalPath) {
        const originalFullPath = path.join(testDir, originalPath);
        const originalExists = await fs
          .access(originalFullPath)
          .then(() => true)
          .catch(() => false);
        expect(originalExists).toBe(false); // Original should not exist
      }

      const archivePath = context.archiveFilePath;
      if (archivePath) {
        const archiveFullPath = path.join(testDir, archivePath);
        const archiveExists = await fs
          .access(archiveFullPath)
          .then(() => true)
          .catch(() => false);
        expect(archiveExists).toBe(true); // Archive file should exist
      }

      // Verify Git commit was made
      const git = civic.getGitEngine();
      const history = await git.getHistory(1);
      expect(history.length).toBeGreaterThan(0);
      expect(history[0].message).toContain('Archive record');
    });
  });

  describe('Error Handling', () => {
    it('should handle missing record gracefully', async () => {
      const saga = new ArchiveRecordSaga(
        db,
        recordManager,
        civic.getGitEngine(),
        civic.getHookSystem(),
        testDir
      );

      // Create context with non-existent record ID
      const context = {
        correlationId: `test-error-${Date.now()}`,
        startedAt: new Date(),
        recordId: 'non-existent-record',
        user: testUser,
        metadata: {
          recordId: 'non-existent-record',
        },
      };

      // Execute saga - should fail
      await expect(sagaExecutor.execute(saga, context)).rejects.toThrow();
    });

    it('should validate context before execution', async () => {
      const saga = new ArchiveRecordSaga(
        db,
        recordManager,
        civic.getGitEngine(),
        civic.getHookSystem(),
        testDir
      );

      // Invalid context (missing recordId)
      const invalidContext = {
        correlationId: `test-validation-${Date.now()}`,
        startedAt: new Date(),
        user: testUser,
        metadata: {},
      } as any;

      // Validate context
      const validation = saga.validateContext(invalidContext);
      expect(validation.valid).toBe(false);
      expect(validation.errors).toBeDefined();
      expect(validation.errors?.some((e) => e.includes('recordId'))).toBe(true);
    });
  });

  describe('State Persistence', () => {
    it('should persist saga state during execution', async () => {
      const correlationId = `test-state-${Date.now()}`;

      // Create saga
      const saga = new ArchiveRecordSaga(
        db,
        recordManager,
        civic.getGitEngine(),
        civic.getHookSystem(),
        testDir
      );

      // Create context
      const context = {
        correlationId,
        startedAt: new Date(),
        recordId: existingRecordId,
        user: testUser,
        metadata: {
          recordId: existingRecordId,
        },
      };

      // Execute saga
      const result = await sagaExecutor.execute(saga, context);

      // Verify state was persisted
      const stateStore = new SagaStateStore(db);
      const state = await stateStore.getState(result.sagaId);
      expect(state).toBeDefined();
      expect(state?.sagaType).toBe('ArchiveRecord');
      expect(state?.status).toBe('completed');
      expect(state?.correlationId).toBe(correlationId);
    });
  });
});
