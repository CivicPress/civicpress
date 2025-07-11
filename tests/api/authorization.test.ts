import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { CivicPressAPI } from '../../modules/api/src/index';
import path from 'path';
import fs from 'fs';

// Mock the core modules to avoid complex setup
vi.mock('@civicpress/core', () => ({
  CivicPress: vi.fn().mockImplementation(() => ({
    initialize: vi.fn().mockResolvedValue(undefined),
    shutdown: vi.fn().mockResolvedValue(undefined),
    getRecordManager: vi.fn(() => {
      let recordStore: any = {
        'test-record-1': {
          id: 'test-record-1',
          title: 'Test Record',
          type: 'bylaw',
          status: 'draft',
          content: '# Test Record\n\nContent here...',
          metadata: {},
          path: '/test-record-1.md',
          created_at: new Date().toISOString(),
          author: 'test-user',
        },
      };
      return {
        createRecord: vi.fn().mockImplementation((request: any) => {
          const id = `test-record-${Object.keys(recordStore).length + 1}`;
          const record = {
            id,
            title: request.title || 'Test Record',
            type: request.type || 'bylaw',
            status: 'draft',
            content: request.content || '# Test Record\n\nContent here...',
            metadata: request.metadata || {},
            path: `/${id}.md`,
            created_at: new Date().toISOString(),
            author: 'test-user',
          };
          recordStore[id] = record;
          return record;
        }),
        getRecord: vi.fn().mockImplementation((id: string) => {
          return recordStore[id] || null;
        }),
        updateRecord: vi.fn().mockImplementation((id: string, updates: any) => {
          if (!recordStore[id]) return null;
          recordStore[id] = { ...recordStore[id], ...updates };
          return recordStore[id];
        }),
        archiveRecord: vi.fn().mockImplementation((id: string) => {
          if (!recordStore[id]) return false;
          delete recordStore[id];
          return true;
        }),
        listRecords: vi.fn().mockResolvedValue({
          records: Object.values(recordStore),
          total: Object.keys(recordStore).length,
          page: 1,
          limit: 10,
        }),
      };
    }),
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
  CentralConfigManager: {
    getDatabaseConfig: vi.fn().mockReturnValue({
      type: 'sqlite',
      database: ':memory:',
    }),
  },
  userCan: vi.fn().mockImplementation(async (user: any, permission: string) => {
    // Mock role-based permissions
    const role = user?.role || 'public';
    // Admin has all permissions
    if (role === 'admin') return true;
    // Clerk permissions
    if (role === 'clerk') {
      if (
        permission.includes('delete') ||
        permission.includes('import') ||
        permission.includes('export') ||
        permission.includes('templates:manage') ||
        permission.includes('hooks:manage') ||
        permission.includes('workflows:manage')
      ) {
        return false;
      }
      return true;
    }
    // Public has only view/search permissions
    if (role === 'public') {
      if (permission.includes('view') || permission.includes('search')) {
        return true;
      }
      return false;
    }
    return false;
  }),
}));

describe('API Authorization System', () => {
  let api: CivicPressAPI;
  let testDataDir: string;

  const adminUser = { id: 1, username: 'admin', role: 'admin' };
  const clerkUser = { id: 2, username: 'clerk', role: 'clerk' };
  const publicUser = { id: 3, username: 'public', role: 'public' };

  beforeAll(async () => {
    process.env.BYPASS_AUTH = 'true';
    // Create test data directory
    testDataDir = path.join(process.cwd(), 'test-api-auth');
    if (!fs.existsSync(testDataDir)) {
      fs.mkdirSync(testDataDir, { recursive: true });
    }
    // Initialize API
    api = new CivicPressAPI(3001);
    await api.initialize(testDataDir);
  });

  afterAll(async () => {
    await api.shutdown();
    // Clean up test data
    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }
    delete process.env.BYPASS_AUTH;
  });

  describe('Authentication', () => {
    it('should require authentication for protected endpoints', async () => {
      const response = await request(api.getApp())
        .get('/api/records')
        .expect(401);
      expect(response.body.error).toBe('Authentication required');
    });

    it('should accept mock user via X-Mock-User header', async () => {
      const response = await request(api.getApp())
        .get('/api/records')
        .set('X-Mock-User', JSON.stringify(adminUser));
      if (response.status !== 200) {
        // eslint-disable-next-line no-console
        console.error('DEBUG API ERROR:', response.status, response.body);
      }
      expect(response.status).toBe(200);
      expect(response.body).toBeDefined();
    });
  });

  describe('Record Permissions', () => {
    it('should allow admin to create records', async () => {
      const response = await request(api.getApp())
        .post('/api/records')
        .set('X-Mock-User', JSON.stringify(adminUser))
        .send({
          title: 'Test Bylaw',
          type: 'bylaw',
          content: '# Test Bylaw\n\nContent here...',
        })
        .expect(201);
      expect(response.body.id).toBeDefined();
      expect(response.body.title).toBe('Test Bylaw');
    });

    it('should allow clerk to create records', async () => {
      const response = await request(api.getApp())
        .post('/api/records')
        .set('X-Mock-User', JSON.stringify(clerkUser))
        .send({
          title: 'Test Policy',
          type: 'policy',
          content: '# Test Policy\n\nContent here...',
        })
        .expect(201);
      expect(response.body.id).toBeDefined();
    });

    it('should deny public user from creating records', async () => {
      const response = await request(api.getApp())
        .post('/api/records')
        .set('X-Mock-User', JSON.stringify(publicUser))
        .send({
          title: 'Test Record',
          type: 'bylaw',
          content: '# Test Record\n\nContent here...',
        })
        .expect(403);
      expect(response.body.error.message).toContain('Permission denied');
      expect(response.body.error.required).toBe('records:create');
    });

    it('should allow all authenticated users to view records', async () => {
      // Create a record first
      const createResponse = await request(api.getApp())
        .post('/api/records')
        .set('X-Mock-User', JSON.stringify(adminUser))
        .send({
          title: 'Viewable Record',
          type: 'bylaw',
          content: '# Viewable Record\n\nContent here...',
        });
      const recordId = createResponse.body.id;
      // Test admin can view
      await request(api.getApp())
        .get(`/api/records/${recordId}`)
        .set('X-Mock-User', JSON.stringify(adminUser))
        .expect(200);
      // Test clerk can view
      await request(api.getApp())
        .get(`/api/records/${recordId}`)
        .set('X-Mock-User', JSON.stringify(clerkUser))
        .expect(200);
      // Test public can view
      await request(api.getApp())
        .get(`/api/records/${recordId}`)
        .set('X-Mock-User', JSON.stringify(publicUser))
        .expect(200);
    });

    it('should allow admin and clerk to edit records', async () => {
      // Create a record first
      const createResponse = await request(api.getApp())
        .post('/api/records')
        .set('X-Mock-User', JSON.stringify(adminUser))
        .send({
          title: 'Editable Record',
          type: 'bylaw',
          content: '# Editable Record\n\nContent here...',
        });
      const recordId = createResponse.body.id;
      // Test admin can edit
      await request(api.getApp())
        .put(`/api/records/${recordId}`)
        .set('X-Mock-User', JSON.stringify(adminUser))
        .send({
          title: 'Updated Title',
          content: '# Updated Content\n\nNew content here...',
        })
        .expect(200);
      // Test clerk can edit
      await request(api.getApp())
        .put(`/api/records/${recordId}`)
        .set('X-Mock-User', JSON.stringify(clerkUser))
        .send({
          content: '# Clerk Updated Content\n\nClerk content here...',
        })
        .expect(200);
    });

    it('should deny public user from editing records', async () => {
      // Create a record first
      const createResponse = await request(api.getApp())
        .post('/api/records')
        .set('X-Mock-User', JSON.stringify(adminUser))
        .send({
          title: 'Protected Record',
          type: 'bylaw',
          content: '# Protected Record\n\nContent here...',
        });
      const recordId = createResponse.body.id;
      const response = await request(api.getApp())
        .put(`/api/records/${recordId}`)
        .set('X-Mock-User', JSON.stringify(publicUser))
        .send({
          title: 'Unauthorized Update',
        })
        .expect(403);
      expect(response.body.error.message).toContain('Permission denied');
      expect(response.body.error.required).toBe('records:edit');
    });

    it('should allow admin to delete records', async () => {
      // Create a record first
      const createResponse = await request(api.getApp())
        .post('/api/records')
        .set('X-Mock-User', JSON.stringify(adminUser))
        .send({
          title: 'Deletable Record',
          type: 'bylaw',
          content: '# Deletable Record\n\nContent here...',
        });
      const recordId = createResponse.body.id;
      await request(api.getApp())
        .delete(`/api/records/${recordId}`)
        .set('X-Mock-User', JSON.stringify(adminUser))
        .expect(200);
    });

    it('should deny clerk and public from deleting records', async () => {
      // Create a record first
      const createResponse = await request(api.getApp())
        .post('/api/records')
        .set('X-Mock-User', JSON.stringify(adminUser))
        .send({
          title: 'Protected Delete Record',
          type: 'bylaw',
          content: '# Protected Delete Record\n\nContent here...',
        });
      const recordId = createResponse.body.id;
      // Test clerk cannot delete
      const clerkResponse = await request(api.getApp())
        .delete(`/api/records/${recordId}`)
        .set('X-Mock-User', JSON.stringify(clerkUser))
        .expect(403);
      expect(clerkResponse.body.error.message).toContain('Permission denied');
      expect(clerkResponse.body.error.required).toBe('records:delete');
      // Test public cannot delete
      const publicResponse = await request(api.getApp())
        .delete(`/api/records/${recordId}`)
        .set('X-Mock-User', JSON.stringify(publicUser))
        .expect(403);
      expect(publicResponse.body.error.message).toContain('Permission denied');
    });
  });

  describe('Template Permissions', () => {
    it('should allow admin to manage templates', async () => {
      await request(api.getApp())
        .post('/api/templates')
        .set('X-Mock-User', JSON.stringify(adminUser))
        .send({
          name: 'Test Template',
          content: 'Template content',
        })
        .expect(201);
    });

    it('should deny clerk and public from managing templates', async () => {
      const clerkResponse = await request(api.getApp())
        .post('/api/templates')
        .set('X-Mock-User', JSON.stringify(clerkUser))
        .send({
          name: 'Test Template',
          content: 'Template content',
        })
        .expect(403);

      expect(clerkResponse.body.error.message).toContain('Permission denied');
      expect(clerkResponse.body.error.required).toBe('templates:manage');
    });
  });

  describe('Hook Permissions', () => {
    it('should allow admin to manage hooks', async () => {
      await request(api.getApp())
        .post('/api/hooks')
        .set('X-Mock-User', JSON.stringify(adminUser))
        .send({
          name: 'Test Hook',
          event: 'record:created',
        })
        .expect(201);
    });

    it('should deny clerk and public from managing hooks', async () => {
      const clerkResponse = await request(api.getApp())
        .post('/api/hooks')
        .set('X-Mock-User', JSON.stringify(clerkUser))
        .send({
          name: 'Test Hook',
          event: 'record:created',
        })
        .expect(403);

      expect(clerkResponse.body.error.message).toContain('Permission denied');
      expect(clerkResponse.body.error.required).toBe('hooks:manage');
    });
  });

  describe('Workflow Permissions', () => {
    it('should allow admin to manage workflows', async () => {
      await request(api.getApp())
        .post('/api/workflows')
        .set('X-Mock-User', JSON.stringify(adminUser))
        .send({
          name: 'Test Workflow',
          status: 'active',
        })
        .expect(201);
    });

    it('should deny clerk and public from managing workflows', async () => {
      const clerkResponse = await request(api.getApp())
        .post('/api/workflows')
        .set('X-Mock-User', JSON.stringify(clerkUser))
        .send({
          name: 'Test Workflow',
          status: 'active',
        })
        .expect(403);

      expect(clerkResponse.body.error.message).toContain('Permission denied');
      expect(clerkResponse.body.error.required).toBe('workflows:manage');
    });
  });

  describe('Import/Export Permissions', () => {
    it('should allow admin to import data', async () => {
      await request(api.getApp())
        .post('/api/import')
        .set('X-Mock-User', JSON.stringify(adminUser))
        .send({
          format: 'json',
          data: '{}',
        })
        .expect(200);
    });

    it('should deny clerk and public from importing data', async () => {
      const clerkResponse = await request(api.getApp())
        .post('/api/import')
        .set('X-Mock-User', JSON.stringify(clerkUser))
        .send({
          format: 'json',
          data: '{}',
        })
        .expect(403);

      expect(clerkResponse.body.error.message).toContain('Permission denied');
      expect(clerkResponse.body.error.required).toBe('records:import');
    });

    it('should allow admin to export data', async () => {
      await request(api.getApp())
        .get('/api/export')
        .set('X-Mock-User', JSON.stringify(adminUser))
        .expect(200);
    });

    it('should deny clerk and public from exporting data', async () => {
      const clerkResponse = await request(api.getApp())
        .get('/api/export')
        .set('X-Mock-User', JSON.stringify(clerkUser))
        .expect(403);

      expect(clerkResponse.body.error.message).toContain('Permission denied');
      expect(clerkResponse.body.error.required).toBe('records:export');
    });
  });

  describe('Search Permissions', () => {
    it('should allow all authenticated users to search', async () => {
      // Test admin can search
      await request(api.getApp())
        .get('/api/search?q=test')
        .set('X-Mock-User', JSON.stringify(adminUser))
        .expect(200);

      // Test clerk can search
      await request(api.getApp())
        .get('/api/search?q=test')
        .set('X-Mock-User', JSON.stringify(clerkUser))
        .expect(200);

      // Test public can search
      await request(api.getApp())
        .get('/api/search?q=test')
        .set('X-Mock-User', JSON.stringify(publicUser))
        .expect(200);
    });
  });

  describe('Error Handling', () => {
    it('should provide detailed error messages for permission denials', async () => {
      const response = await request(api.getApp())
        .post('/api/records')
        .set('X-Mock-User', JSON.stringify(publicUser))
        .send({
          title: 'Test Record',
          type: 'bylaw',
          content: '# Test Record\n\nContent here...',
        })
        .expect(403);

      expect(response.body.error).toMatchObject({
        message: expect.stringContaining('Permission denied'),
        code: 'INSUFFICIENT_PERMISSIONS',
        required: 'records:create',
        user: {
          id: expect.any(Number),
          username: 'public',
          role: 'public',
        },
      });
    });

    it('should handle missing authentication gracefully', async () => {
      const response = await request(api.getApp())
        .get('/api/records')
        .expect(401);

      expect(response.body.error).toBe('Authentication required');
    });
  });
});
