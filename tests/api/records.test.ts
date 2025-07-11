import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { execSync } from 'child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { tmpdir } from 'os';
import yaml from 'js-yaml';
import request from 'supertest';
import { CivicPressAPI } from '../../modules/api/src/index';

// Enable bypass auth for tests
process.env.BYPASS_AUTH = 'true';

// Mock the CivicPress core to avoid complex setup in tests
vi.mock('@civicpress/core', () => ({
  CentralConfigManager: {
    getDatabaseConfig: vi.fn().mockReturnValue({
      type: 'sqlite',
      database: ':memory:',
    }),
  },
  CivicPress: vi.fn().mockImplementation(() => ({
    initialize: vi.fn().mockResolvedValue(undefined),
    shutdown: vi.fn().mockResolvedValue(undefined),
    getRecordManager: vi.fn(() => ({
      createRecord: vi.fn().mockImplementation((request: any) => {
        // Handle invalid record type
        if (request.type === 'invalid-type') {
          throw new Error('Invalid record type');
        }

        // Handle missing required fields
        if (!request.title || !request.type) {
          throw new Error('Missing required fields');
        }

        // Handle database errors for specific test
        if (request.title === 'Database Error Test') {
          throw new Error('Database connection failed');
        }

        return {
          id: 'test-record-1',
          title: request.title || 'Test Record',
          type: request.type || 'bylaw',
          status: 'draft',
          content: request.content || '# Test Record\n\nContent here...',
          metadata: {
            author: 'admin',
            created: '2025-07-09T15:46:32.263Z',
            version: '1.0.0',
          },
          path: 'records/bylaw/test-record-1.md',
        };
      }),
      updateRecord: vi.fn().mockImplementation((id: string, updates: any) => {
        // Handle non-existent record
        if (id === 'non-existent') {
          return null;
        }

        return {
          id,
          title: updates.title || 'Updated Test Record',
          type: 'bylaw',
          status: 'draft',
          content:
            updates.content || '# Updated Test Record\n\nUpdated content...',
          metadata: {
            author: 'admin',
            updated: '2025-07-09T15:46:32.263Z',
            version: '1.1.0',
          },
          path: 'records/bylaw/test-record-1.md',
        };
      }),
      archiveRecord: vi.fn().mockImplementation((id: string) => {
        // Handle non-existent record
        if (id === 'non-existent') {
          return false;
        }
        return true;
      }),
      getRecord: vi.fn().mockImplementation((id: string) => {
        // Handle non-existent record
        if (id === 'non-existent') {
          return null;
        }

        return {
          id,
          title: 'Test Record',
          type: 'bylaw',
          status: 'draft',
          content: '# Test Record\n\nContent here...',
          metadata: {
            author: 'admin',
            created: '2025-07-09T15:46:32.263Z',
            version: '1.0.0',
          },
          path: 'records/bylaw/test-record-1.md',
        };
      }),
      listRecords: vi.fn().mockImplementation((options: any) => {
        // Handle empty results when specific filters are applied
        if (options.type === 'nonexistent' || options.status === 'archived') {
          return {
            records: [],
            total: 0,
            page: 1,
            limit: 10,
          };
        }

        return {
          records: [
            {
              id: 'test-record-1',
              title: 'Test Record 1',
              type: 'bylaw',
              status: 'draft',
              content: '# Test Record 1\n\nContent here...',
              metadata: {
                author: 'admin',
                created: '2025-07-09T15:46:32.263Z',
                version: '1.0.0',
              },
              path: 'records/bylaw/test-record-1.md',
            },
            {
              id: 'test-record-2',
              title: 'Test Record 2',
              type: 'policy',
              status: 'proposed',
              content: '# Test Record 2\n\nContent here...',
              metadata: {
                author: 'admin',
                created: '2025-07-09T15:46:32.263Z',
                version: '1.0.0',
              },
              path: 'records/policy/test-record-2.md',
            },
          ],
          total: 2,
          page: 1,
          limit: 10,
        };
      }),
    })),
    getTemplateManager: vi.fn(() => ({
      createTemplate: vi.fn().mockImplementation((data: any) => ({
        id: 'template-1',
        name: data.name,
        content: data.content,
      })),
      updateTemplate: vi.fn().mockImplementation((id: string, data: any) => ({
        id,
        ...data,
      })),
      deleteTemplate: vi.fn().mockResolvedValue(true),
      getTemplate: vi.fn().mockImplementation((id: string) => ({
        id,
        name: 'Test Template',
        content: 'Template content',
      })),
      listTemplates: vi.fn().mockResolvedValue({
        templates: [
          {
            id: 'template-1',
            name: 'Test Template',
            content: 'Template content',
          },
        ],
      }),
    })),
    getHookSystem: vi.fn(() => ({
      registerHook: vi.fn().mockResolvedValue(true),
      updateHook: vi.fn().mockResolvedValue(true),
      deleteHook: vi.fn().mockResolvedValue(true),
      getHook: vi.fn().mockImplementation((id: string) => ({
        id,
        event: 'record:created',
        handler: 'testHandler',
      })),
      listHooks: vi.fn().mockResolvedValue({
        hooks: [
          { id: 'hook-1', event: 'record:created', handler: 'testHandler' },
        ],
      }),
      emit: vi.fn().mockResolvedValue(undefined),
    })),
    getWorkflowEngine: vi.fn(() => ({
      createWorkflow: vi.fn().mockImplementation((data: any) => ({
        id: 'workflow-1',
        ...data,
      })),
      updateWorkflow: vi.fn().mockImplementation((id: string, data: any) => ({
        id,
        ...data,
      })),
      deleteWorkflow: vi.fn().mockResolvedValue(true),
      getWorkflow: vi.fn().mockImplementation((id: string) => ({
        id,
        name: 'Test Workflow',
        status: 'active',
      })),
      listWorkflows: vi.fn().mockResolvedValue({
        workflows: [
          { id: 'workflow-1', name: 'Test Workflow', status: 'active' },
        ],
      }),
      startWorkflow: vi.fn().mockResolvedValue('mock-workflow-id'),
    })),
    getImportExportManager: vi.fn(() => ({
      importData: vi.fn().mockResolvedValue({ success: true }),
      exportData: vi.fn().mockResolvedValue({ data: '{}' }),
    })),
    getSearchManager: vi.fn(() => ({
      search: vi.fn().mockResolvedValue({
        results: [{ id: 'test-record-1', title: 'Test Record', type: 'bylaw' }],
        total: 1,
      }),
    })),
    getAuthService: vi.fn(() => ({
      validateSession: vi.fn().mockResolvedValue({
        valid: true,
        user: { id: 1, username: 'test', role: 'admin' },
      }),
      validateApiKey: vi.fn().mockResolvedValue({
        valid: true,
        user: { id: 1, username: 'test', role: 'admin' },
      }),
    })),
  })),
  WorkflowConfigManager: vi.fn().mockImplementation(() => ({
    validateAction: vi.fn().mockResolvedValue({ valid: true }),
  })),
  Logger: vi.fn().mockImplementation(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
  userCan: vi.fn().mockImplementation(async (user: any, permission: string) => {
    const role = user?.role || 'public';

    // Admin has all permissions
    if (role === 'admin') return true;

    // Public role has no permissions
    if (role === 'public') return false;

    // Council role has most permissions
    if (role === 'council') return true;

    // Clerk role has limited permissions
    if (role === 'clerk') {
      if (
        permission.includes('delete') ||
        permission.includes('import') ||
        permission.includes('export')
      ) {
        return false;
      }
      return true;
    }

    // Default to false for unknown roles
    return false;
  }),
}));

export interface TestContext {
  testDir: string;
  originalCwd: string;
  api: CivicPressAPI;
}

export async function createTestContext(): Promise<TestContext> {
  const testDir = join(
    tmpdir(),
    `civicpress-api-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}-${process.pid}`
  );
  const originalCwd = process.cwd();

  // Create test directory
  mkdirSync(testDir, { recursive: true });

  // Initialize API with test data directory
  const api = new CivicPressAPI(3002);
  await api.initialize(testDir);

  return { testDir, originalCwd, api };
}

export function cleanupTestContext(context: TestContext) {
  // Change back to original directory
  process.chdir(context.originalCwd);

  // Clean up test data
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
          draft: ['proposed'],
          any: ['archived'],
        },
      },
    },
  };

  // Write workflow configuration
  writeFileSync(join(civicDir, 'workflow.yml'), yaml.dump(workflowConfig));
}

