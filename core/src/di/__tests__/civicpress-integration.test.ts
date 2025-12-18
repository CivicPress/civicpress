/**
 * Dependency Injection Container - CivicPress Integration Tests
 *
 * Tests the integration of the DI container with the CivicPress class.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CivicPress, CivicPressConfig } from '../../civic-core.js';
import { ServiceContainer } from '../container.js';
import { DatabaseService } from '../../database/database-service.js';
import { AuthService } from '../../auth/auth-service.js';
import { RecordManager } from '../../records/record-manager.js';
import { WorkflowEngine } from '../../workflows/workflow-engine.js';
import { GitEngine } from '../../git/git-engine.js';
import { HookSystem } from '../../hooks/hook-system.js';
import { TemplateEngine } from '../../utils/template-engine.js';
import { IndexingService } from '../../indexing/indexing-service.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';

describe('CivicPress DI Integration', () => {
  let testDir: string;
  let config: CivicPressConfig;
  let civic: CivicPress;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'civicpress-test-'));
    await fs.mkdir(path.join(testDir, '.system-data'), { recursive: true });
    await fs.mkdir(path.join(testDir, '.civic'), { recursive: true });
    await fs.mkdir(path.join(testDir, 'records'), { recursive: true });

    // Initialize Git repository (required for GitEngine)
    execSync('git init', { cwd: testDir, stdio: 'ignore' });

    config = {
      dataDir: testDir,
      database: {
        type: 'sqlite',
        sqlite: {
          file: path.join(testDir, '.system-data', 'test.db'),
        },
      },
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

  describe('Service Registration', () => {
    it('should register all services in container', () => {
      civic = new CivicPress(config);

      // Verify services are registered
      expect(civic.getService('logger')).toBeDefined();
      expect(civic.getService('config')).toBeDefined();
      expect(civic.getService('database')).toBeDefined();
      expect(civic.getService('auth')).toBeDefined();
      expect(civic.getService('configDiscovery')).toBeDefined();
      expect(civic.getService('workflow')).toBeDefined();
      expect(civic.getService('git')).toBeDefined();
      expect(civic.getService('hooks')).toBeDefined();
      expect(civic.getService('template')).toBeDefined();
      expect(civic.getService('recordManager')).toBeDefined();
      expect(civic.getService('indexing')).toBeDefined();
      expect(civic.getService('notification')).toBeDefined();
      expect(civic.getService('notificationConfig')).toBeDefined();
    });

    it('should resolve services as singletons', () => {
      civic = new CivicPress(config);

      const db1 = civic.getService<DatabaseService>('database');
      const db2 = civic.getService<DatabaseService>('database');

      expect(db1).toBe(db2); // Same instance
    });
  });

  describe('Service Resolution', () => {
    it('should resolve services through getter methods', async () => {
      civic = new CivicPress(config);

      // Services should be resolvable even before initialization
      const db = civic.getDatabaseService();
      const auth = civic.getAuthService();
      const workflow = civic.getWorkflowEngine();
      const git = civic.getGitEngine();
      const hooks = civic.getHookSystem();
      const template = civic.getTemplateEngine();
      const indexing = civic.getIndexingService();

      expect(db).toBeInstanceOf(DatabaseService);
      expect(auth).toBeInstanceOf(AuthService);
      expect(workflow).toBeInstanceOf(WorkflowEngine);
      expect(git).toBeInstanceOf(GitEngine);
      expect(hooks).toBeInstanceOf(HookSystem);
      expect(template).toBeInstanceOf(TemplateEngine);
      expect(indexing).toBeInstanceOf(IndexingService);

      // Now initialize and test record manager (which might need initialized services)
      await civic.initialize();
      const recordManager = civic.getRecordManager();
      expect(recordManager).toBeInstanceOf(RecordManager);
    });

    it('should resolve services through getService method', () => {
      civic = new CivicPress(config);

      const db = civic.getService<DatabaseService>('database');
      const auth = civic.getService<AuthService>('auth');
      const workflow = civic.getService<WorkflowEngine>('workflow');
      const recordManager = civic.getService<RecordManager>('recordManager');

      expect(db).toBeInstanceOf(DatabaseService);
      expect(auth).toBeInstanceOf(AuthService);
      expect(workflow).toBeInstanceOf(WorkflowEngine);
      expect(recordManager).toBeInstanceOf(RecordManager);
    });

    it('should maintain backward compatibility with getter methods', () => {
      civic = new CivicPress(config);

      // Old way (should still work)
      const db1 = civic.getDatabaseService();
      const auth1 = civic.getAuthService();

      // New way
      const db2 = civic.getService<DatabaseService>('database');
      const auth2 = civic.getService<AuthService>('auth');

      // Should be the same instances
      expect(db1).toBe(db2);
      expect(auth1).toBe(auth2);
    });
  });

  describe('Service Initialization', () => {
    it('should initialize all services correctly', async () => {
      civic = new CivicPress(config);

      // Services should be created (but not necessarily initialized)
      const db = civic.getDatabaseService();
      const workflow = civic.getWorkflowEngine();
      const git = civic.getGitEngine();
      const hooks = civic.getHookSystem();

      expect(db).toBeDefined();
      expect(workflow).toBeDefined();
      expect(git).toBeDefined();
      expect(hooks).toBeDefined();

      // Now initialize
      await civic.initialize();

      // After initialization, services should be ready
      expect(db).toBeDefined();
      expect(workflow).toBeDefined();
      expect(git).toBeDefined();
      expect(hooks).toBeDefined();
    });

    it('should handle service dependencies correctly', () => {
      civic = new CivicPress(config);

      // RecordManager depends on multiple services
      const recordManager = civic.getRecordManager();
      expect(recordManager).toBeDefined();

      // AuthService depends on DatabaseService
      const auth = civic.getAuthService();
      expect(auth).toBeDefined();
    });
  });

  describe('Container Access', () => {
    it('should provide access to container via getService', () => {
      civic = new CivicPress(config);

      // Should be able to resolve any registered service
      const logger = civic.getService('logger');
      const resolvedConfig = civic.getService('config');

      expect(logger).toBeDefined();
      expect(resolvedConfig).toBeDefined();
    });
  });
});
