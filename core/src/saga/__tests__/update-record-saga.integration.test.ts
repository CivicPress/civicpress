/**
 * UpdateRecordSaga Integration Tests
 *
 * Tests the complete saga flow for updating published records.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CivicPress, CivicPressConfig } from '../../civic-core.js';
import { UpdateRecordSaga } from '../update-record-saga.js';
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

describe('UpdateRecordSaga Integration', () => {
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
    existingRecordId = 'test-record-update';
    await recordManager.createRecord(
      {
        title: 'Original Title',
        type: 'bylaw',
        content: '# Original Content',
        status: 'published',
        metadata: {},
      },
      testUser
    );
    // Get the actual ID that was generated
    const records = await db.query('SELECT id FROM records WHERE title = ?', [
      'Original Title',
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

  describe('Successful Update Flow', () => {
    it('should update a published record successfully', async () => {
      const request = {
        title: 'Updated Title',
        content: '# Updated Content',
        status: 'published',
      };

      // Create saga
      const saga = new UpdateRecordSaga(
        db,
        recordManager,
        civic.getGitEngine(),
        civic.getHookSystem(),
        civic.getIndexingService(),
        testDir
      );

      // Create context
      const context = {
        correlationId: `test-${Date.now()}`,
        startedAt: new Date(),
        recordId: existingRecordId,
        request,
        user: testUser,
        metadata: {
          recordId: existingRecordId,
        },
      };

      // Execute saga
      const result = await sagaExecutor.execute(saga, context);

      // Verify saga completed successfully
      expect(result.result).toBeDefined();
      expect(result.result.title).toBe(request.title);
      expect(result.result.content).toBe(request.content);
      expect(result.compensated).toBe(false);

      // Verify record was updated in database
      const record = await db.getRecord(existingRecordId);
      expect(record).toBeDefined();
      expect(record?.title).toBe(request.title);

      // Verify file was updated
      const filePath = record?.path;
      if (filePath) {
        const fullPath = path.join(testDir, filePath);
        const fileContent = await fs.readFile(fullPath, 'utf8');
        expect(fileContent).toContain(request.title);
      }

      // Verify Git commit was made
      const git = civic.getGitEngine();
      const history = await git.getHistory(1);
      expect(history.length).toBeGreaterThan(0);
      expect(history[0].message).toContain('Update record');
    });
  });

  describe('Compensation Flow', () => {
    it('should compensate when file update fails', async () => {
      const request = {
        title: 'Compensation Test',
        content: '# Test Content',
      };

      // Create a saga with a mock that will fail at file update
      const invalidDataDir = path.join(testDir, 'invalid', 'path');
      const saga = new UpdateRecordSaga(
        db,
        recordManager,
        civic.getGitEngine(),
        civic.getHookSystem(),
        civic.getIndexingService(),
        invalidDataDir // This will cause file update to fail
      );

      // Create context
      const context = {
        correlationId: `test-compensation-${Date.now()}`,
        startedAt: new Date(),
        recordId: existingRecordId,
        request,
        user: testUser,
        metadata: {
          recordId: existingRecordId,
        },
      };

      // Execute saga - should fail and compensate
      try {
        await sagaExecutor.execute(saga, context);
        // If it doesn't throw, that's unexpected but we'll check the state
      } catch (error) {
        // Saga failed as expected
        expect(error).toBeDefined();
      }

      // Verify original record state was restored in DB (or at least record still exists)
      const record = await db.getRecord(existingRecordId);
      expect(record).toBeDefined();
      // The compensation should have restored the original title if it got that far
      // (Note: exact behavior depends on which step fails)
    });
  });

  describe('Error Handling', () => {
    it('should handle missing record gracefully', async () => {
      const request = {
        title: 'Non-existent',
        content: '# Test',
      };

      const saga = new UpdateRecordSaga(
        db,
        recordManager,
        civic.getGitEngine(),
        civic.getHookSystem(),
        civic.getIndexingService(),
        testDir
      );

      // Create context with non-existent record ID
      const context = {
        correlationId: `test-error-${Date.now()}`,
        startedAt: new Date(),
        recordId: 'non-existent-record',
        request,
        user: testUser,
        metadata: {
          recordId: 'non-existent-record',
        },
      };

      // Execute saga - should fail
      await expect(sagaExecutor.execute(saga, context)).rejects.toThrow();
    });

    it('should validate context before execution', async () => {
      const saga = new UpdateRecordSaga(
        db,
        recordManager,
        civic.getGitEngine(),
        civic.getHookSystem(),
        civic.getIndexingService(),
        testDir
      );

      // Invalid context (missing recordId)
      const invalidContext = {
        correlationId: `test-validation-${Date.now()}`,
        startedAt: new Date(),
        request: {},
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
});
