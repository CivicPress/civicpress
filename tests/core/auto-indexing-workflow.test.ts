import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CivicPress } from '../../core/src/civic-core.js';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';

// TODO: Fix auto-indexing workflow tests after CivicPress integration is complete
describe.skip('Auto-Indexing Workflow', () => {
  let civicPress: CivicPress;
  let testDataDir: string;

  beforeEach(async () => {
    // Create test data directory
    testDataDir = join(process.cwd(), 'test-auto-indexing');
    mkdirSync(testDataDir, { recursive: true });

    // Initialize CivicPress with test database
    civicPress = new CivicPress({
      dataDir: testDataDir,
      database: {
        type: 'sqlite' as const,
        sqlite: {
          file: join(testDataDir, 'test.db'),
        },
      },
    });
    await civicPress.initialize();
  });

  afterEach(async () => {
    await civicPress.shutdown();
    rmSync(testDataDir, { recursive: true, force: true });
  });

  it('should automatically trigger indexing when a record is updated', async () => {
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
      'clerk'
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
        status: 'proposed',
      },
      'clerk'
    );

    expect(updatedRecord).toBeDefined();
    expect(updatedRecord?.title).toBe('Updated Test Bylaw for Auto-Indexing');

    // Check that the indexing service has been triggered
    const indexingService = civicPress.getIndexingService();
    const recordsDir = join(testDataDir, 'records');
    const indexPath = join(recordsDir, 'index.yml');

    // Generate indexes to verify they were updated
    const index = await indexingService.generateIndexes();

    expect(index).toBeDefined();
    expect(index.metadata.totalRecords).toBeGreaterThan(0);

    // Verify the updated record is in the index
    const updatedRecordInIndex = index.entries.find(
      (entry) => entry.title === 'Updated Test Bylaw for Auto-Indexing'
    );

    expect(updatedRecordInIndex).toBeDefined();
    expect(updatedRecordInIndex?.status).toBe('proposed');
  });

  it('should trigger module-specific indexing when a record with module is updated', async () => {
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
      'clerk'
    );

    // Update the record
    await civicPress.getRecordManager().updateRecord(
      record.id,
      {
        title: 'Updated Legal Register Test Record',
        status: 'adopted',
      },
      'clerk'
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

  it('should handle workflow execution errors gracefully', async () => {
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
      'clerk'
    );

    // Update the record - this should trigger the workflow
    // Even if there are issues with the indexing service, the update should still succeed
    const updatedRecord = await civicPress.getRecordManager().updateRecord(
      record.id,
      {
        title: 'Updated Error Test Record',
        status: 'draft',
      },
      'clerk'
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
