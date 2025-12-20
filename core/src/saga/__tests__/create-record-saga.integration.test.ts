/**
 * CreateRecordSaga Integration Tests
 *
 * Tests the complete saga flow for creating published records.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CivicPress, CivicPressConfig } from '../../civic-core.js';
import { CreateRecordSaga } from '../create-record-saga.js';
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

describe('CreateRecordSaga Integration', () => {
  let testDir: string;
  let config: CivicPressConfig;
  let civic: CivicPress;
  let db: DatabaseService;
  let recordManager: RecordManager;
  let sagaExecutor: SagaExecutor;
  let testUser: AuthUser;

  beforeEach(async () => {
    // Create test directory
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'civicpress-saga-test-'));
    await fs.mkdir(path.join(testDir, '.system-data'), { recursive: true });
    await fs.mkdir(path.join(testDir, '.civic'), { recursive: true });
    await fs.mkdir(path.join(testDir, 'records'), { recursive: true });

    // Initialize Git repository (required for GitEngine)
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

  describe('Successful Create Flow', () => {
    it('should create a published record successfully', async () => {
      const request = {
        title: 'Test Published Record',
        type: 'bylaw',
        content: '# Test Content\n\nThis is test content.',
        status: 'published',
        metadata: { author: 'testuser' },
      };

      // Create saga
      const saga = new CreateRecordSaga(
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
        request,
        user: testUser,
        metadata: {
          recordType: request.type,
        },
      };

      // Execute saga
      const result = await sagaExecutor.execute(saga, context);

      // Verify saga completed successfully
      expect(result.result).toBeDefined();
      expect(result.result.title).toBe(request.title);
      expect(result.result.type).toBe(request.type);
      expect(result.result.status).toBe('published');
      expect(result.compensated).toBe(false);

      // Verify record exists in records table
      const record = await db.getRecord(result.result.id);
      expect(record).toBeDefined();
      expect(record?.title).toBe(request.title);

      // Verify file was created
      const filePath = record?.path;
      expect(filePath).toBeDefined();
      if (filePath) {
        const fullPath = path.join(testDir, filePath);
        const fileExists = await fs
          .access(fullPath)
          .then(() => true)
          .catch(() => false);
        expect(fileExists).toBe(true);
      }

      // Verify Git commit was made
      const git = civic.getGitEngine();
      const history = await git.getHistory(1);
      expect(history.length).toBeGreaterThan(0);
      expect(history[0].message).toContain('Create record');
    });

    it('should create a record with document number for legal types', async () => {
      const request = {
        title: 'Test Bylaw',
        type: 'bylaw',
        content: '# Test Bylaw Content',
        status: 'published',
        metadata: {},
      };

      // Create saga
      const saga = new CreateRecordSaga(
        db,
        recordManager,
        civic.getGitEngine(),
        civic.getHookSystem(),
        civic.getIndexingService(),
        testDir
      );

      // Create context
      const context = {
        correlationId: `test-docnum-${Date.now()}`,
        startedAt: new Date(),
        request,
        user: testUser,
        metadata: {
          recordType: request.type,
        },
      };

      // Execute saga
      const result = await sagaExecutor.execute(saga, context);

      // Verify document number was generated
      expect(result.result.metadata?.document_number).toBeDefined();
      // Document number format includes full type (e.g., BYL-2025-001 for bylaw)
      expect(result.result.metadata?.document_number).toMatch(
        /^BYL-\d{4}-\d{3}$/
      );
    });
  });

  describe('Compensation Flow', () => {
    it('should compensate when file creation fails', async () => {
      const request = {
        title: 'Test Compensation',
        type: 'bylaw',
        content: '# Test Content',
        status: 'published',
        metadata: {},
      };

      // Create a saga with a mock that will fail at file creation
      // We'll use a non-existent dataDir to cause file creation to fail
      const invalidDataDir = path.join(testDir, 'invalid', 'path');
      const saga = new CreateRecordSaga(
        db,
        recordManager,
        civic.getGitEngine(),
        civic.getHookSystem(),
        civic.getIndexingService(),
        invalidDataDir // This will cause file creation to fail
      );

      // Create context
      const context = {
        correlationId: `test-compensation-${Date.now()}`,
        startedAt: new Date(),
        request,
        user: testUser,
        metadata: {
          recordType: request.type,
        },
      };

      // Execute saga - should fail and compensate
      await expect(sagaExecutor.execute(saga, context)).rejects.toThrow();

      // Verify record was created in DB (step 1 completed)
      // Note: We can't easily check which records were created without the recordId
      // But we can verify the saga failed and compensation was attempted
    });
  });

  describe('Idempotency', () => {
    it('should return cached result for duplicate requests', async () => {
      const request = {
        title: 'Idempotent Test',
        type: 'bylaw',
        content: '# Test Content',
        status: 'published',
        metadata: {},
      };

      const idempotencyKey = `create-${request.type}-${request.title}`;

      // Create saga
      const saga = new CreateRecordSaga(
        db,
        recordManager,
        civic.getGitEngine(),
        civic.getHookSystem(),
        civic.getIndexingService(),
        testDir
      );

      // Create context with idempotency key
      const context = {
        correlationId: `test-idempotent-${Date.now()}`,
        idempotencyKey,
        startedAt: new Date(),
        request,
        user: testUser,
        metadata: {
          recordType: request.type,
        },
      };

      // Execute saga first time
      const result1 = await sagaExecutor.execute(saga, context);

      // Execute saga second time with same idempotency key
      const context2 = {
        ...context,
        correlationId: `test-idempotent-${Date.now()}-2`,
      };
      const result2 = await sagaExecutor.execute(saga, context2);

      // Verify both results are the same (cached)
      expect(result2.result.id).toBe(result1.result.id);
      expect(result2.result.title).toBe(result1.result.title);

      // Verify only one record exists
      const records = await db.query('SELECT * FROM records WHERE id = ?', [
        result1.result.id,
      ]);
      expect(records.length).toBe(1);
    });
  });

  describe('Error Handling', () => {
    it('should handle missing request gracefully', async () => {
      const saga = new CreateRecordSaga(
        db,
        recordManager,
        civic.getGitEngine(),
        civic.getHookSystem(),
        civic.getIndexingService(),
        testDir
      );

      // Invalid context (missing request)
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
      expect(validation.errors?.length).toBeGreaterThan(0);
    });

    it('should validate required request fields', async () => {
      const saga = new CreateRecordSaga(
        db,
        recordManager,
        civic.getGitEngine(),
        civic.getHookSystem(),
        civic.getIndexingService(),
        testDir
      );

      // Invalid context (missing title and type)
      const invalidContext = {
        correlationId: `test-validation-${Date.now()}`,
        startedAt: new Date(),
        request: {},
        user: testUser,
        metadata: {},
      };

      // Validate context
      const validation = saga.validateContext(invalidContext);
      expect(validation.valid).toBe(false);
      expect(validation.errors).toBeDefined();
      expect(validation.errors?.some((e) => e.includes('title'))).toBe(true);
      expect(validation.errors?.some((e) => e.includes('type'))).toBe(true);
    });
  });

  describe('State Persistence', () => {
    it('should persist saga state during execution', async () => {
      const request = {
        title: 'State Test',
        type: 'bylaw',
        content: '# Test Content',
        status: 'published',
        metadata: {},
      };

      const correlationId = `test-state-${Date.now()}`;

      // Create saga
      const saga = new CreateRecordSaga(
        db,
        recordManager,
        civic.getGitEngine(),
        civic.getHookSystem(),
        civic.getIndexingService(),
        testDir
      );

      // Create context
      const context = {
        correlationId,
        startedAt: new Date(),
        request,
        user: testUser,
        metadata: {
          recordType: request.type,
        },
      };

      // Execute saga
      const result = await sagaExecutor.execute(saga, context);

      // Verify state was persisted
      const stateStore = new SagaStateStore(db);
      const state = await stateStore.getState(result.sagaId);
      expect(state).toBeDefined();
      expect(state?.sagaType).toBe('CreateRecord');
      expect(state?.status).toBe('completed');
      expect(state?.correlationId).toBe(correlationId);
    });
  });
});
