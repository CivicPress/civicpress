import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CivicPress } from '../../core/src/civic-core.js';
import { join } from 'path';
import {
  createTestDirectory,
  cleanupTestDirectory,
} from '../fixtures/test-setup';

// createRecord/updateRecord take an AuthUser object (id/username/role) — the
// old string-role second argument left author/authors empty and tripped schema
// validation.
const TEST_USER = { id: 1, username: 'clerk', role: 'admin' } as any;

describe('Auto-Indexing Workflow', () => {
  let civicPress: CivicPress;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let testConfig: any;

  beforeEach(async () => {
    // Use an ISOLATED data dir under the OS temp dir with its OWN git repo
    // (createTestDirectory runs `git init` in dataDir). Publishing/updating a
    // record runs the saga's git-commit step against dataDir's repo; if dataDir
    // sat inside THIS repo (the old `join(process.cwd(), 'test-auto-indexing')`),
    // those commits leaked straight into the CivicPress repo. tmpdir isolation
    // keeps them contained.
    testConfig = createTestDirectory('auto-indexing');

    // Initialize CivicPress with test database
    civicPress = new CivicPress({
      dataDir: testConfig.dataDir,
      database: {
        type: 'sqlite' as const,
        sqlite: {
          file: join(testConfig.testDir, 'test.db'),
        },
      },
    });
    await civicPress.initialize();
  });

  afterEach(async () => {
    await civicPress.shutdown();
    cleanupTestDirectory(testConfig);
  });

  it('reflects a created-then-updated record (title + status) in generated indexes', async () => {
    // Create a test record
    const record = await civicPress.getRecordManager().createRecord(
      {
        title: 'Test Bylaw for Auto-Indexing',
        type: 'bylaw',
        content: '# Test Bylaw\n\nThis is a test bylaw for auto-indexing.',
        metadata: {
          module: 'legal-register',
          tags: ['test', 'auto-indexing'],
        },
      },
      TEST_USER
    );

    expect(record).toBeDefined();
    expect(record.title).toBe('Test Bylaw for Auto-Indexing');

    // Update the record to trigger auto-indexing
    const updatedRecord = await civicPress.getRecordManager().updateRecord(
      record.id,
      {
        title: 'Updated Test Bylaw for Auto-Indexing',
        content:
          '# Updated Test Bylaw\n\nThis is an updated test bylaw for auto-indexing.',
        status: 'approved',
      },
      TEST_USER
    );

    expect(updatedRecord).toBeDefined();
    expect(updatedRecord?.title).toBe('Updated Test Bylaw for Auto-Indexing');

    // Check that the indexing service has been triggered
    const indexingService = civicPress.getIndexingService();

    // Generate indexes to verify they were updated
    const index = await indexingService.generateIndexes();

    expect(index).toBeDefined();
    expect(index.metadata.totalRecords).toBeGreaterThan(0);

    // Verify the updated record is in the index
    const updatedRecordInIndex = index.entries.find(
      (entry) => entry.title === 'Updated Test Bylaw for Auto-Indexing'
    );

    expect(updatedRecordInIndex).toBeDefined();
    expect(updatedRecordInIndex?.status).toBe('approved');
  });

  it('includes a module-tagged record in module-filtered indexes', async () => {
    // Create a record with a specific module
    const record = await civicPress.getRecordManager().createRecord(
      {
        title: 'Legal Register Test Record',
        type: 'policy',
        content: '# Legal Register Policy\n\nThis is a test policy.',
        metadata: {
          module: 'legal-register',
          tags: ['legal', 'policy'],
        },
      },
      TEST_USER
    );

    // Update the record
    await civicPress.getRecordManager().updateRecord(
      record.id,
      {
        title: 'Updated Legal Register Test Record',
        status: 'published',
      },
      TEST_USER
    );

    // Check that module-specific indexing was triggered
    const indexingService = civicPress.getIndexingService();
    const moduleIndex = await indexingService.generateIndexes({
      modules: ['legal-register'],
    });

    expect(moduleIndex).toBeDefined();
    expect(moduleIndex.metadata.modules).toContain('legal-register');

    // Verify the record is in the module-specific index
    const recordInModuleIndex = moduleIndex.entries.find(
      (entry) => entry.title === 'Updated Legal Register Test Record'
    );

    expect(recordInModuleIndex).toBeDefined();
    expect(recordInModuleIndex?.module).toBe('legal-register');
  });

  // SKIPPED — asserts unimplemented behavior, NOT a regression. This checks that
  // the record:updated hook drives the WorkflowEngine (an entry shows up in
  // getActiveWorkflows()). That hook→engine wiring does not exist yet:
  // HookSystem.executeWorkflow (core/src/hooks/hook-system.ts) is a stub that
  // only logs ("TODO: Implement workflow engine integration"), so no workflow is
  // ever registered as active and this asserts `0 > 0`. Un-skip when that
  // integration lands. (generateIndexes() itself is exercised by the two tests
  // above and by tests/core/indexing-service.test.ts.)
  it.skip('registers an active workflow when a record is updated (needs hook→WorkflowEngine wiring)', async () => {
    // Create a record that will trigger indexing
    const record = await civicPress.getRecordManager().createRecord(
      {
        title: 'Error Test Record',
        type: 'bylaw',
        content: '# Error Test\n\nThis is a test for error handling.',
        metadata: {
          module: 'test-module',
        },
      },
      TEST_USER
    );

    // Update the record - this should trigger the workflow
    // Even if there are issues with the indexing service, the update should still succeed
    const updatedRecord = await civicPress.getRecordManager().updateRecord(
      record.id,
      {
        title: 'Updated Error Test Record',
        status: 'draft',
      },
      TEST_USER
    );

    expect(updatedRecord).toBeDefined();
    expect(updatedRecord?.title).toBe('Updated Error Test Record');

    // The workflow should have been triggered even if indexing failed
    const workflowEngine = civicPress.getWorkflowEngine();
    const activeWorkflows = workflowEngine.getActiveWorkflows();

    // Should have at least one workflow execution
    expect(activeWorkflows.size).toBeGreaterThan(0);
  });
});
