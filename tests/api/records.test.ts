import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { execSync } from 'child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { tmpdir } from 'os';
import yaml from 'js-yaml';
import request from 'supertest';
import express from 'express';
import { CivicPress, WorkflowConfigManager } from '@civicpress/core';
import { createRecordsRouter } from '../../modules/api/src/routes/records';

// Mock the CivicPress core to avoid complex setup in tests
const mockCoreRecordManager = {
  createRecord: vi.fn(),
  updateRecord: vi.fn(),
  archiveRecord: vi.fn(),
  getRecord: vi.fn(),
  listRecords: vi.fn(),
};

const mockAuthService = {
  validateSession: vi.fn(),
  validateApiKey: vi.fn(),
  createSession: vi.fn(),
  createApiKey: vi.fn(),
  deleteSession: vi.fn(),
  deleteApiKey: vi.fn(),
  cleanupExpiredSessions: vi.fn(),
  createUser: vi.fn(),
  getUserById: vi.fn(),
  logAuthEvent: vi.fn(),
  authenticateWithGitHub: vi.fn(),
  logout: vi.fn(),
  getCurrentUser: vi.fn(),
};

const mockCore = {
  initialize: vi.fn().mockResolvedValue(undefined),
  getDataDir: () => '/mock/data/dir',
  getRecordManager: vi.fn(() => mockCoreRecordManager), // Always return the same instance
};

const mockCivicPress = {
  getCore: vi.fn().mockReturnValue(mockCore),
  getAuthService: vi.fn().mockReturnValue(mockAuthService),
  getHookSystem: () => ({
    emit: vi.fn().mockResolvedValue(undefined),
  }),
  getGitEngine: () => ({
    commit: vi.fn().mockResolvedValue('mock-commit-hash'),
  }),
  getWorkflowEngine: () => ({
    startWorkflow: vi.fn().mockResolvedValue('mock-workflow-id'),
  }),
};

vi.mock('@civicpress/core', () => ({
  CivicPress: vi.fn().mockImplementation(() => mockCivicPress),
  WorkflowConfigManager: vi.fn().mockImplementation(() => ({
    validateAction: vi.fn().mockResolvedValue({ valid: true }),
  })),
}));

// Mock dynamic imports
vi.mock('@civicpress/core', async () => {
  return {
    CivicPress: vi.fn().mockImplementation(() => mockCivicPress),
    WorkflowConfigManager: vi.fn().mockImplementation(() => ({
      validateAction: vi.fn().mockResolvedValue({ valid: true }),
    })),
  };
});

// Mock RecordsService
const mockRecordManager = {
  createRecord: vi.fn(),
  updateRecord: vi.fn(),
  archiveRecord: vi.fn(),
  getRecord: vi.fn(),
  listRecords: vi.fn(),
};

const mockWorkflowManager = {
  validateAction: vi.fn().mockResolvedValue({ valid: true }),
};

// Import the actual modules
import { RecordsService } from '../../modules/api/src/services/records-service';

export interface TestContext {
  testDir: string;
  originalCwd: string;
  app: express.Application;
  recordsService: any; // Use any for mocked service
}

export async function createTestContext(): Promise<TestContext> {
  const testDir = join(
    tmpdir(),
    `civicpress-api-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}-${process.pid}`
  );
  const originalCwd = process.cwd();

  // Create test directory
  mkdirSync(testDir, { recursive: true });

  // Create Express app for testing
  const app = express();
  app.use(express.json());

  // Mock CivicPress instance
  const civicPress = new CivicPress();

  // Attach CivicPress to app for JWT middleware
  app.set('civicPress', civicPress);

  // Add middleware to attach CivicPress to each request
  app.use((req, res, next) => {
    (req as any).civicPress = civicPress;
    next();
  });

  // Create a new service instance for this test context
  const recordsService = new RecordsService(
    mockCivicPress as any,
    mockRecordManager,
    mockWorkflowManager as any
  );

  // Override the initializeRecordManager method to use our mock
  (recordsService as any).initializeRecordManager = vi
    .fn()
    .mockResolvedValue(undefined);

  // Use the new router with the service
  app.use('/api/v1/records', createRecordsRouter(recordsService));

  return { testDir, originalCwd, app, recordsService };
}

export function cleanupTestContext(context: TestContext) {
  // Change back to original directory
  process.chdir(context.originalCwd);

  // Clean up test directory
  if (existsSync(context.testDir)) {
    rmSync(context.testDir, { recursive: true, force: true });
  }
}