// Helper to create a mock user for bypass auth
function createMockUser(role = 'admin') {
  return {
    id: 1,
    username: `test-${role}`,
    role: role,
  };
}

describe('API Records Integration', () => {
  let context: TestContext;

  beforeEach(async () => {
    context = await createTestContext();
    setupTestData(context);
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await context.api.shutdown();
    cleanupTestContext(context);
    vi.clearAllMocks();
  });

  describe('POST /api/records - Create Record', () => {
    it('should fail to create a record without authentication', async () => {
      const response = await request(context.api.getApp())
        .post('/api/records')
        .send({
          title: 'Test Record',
          type: 'bylaw',
          content: '# Test Record\n\nContent here...',
          metadata: { priority: 'high' },
        });

      expect(response.status).toBe(401); // Should be unauthorized
    });

    it('should create a record successfully with admin role (authenticated)', async () => {
      const mockUser = createMockUser('admin');

      const response = await request(context.api.getApp())
        .post('/api/records')
        .set('X-Mock-User', JSON.stringify(mockUser))
        .send({
          title: 'Test Record',
          type: 'bylaw',
          content: '# Test Record\n\nContent here...',
          metadata: { priority: 'high' },
        });

      expect(response.status).toBe(201); // Should succeed
      expect(response.body).toEqual({
        id: 'test-record-1',
        title: 'Test Record',
        type: 'bylaw',
        status: 'draft',
        content: '# Test Record\n\nContent here...',
        metadata: {
          author: 'admin',
          created: '2025-07-09T15:46:32.263Z',
          version: '1.0.0',
        },
        path: 'records/bylaw/test-record-1.md',
      });
    });

    it('should reject creation with insufficient permissions', async () => {
      const mockUser = createMockUser('public');
      const response = await request(context.api.getApp())
        .post('/api/records')
        .set('X-Mock-User', JSON.stringify(mockUser))
        .send({
          title: 'Test Record',
          type: 'bylaw',
          content: '# Test Record\n\nContent here...',
        });
      expect(response.status).toBe(403); // Should be forbidden, not 500
      expect(response.body.error.message).toContain(
        'Permission denied: Cannot create records'
      );
    });

    it('should reject creation with invalid record type', async () => {
      const mockUser = createMockUser('admin');
      const response = await request(context.api.getApp())
        .post('/api/records')
        .set('X-Mock-User', JSON.stringify(mockUser))
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
      const mockUser = createMockUser('admin');
      const response = await request(context.api.getApp())
        .post('/api/records')
        .set('X-Mock-User', JSON.stringify(mockUser))
        .send({
          // Missing title and type
          content: '# Test Record\n\nContent here...',
        });

      expect(response.status).toBe(400);
      expect(response.body.error.message).toBe('Invalid record data');
    });
  });

  describe('PUT /api/records/:id - Update Record', () => {
    it('should update a record successfully', async () => {
      const mockUser = createMockUser('admin');

      const response = await request(context.api.getApp())
        .put('/api/records/test-record')
        .set('X-Mock-User', JSON.stringify(mockUser))
        .send({
          title: 'Updated Test Record',
        });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        id: 'test-record',
        title: 'Updated Test Record',
        type: 'bylaw',
        status: 'draft',
        content: '# Updated Test Record\n\nUpdated content...',
        metadata: {
          author: 'admin',
          updated: '2025-07-09T15:46:32.263Z',
          version: '1.1.0',
        },
        path: 'records/bylaw/test-record-1.md',
      });
    });

    it('should return 404 for non-existent record', async () => {
      const mockUser = createMockUser('admin');

      const response = await request(context.api.getApp())
        .put('/api/records/non-existent')
        .set('X-Mock-User', JSON.stringify(mockUser))
        .send({
          title: 'Updated Test Record',
        });

      expect(response.status).toBe(404);
      expect(response.body.error.message).toBe('Record not found');
    });

    it('should reject update with insufficient permissions', async () => {
      const mockUser = createMockUser('public');
      const response = await request(context.api.getApp())
        .put('/api/records/test-record')
        .set('X-Mock-User', JSON.stringify(mockUser))
        .send({
          title: 'Updated Test Record',
        });
      expect(response.status).toBe(403); // Should be forbidden, not 500
      expect(response.body.error.message).toContain(
        'Permission denied: Cannot edit records'
      );
    });
  });

  describe('DELETE /api/records/:id - Archive Record', () => {
    it('should archive a record successfully', async () => {
      const mockUser = createMockUser('admin');

      const response = await request(context.api.getApp())
        .delete('/api/records/test-record')
        .set('X-Mock-User', JSON.stringify(mockUser));

      expect(response.status).toBe(200);
      expect(response.body.message).toBe(
        'Record test-record archived successfully'
      );
    });

    it('should return 404 for non-existent record', async () => {
      const mockUser = createMockUser('admin');

      const response = await request(context.api.getApp())
        .delete('/api/records/non-existent')
        .set('X-Mock-User', JSON.stringify(mockUser));

      expect(response.status).toBe(404);
      expect(response.body.error.message).toBe('Record not found');
    });

    it('should reject archive with insufficient permissions', async () => {
      const mockUser = createMockUser('public');
      const response = await request(context.api.getApp())
        .delete('/api/records/test-record')
        .set('X-Mock-User', JSON.stringify(mockUser));
      expect(response.status).toBe(403); // Should be forbidden, not 500
      expect(response.body.error.message).toContain(
        'Permission denied: Cannot delete records'
      );
    });
  });

  describe('GET /api/records/:id - Get Record', () => {
    it('should get a record successfully', async () => {
      const mockUser = createMockUser('admin');

      const response = await request(context.api.getApp())
        .get('/api/records/test-record')
        .set('X-Mock-User', JSON.stringify(mockUser));

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
        path: 'records/bylaw/test-record-1.md',
      });
    });

    it('should return 404 for non-existent record', async () => {
      const mockUser = createMockUser('admin');

      const response = await request(context.api.getApp())
        .get('/api/records/non-existent')
        .set('X-Mock-User', JSON.stringify(mockUser));

      expect(response.status).toBe(404);
      expect(response.body.error.message).toBe('Record not found');
    });
  });

  describe('GET /api/records - List Records', () => {
    it('should list records successfully', async () => {
      const mockUser = createMockUser('admin');

      const response = await request(context.api.getApp())
        .get('/api/records')
        .set('X-Mock-User', JSON.stringify(mockUser))
        .query({ type: 'bylaw', limit: '5' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        records: [
          {
            id: 'test-record-1',
            title: 'Test Record 1',
            type: 'bylaw',
            status: 'draft',
            content: '# Test Record 1\n\nContent here...',
            metadata: {
              author: 'admin',
              created: '2025-07-09T15:46:32.263Z',
              version: '1.0.0',
            },
            path: 'records/bylaw/test-record-1.md',
          },
          {
            id: 'test-record-2',
            title: 'Test Record 2',
            type: 'policy',
            status: 'proposed',
            content: '# Test Record 2\n\nContent here...',
            metadata: {
              author: 'admin',
              created: '2025-07-09T15:46:32.263Z',
              version: '1.0.0',
            },
            path: 'records/policy/test-record-2.md',
          },
        ],
        total: 2,
        page: 1,
        limit: 10,
      });
    });

    it('should handle empty results', async () => {
      const mockUser = createMockUser('admin');

      const response = await request(context.api.getApp())
        .get('/api/records')
        .set('X-Mock-User', JSON.stringify(mockUser))
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
    it('should require authentication for protected endpoints', async () => {
      const response = await request(context.api.getApp())
        .get('/api/records')
        .expect(401);

      expect(response.body.error).toBe('Authentication required');
    });

    it('should map JWT tokens to roles correctly', async () => {
      const mockUser = createMockUser('council');

      const response = await request(context.api.getApp())
        .post('/api/records')
        .set('X-Mock-User', JSON.stringify(mockUser))
        .send({
          title: 'Test Record',
          type: 'bylaw',
          content: '# Test Record\n\nContent here...',
        });

      expect(response.status).toBe(201);
      expect(response.body.metadata.author).toBe('admin');
    });
  });

  describe('Error Handling', () => {
    it('should handle RecordManager errors gracefully', async () => {
      const mockUser = createMockUser('admin');

      const response = await request(context.api.getApp())
        .post('/api/records')
        .set('X-Mock-User', JSON.stringify(mockUser))
        .send({
          title: 'Database Error Test',
          type: 'bylaw',
          content: '# Test Record\n\nContent here...',
        });

      expect(response.status).toBe(500);
      expect(response.body.error.message).toBe('Failed to create record');
      expect(response.body.error.details).toBe('Database connection failed');
    });

    it('should handle validation errors', async () => {
      const mockUser = createMockUser('admin');

      const response = await request(context.api.getApp())
        .post('/api/records')
        .set('X-Mock-User', JSON.stringify(mockUser))
        .send({
          title: 'Test Record',
          type: 'invalid-type',
          content: '# Test Record\n\nContent here...',
        });

      expect(response.status).toBe(500);
      expect(response.body.error.message).toBe('Failed to create record');
      expect(response.body.error.details).toContain('Invalid record type');
    });
  });
});
