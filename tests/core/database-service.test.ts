import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseService } from '../../core/src/database/database-service.js';
import { CivicPress } from '../../core/src/civic-core.js';
import {
  createTestDirectory,
  createRolesConfig,
  cleanupTestDirectory,
} from '../fixtures/test-setup';

describe('DatabaseService - workflowState Support', () => {
  let testConfig: any;
  let civicPress: CivicPress;
  let dbService: DatabaseService;
  let testIdCounter = 0;

  // Helper to generate unique test IDs
  const getTestId = (prefix: string) => {
    testIdCounter++;
    return `${prefix}-${Date.now()}-${testIdCounter}`;
  };

  beforeEach(async () => {
    testIdCounter = 0; // Reset counter for each test suite
    // Use shared fixture for test directory and config
    testConfig = createTestDirectory('database-service-test');
    createRolesConfig(testConfig);

    // Initialize CivicPress with proper config
    civicPress = new CivicPress({
      dataDir: testConfig.dataDir,
    });
    await civicPress.initialize();
    dbService = civicPress.getDatabaseService();
  });

  afterEach(async () => {
    // Cleanup
    await cleanupTestDirectory(testConfig);
  });

  describe('Record Operations with workflowState', () => {
    it('should create record with workflow_state field', async () => {
      const recordId = getTestId('test-record');
      const recordData = {
        id: recordId,
        title: 'Test Record',
        type: 'policy',
        status: 'published',
        workflow_state: 'ready_for_publication',
        content: '# Test Record\n\nContent here.',
        author: 'testuser',
      };

      await dbService.createRecord(recordData);

      const record = await dbService.getRecord(recordId);
      expect(record).toBeTruthy();
      expect(record.id).toBe(recordId);
      expect(record.status).toBe('published');
      expect(record.workflow_state).toBe('ready_for_publication');
    });

    it('should default workflow_state to "draft" when not provided', async () => {
      const recordId = getTestId('test-record');
      const recordData = {
        id: recordId,
        title: 'Test Record 2',
        type: 'policy',
        status: 'draft',
        content: '# Test Record\n\nContent here.',
        author: 'testuser',
      };

      await dbService.createRecord(recordData);

      const record = await dbService.getRecord(recordId);
      expect(record).toBeTruthy();
      expect(record.status).toBe('draft');
      expect(record.workflow_state).toBe('draft'); // Should default to 'draft'
    });

    it('should update workflow_state independently of status', async () => {
      const recordId = getTestId('test-record');
      // Create record
      await dbService.createRecord({
        id: recordId,
        title: 'Test Record 3',
        type: 'policy',
        status: 'draft',
        workflow_state: 'draft',
        content: '# Test Record\n\nContent here.',
        author: 'testuser',
      });

      // Update only workflow_state
      await dbService.updateRecord(recordId, {
        workflow_state: 'under_review',
      });

      const record = await dbService.getRecord(recordId);
      expect(record.status).toBe('draft'); // Status unchanged
      expect(record.workflow_state).toBe('under_review'); // workflowState updated
    });

    it('should update status independently of workflow_state', async () => {
      const recordId = getTestId('test-record');
      // Create record
      await dbService.createRecord({
        id: recordId,
        title: 'Test Record 4',
        type: 'policy',
        status: 'draft',
        workflow_state: 'under_review',
        content: '# Test Record\n\nContent here.',
        author: 'testuser',
      });

      // Update only status
      await dbService.updateRecord(recordId, {
        status: 'published',
      });

      const record = await dbService.getRecord(recordId);
      expect(record.status).toBe('published'); // Status updated
      expect(record.workflow_state).toBe('under_review'); // workflowState unchanged
    });

    it('should retrieve record with workflow_state', async () => {
      const recordId = getTestId('test-record');
      await dbService.createRecord({
        id: recordId,
        title: 'Test Record 5',
        type: 'policy',
        status: 'published',
        workflow_state: 'ready_for_publication',
        content: '# Test Record\n\nContent here.',
        author: 'testuser',
      });

      const record = await dbService.getRecord(recordId);
      expect(record).toBeTruthy();
      expect(record.workflow_state).toBe('ready_for_publication');
    });
  });

  describe('Draft Operations with workflowState', () => {
    it('should create draft with workflow_state', async () => {
      const draftId = getTestId('test-draft');
      const draftData = {
        id: draftId,
        title: 'Test Draft',
        type: 'policy',
        status: 'draft',
        workflow_state: 'under_review',
        markdown_body: '# Test Draft\n\nContent here.',
        author: 'testuser',
        created_by: 'testuser',
      };

      await dbService.createDraft(draftData);

      const draft = await dbService.getDraft(draftId);
      expect(draft).toBeTruthy();
      expect(draft.id).toBe(draftId);
      expect(draft.status).toBe('draft');
      expect(draft.workflow_state).toBe('under_review');
    });

    it('should default draft workflow_state to "draft" when not provided', async () => {
      const draftId = getTestId('test-draft');
      const draftData = {
        id: draftId,
        title: 'Test Draft 2',
        type: 'policy',
        status: 'draft',
        markdown_body: '# Test Draft\n\nContent here.',
        author: 'testuser',
        created_by: 'testuser',
      };

      await dbService.createDraft(draftData);

      const draft = await dbService.getDraft(draftId);
      expect(draft).toBeTruthy();
      expect(draft.workflow_state).toBe('draft'); // Should default to 'draft'
    });

    it('should update draft workflow_state', async () => {
      const draftId = getTestId('test-draft');
      // Create draft
      await dbService.createDraft({
        id: draftId,
        title: 'Test Draft 3',
        type: 'policy',
        status: 'draft',
        workflow_state: 'draft',
        markdown_body: '# Test Draft\n\nContent here.',
        author: 'testuser',
        created_by: 'testuser',
      });

      // Update workflow_state
      await dbService.updateDraft(draftId, {
        workflow_state: 'ready_for_publication',
      });

      const draft = await dbService.getDraft(draftId);
      expect(draft.workflow_state).toBe('ready_for_publication');
    });
  });
});