export function setupTestData(context: TestContext) {
  const { testDir } = context;

  // Create data directory structure
  const dataDir = join(testDir, 'data');
  mkdirSync(dataDir, { recursive: true });

  // Create .civic directory
  const civicDir = join(dataDir, '.civic');
  mkdirSync(civicDir, { recursive: true });

  // Create workflow configuration
  const workflowConfig = {
    statuses: ['draft', 'proposed', 'reviewed', 'approved', 'archived'],
    transitions: {
      draft: ['proposed'],
      proposed: ['reviewed', 'archived'],
      reviewed: ['approved', 'archived'],
      approved: ['archived'],
      archived: [],
    },
    roles: {
      admin: {
        can_create: ['bylaw', 'policy', 'resolution'],
        can_edit: ['bylaw', 'policy', 'resolution'],
        can_delete: ['bylaw', 'policy', 'resolution'],
        can_transition: {
          draft: ['proposed'],
          any: ['archived'],
        },
      },
      clerk: {
        can_create: ['bylaw', 'policy', 'resolution'],
        can_edit: ['bylaw', 'policy', 'resolution'],
        can_transition: {
          draft: ['proposed'],
          any: ['archived'],
        },
      },
      council: {
        can_create: ['bylaw', 'policy', 'resolution'],
        can_edit: ['bylaw', 'policy', 'resolution'],
        can_delete: ['bylaw', 'policy', 'resolution'],
        can_transition: {
          reviewed: ['approved'],
          any: ['archived'],
        },
      },
      public: {
        can_view: ['bylaw', 'policy', 'resolution'],
      },
    },
  };

  writeFileSync(join(civicDir, 'workflows.yml'), yaml.dump(workflowConfig));

  return { civicDir };
}

// Helper to get a JWT token for testing
async function getJwtToken(app, role = 'admin') {
  // Mock the auth service to return a valid user for the given role
  const mockUser = createTestUser(role);

  // Mock validateSession to return the user for any token
  const civicPress = app.get('civicPress');
  const authService = civicPress.getAuthService();
  authService.validateSession.mockResolvedValue(mockUser);

  // Return a fake token (the middleware will validate it against our mock)
  return 'test-jwt-token';
}

// Helper to create a test user with specific role
function createTestUser(role = 'admin') {
  return {
    id: 1,
    username: `test-${role}`,
    role: role,
    email: `test-${role}@example.com`,
    name: `Test ${role}`,
    avatar_url: 'https://example.com/avatar.png',
    permissions:
      role === 'admin'
        ? ['read', 'write', 'delete']
        : role === 'council'
          ? ['read', 'write']
          : role === 'clerk'
            ? ['read', 'write']
            : ['read'],
  };
}

describe('API Records Integration', () => {
  let context: TestContext;

  beforeEach(async () => {
    context = await createTestContext();
    setupTestData(context);
    vi.clearAllMocks();
    // Reset all mock methods
    Object.values(mockRecordManager).forEach(
      (fn) => fn.mockReset && fn.mockReset()
    );
    Object.values(mockWorkflowManager).forEach(
      (fn) => fn.mockReset && fn.mockReset()
    );
    // Reset workflow manager to allow actions by default
    mockWorkflowManager.validateAction.mockResolvedValue({ valid: true });
  });

  afterEach(() => {
    cleanupTestContext(context);
    vi.clearAllMocks();
  });

  describe('POST /api/v1/records - Create Record', () => {
    it('should fail to create a record without authentication', async () => {
      mockRecordManager.createRecord.mockResolvedValue({
        id: 'test-record',
        title: 'Test Record',
        type: 'bylaw',
        status: 'draft',
        content: '# Test Record\n\nContent here...',
        metadata: {
          author: 'admin',
          created: '2025-07-09T15:46:32.263Z',
          version: '1.0.0',
        },
        path: 'records/bylaw/test-record.md',
      });

      const response = await request(context.app)
        .post('/api/v1/records')
        // No Authorization header!
        .send({
          title: 'Test Record',
          type: 'bylaw',
          content: '# Test Record\n\nContent here...',
          metadata: { priority: 'high' },
        });

      expect(response.status).toBe(401); // Should be unauthorized
    });

    it('should create a record successfully with admin role (authenticated)', async () => {
      const token = await getJwtToken(context.app, 'admin');
      mockRecordManager.createRecord.mockResolvedValue({
        id: 'test-record',
        title: 'Test Record',
        type: 'bylaw',
        status: 'draft',
        content: '# Test Record\n\nContent here...',
        metadata: {
          author: 'admin',
          created: '2025-07-09T15:46:32.263Z',
          version: '1.0.0',
        },
        path: 'records/bylaw/test-record.md',
      });

      console.log(
        'Mock createRecord called:',
        mockRecordManager.createRecord.mock.calls.length
      );
      console.log(
        'Mock createRecord implementation:',
        mockRecordManager.createRecord.getMockName()
      );
      console.log(
        'RecordsService recordManager:',
        (context.recordsService as any).recordManager
      );
      console.log(
        'RecordsService recordManager === mockRecordManager:',
        (context.recordsService as any).recordManager === mockRecordManager
      );

      const response = await request(context.app)
        .post('/api/v1/records')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Test Record',
          type: 'bylaw',
          content: '# Test Record\n\nContent here...',
          metadata: { priority: 'high' },
        });

      console.log('Response status:', response.status);
      console.log('Response body:', JSON.stringify(response.body, null, 2));
      if (response.status === 500) {
        console.log('Full response:', JSON.stringify(response, null, 2));
      }
      expect(response.status).toBe(201); // Should succeed
      expect(response.body).toEqual({
        id: 'test-record',
        title: 'Test Record',
        type: 'bylaw',
        status: 'draft',
        content: '# Test Record\n\nContent here...',
        metadata: {
          author: 'admin',
          created: '2025-07-09T15:46:32.263Z',
          version: '1.0.0',
        },
        path: 'records/bylaw/test-record.md',
      });
    });

    it('should reject creation with insufficient permissions', async () => {
      // Mock permission denial for public user
      const token = await getJwtToken(context.app, 'public');
      mockRecordManager.createRecord.mockRejectedValue(
        new Error("Role 'public' cannot create records of type 'bylaw'")
      );
      const response = await request(context.app)
        .post('/api/v1/records')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Test Record',
          type: 'bylaw',
          content: '# Test Record\n\nContent here...',
        });
      expect(response.status).toBe(403); // Should be forbidden, not 500
      expect(response.body.error.message).toBe("Permission 'write' required");
    });

    it('should reject creation with invalid record type', async () => {
      // Simulate error for invalid record type
      const token = await getJwtToken(context.app, 'admin');
      mockRecordManager.createRecord.mockRejectedValue(
        new Error('Invalid record type')
      );
      const response = await request(context.app)
        .post('/api/v1/records')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Test Record',
          type: 'invalid-type',
          content: '# Test Record\n\nContent here...',
        });
      expect(response.status).toBe(500);
      expect(response.body.error.message).toBe('Failed to create record');
      expect(response.body.error.details).toContain('Invalid record type');
    });

    it('should reject creation with missing required fields', async () => {
      const token = await getJwtToken(context.app, 'admin');
      const response = await request(context.app)
        .post('/api/v1/records')
        .set('Authorization', `Bearer ${token}`)
        .send({
          // Missing title and type
          content: '# Test Record\n\nContent here...',
        });

      expect(response.status).toBe(400);
      expect(response.body.error.message).toBe('Invalid record data');
    });
  });

  describe('PUT /api/v1/records/:id - Update Record', () => {
    it('should update a record successfully', async () => {
      const mockRecord = {
        id: 'test-record',
        title: 'Updated Test Record',
        type: 'bylaw',
        status: 'proposed',
        content: '# Updated Test Record\n\nUpdated content...',
        metadata: {
          author: 'admin',
          created: '2025-07-09T15:46:32.263Z',
          updated: '2025-07-09T15:48:21.082Z',
          updatedBy: 'admin',
          version: '1.0.0',
        },
        path: 'records/bylaw/test-record.md',
      };

      // Mock the RecordManager
      mockRecordManager.getRecord.mockResolvedValue(mockRecord);
      mockRecordManager.updateRecord.mockResolvedValue(mockRecord);

      const token = await getJwtToken(context.app, 'admin');
      const response = await request(context.app)
        .put('/api/v1/records/test-record')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Updated Test Record',
          content: '# Updated Test Record\n\nUpdated content...',
          status: 'proposed',
          metadata: { priority: 'urgent' },
        });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        id: 'test-record',
        title: 'Updated Test Record',
        type: 'bylaw',
        status: 'proposed',
        content: '# Updated Test Record\n\nUpdated content...',
        metadata: {
          author: 'admin',
          created: '2025-07-09T15:46:32.263Z',
          updated: '2025-07-09T15:48:21.082Z',
          updatedBy: 'admin',
          version: '1.0.0',
        },
        path: 'records/bylaw/test-record.md',
      });

      // Verify RecordManager was called correctly
      expect(mockRecordManager.updateRecord).toHaveBeenCalledWith(
        'test-record',
        {
          title: 'Updated Test Record',
          content: '# Updated Test Record\n\nUpdated content...',
          status: 'proposed',
          metadata: { priority: 'urgent' },
        },
        'admin'
      );
    });

    it('should return 404 for non-existent record', async () => {
      // Mock the RecordManager to return null
      mockRecordManager.getRecord.mockResolvedValue(null);
      const token = await getJwtToken(context.app, 'admin');

      const response = await request(context.app)
        .put('/api/v1/records/non-existent')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Updated Test Record',
        });

      expect(response.status).toBe(404);
      expect(response.body.error.message).toBe('Record not found');
    });

    it('should reject update with insufficient permissions', async () => {
      // Mock permission denial for public user
      const token = await getJwtToken(context.app, 'public');
      mockRecordManager.updateRecord.mockRejectedValue(
        new Error("Role 'public' cannot update records of type 'bylaw'")
      );
      const response = await request(context.app)
        .put('/api/v1/records/test-record')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Updated Test Record',
        });
      expect(response.status).toBe(403); // Should be forbidden, not 500
      expect(response.body.error.message).toBe("Permission 'write' required");
    });
  });

  describe('DELETE /api/v1/records/:id - Archive Record', () => {
    it('should archive a record successfully', async () => {
      const mockRecord = {
        id: 'test-record',
        title: 'Test Record',
        type: 'bylaw',
        status: 'draft',
        content: '# Test Record\n\nContent here...',
        metadata: { author: 'admin' },
        path: 'records/bylaw/test-record.md',
      };

      // Mock the RecordManager
      mockRecordManager.getRecord.mockResolvedValue(mockRecord);
      mockRecordManager.archiveRecord.mockResolvedValue(true);

      const token = await getJwtToken(context.app, 'admin');
      const response = await request(context.app)
        .delete('/api/v1/records/test-record')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe(
        'Record test-record archived successfully'
      );
      expect(response.body.archivedAt).toBeDefined();
      expect(response.body.archiveLocation).toBe(
        'archive/bylaw/test-record.md'
      );
      expect(response.body.note).toBe(
        'Record has been moved to archive and is no longer active'
      );

      // Verify RecordManager was called correctly
      expect(mockRecordManager.archiveRecord).toHaveBeenCalledWith(
        'test-record',
        'admin'
      );
    });

    it('should return 404 for non-existent record', async () => {
      // Mock the RecordManager to return null
      mockRecordManager.getRecord.mockResolvedValue(null);

      const token = await getJwtToken(context.app, 'admin');
      const response = await request(context.app)
        .delete('/api/v1/records/non-existent')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(404);
      expect(response.body.error.message).toBe('Record not found');
    });

    it('should reject archive with insufficient permissions', async () => {
      // Mock permission denial for public user
      const token = await getJwtToken(context.app, 'public');
      mockRecordManager.archiveRecord.mockRejectedValue(
        new Error("Role 'public' cannot archive records of type 'bylaw'")
      );
      const response = await request(context.app)
        .delete('/api/v1/records/test-record')
        .set('Authorization', `Bearer ${token}`);
      expect(response.status).toBe(403); // Should be forbidden, not 500
      expect(response.body.error.message).toBe("Permission 'write' required");
    });
  });

  describe('GET /api/v1/records/:id - Get Record', () => {
    it('should get a record successfully', async () => {
      const mockRecord = {
        id: 'test-record',
        title: 'Test Record',
        type: 'bylaw',
        status: 'draft',
        content: '# Test Record\n\nContent here...',
        metadata: {
          author: 'admin',
          created: '2025-07-09T15:46:32.263Z',
          version: '1.0.0',
        },
        path: 'records/bylaw/test-record.md',
      };

      // Mock the RecordManager
      mockRecordManager.getRecord.mockResolvedValue(mockRecord);

      const response = await request(context.app).get(
        '/api/v1/records/test-record'
      );

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        id: 'test-record',
        title: 'Test Record',
        type: 'bylaw',
        status: 'draft',
        content: '# Test Record\n\nContent here...',
        metadata: {
          author: 'admin',
          created: '2025-07-09T15:46:32.263Z',
          version: '1.0.0',
        },
        path: 'records/bylaw/test-record.md',
      });

      // Verify RecordManager was called correctly
      expect(mockRecordManager.getRecord).toHaveBeenCalledWith('test-record');
    });

    it('should return 404 for non-existent record', async () => {
      // Mock the RecordManager to return null
      mockRecordManager.getRecord.mockResolvedValue(null);

      const response = await request(context.app).get(
        '/api/v1/records/non-existent'
      );

      expect(response.status).toBe(404);
      expect(response.body.error.message).toBe('Record not found');
    });
  });

  describe('GET /api/v1/records - List Records', () => {
    it('should list records successfully', async () => {
      const mockRecords = {
        records: [
          {
            id: 'record-1',
            title: 'Record 1',
            type: 'bylaw',
            status: 'draft',
            content: '# Record 1\n\nContent here...',
            metadata: { author: 'admin' },
            path: 'records/bylaw/record-1.md',
          },
          {
            id: 'record-2',
            title: 'Record 2',
            type: 'policy',
            status: 'proposed',
            content: '# Record 2\n\nContent here...',
            metadata: { author: 'clerk' },
            path: 'records/policy/record-2.md',
          },
        ],
        total: 2,
        page: 1,
        limit: 10,
      };

      // Mock the RecordManager
      mockRecordManager.listRecords.mockResolvedValue(mockRecords);

      const response = await request(context.app)
        .get('/api/v1/records')
        .query({ type: 'bylaw', limit: '5' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        records: [
          {
            id: 'record-1',
            title: 'Record 1',
            type: 'bylaw',
            status: 'draft',
            content: '# Record 1\n\nContent here...',
            metadata: { author: 'admin' },
            path: 'records/bylaw/record-1.md',
          },
          {
            id: 'record-2',
            title: 'Record 2',
            type: 'policy',
            status: 'proposed',
            content: '# Record 2\n\nContent here...',
            metadata: { author: 'clerk' },
            path: 'records/policy/record-2.md',
          },
        ],
        total: 2,
        page: 1,
        limit: 10,
      });

      // Verify RecordManager was called correctly
      expect(mockRecordManager.listRecords).toHaveBeenCalledWith({
        type: 'bylaw',
        limit: 5,
      });
    });

    it('should handle empty results', async () => {
      const mockRecords = {
        records: [],
        total: 0,
        page: 1,
        limit: 10,
      };

      // Mock the RecordManager
      mockRecordManager.listRecords.mockResolvedValue(mockRecords);

      const response = await request(context.app)
        .get('/api/v1/records')
        .query({ type: 'nonexistent' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        records: [],
        total: 0,
        page: 1,
        limit: 10,
      });
    });
  });

  describe('Authentication and Authorization', () => {
    it('should require JWT token for protected endpoints', async () => {
      const response = await request(context.app).post('/api/v1/records').send({
        title: 'Test Record',
        type: 'bylaw',
        content: '# Test Record\n\nContent here...',
      });

      expect(response.status).toBe(401);
      expect(response.body.error.message).toBe('Authorization header required');
    });

    it('should map JWT tokens to roles correctly', async () => {
      const mockRecord = {
        id: 'test-record',
        title: 'Test Record',
        type: 'bylaw',
        status: 'draft',
        content: '# Test Record\n\nContent here...',
        metadata: { author: 'council' },
        path: 'records/bylaw/test-record.md',
      };

      // Mock the RecordManager
      mockRecordManager.createRecord.mockResolvedValue(mockRecord);
      const token = await getJwtToken(context.app, 'council');

      const response = await request(context.app)
        .post('/api/v1/records')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Test Record',
          type: 'bylaw',
          content: '# Test Record\n\nContent here...',
        });

      expect(response.status).toBe(201);
      expect(response.body.metadata.author).toBe('council');

      // Verify the role was passed correctly
      expect(mockRecordManager.createRecord).toHaveBeenCalledWith(
        expect.any(Object),
        'council'
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle RecordManager errors gracefully', async () => {
      // Mock the RecordManager to throw an error
      mockRecordManager.createRecord.mockRejectedValue(
        new Error('Database connection failed')
      );
      const token = await getJwtToken(context.app, 'admin');

      const response = await request(context.app)
        .post('/api/v1/records')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Test Record',
          type: 'bylaw',
          content: '# Test Record\n\nContent here...',
        });

      expect(response.status).toBe(500);
      expect(response.body.error.message).toBe('Failed to create record');
      expect(response.body.error.details).toBe('Database connection failed');
    });

    it('should handle validation errors', async () => {
      const token = await getJwtToken(context.app, 'admin');
      const response = await request(context.app)
        .post('/api/v1/records')
        .set('Authorization', `Bearer ${token}`)
        .send({
          // Missing required fields
        });

      expect(response.status).toBe(400);
      expect(response.body.error.message).toBe('Invalid record data');
      expect(response.body.error.details).toBeDefined();
    });
  });
});
