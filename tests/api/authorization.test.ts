import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import {
  createAPITestContext,
  cleanupAPITestContext,
  setupGlobalTestEnvironment,
} from '../fixtures/test-setup';

// Setup global test environment
await setupGlobalTestEnvironment();

describe('API Authorization System', () => {
  let context: any;
  let adminToken: string;
  let clerkToken: string;
  let publicToken: string;

  beforeEach(async () => {
    context = await createAPITestContext();

    // Get authentication tokens for different roles
    const adminResponse = await request(context.api.getApp())
      .post('/auth/simulated')
      .send({
        username: 'admin',
        role: 'admin',
      });
    adminToken = adminResponse.body.data.session.token;

    const clerkResponse = await request(context.api.getApp())
      .post('/auth/simulated')
      .send({
        username: 'clerk',
        role: 'clerk',
      });
    clerkToken = clerkResponse.body.data.session.token;

    const publicResponse = await request(context.api.getApp())
      .post('/auth/simulated')
      .send({
        username: 'public',
        role: 'public',
      });
    publicToken = publicResponse.body.data.session.token;
  });

  afterEach(async () => {
    await cleanupAPITestContext(context);
  });

  describe('Record Permissions', () => {
    it('should allow admin to create records', async () => {
      const response = await request(context.api.getApp())
        .post('/api/records')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Test Bylaw',
          type: 'bylaw',
          content: '# Test Bylaw\n\nContent here...',
        })
        .expect(201);
      expect(response.body.data.id).toBeDefined();
      expect(response.body.data.title).toBe('Test Bylaw');
    });

    it('should allow clerk to create records', async () => {
      const response = await request(context.api.getApp())
        .post('/api/records')
        .set('Authorization', `Bearer ${clerkToken}`)
        .send({
          title: 'Test Policy',
          type: 'policy',
          content: '# Test Policy\n\nContent here...',
        })
        .expect(201);
      expect(response.body.data.id).toBeDefined();
    });

    it('should allow all authenticated users to view records', async () => {
      // First create a record
      const createResponse = await request(context.api.getApp())
        .post('/api/records')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Test Record',
          type: 'bylaw',
          content: '# Test Record\n\nContent here...',
        });

      const recordId = createResponse.body.data.id;

      // Test admin can view
      await request(context.api.getApp())
        .get(`/api/records/${recordId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      // Test clerk can view
      await request(context.api.getApp())
        .get(`/api/records/${recordId}`)
        .set('Authorization', `Bearer ${clerkToken}`)
        .expect(200);

      // Test public can view
      await request(context.api.getApp())
        .get(`/api/records/${recordId}`)
        .set('Authorization', `Bearer ${publicToken}`)
        .expect(200);
    });

    it('should allow admin and clerk to edit records', async () => {
      // First create a record
      const createResponse = await request(context.api.getApp())
        .post('/api/records')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Test Record',
          type: 'bylaw',
          content: '# Test Record\n\nContent here...',
        });

      const recordId = createResponse.body.data.id;

      // Test admin can edit
      await request(context.api.getApp())
        .put(`/api/records/${recordId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Updated Content',
          content: '# Updated Content\n\nNew content here...',
        })
        .expect(200);

      // Test clerk can edit
      await request(context.api.getApp())
        .put(`/api/records/${recordId}`)
        .set('Authorization', `Bearer ${clerkToken}`)
        .send({
          title: 'Updated Content',
          content: '# Updated Content\n\nNew content here...',
        })
        .expect(200);
    });

    it('should allow admin to delete records', async () => {
      // First create a record
      const createResponse = await request(context.api.getApp())
        .post('/api/records')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Test Record',
          type: 'bylaw',
          content: '# Test Record\n\nContent here...',
        });

      const recordId = createResponse.body.data.id;

      // Test admin can delete
      await request(context.api.getApp())
        .delete(`/api/records/${recordId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });

    it('should prevent clerk from deleting records', async () => {
      // First create a record
      const createResponse = await request(context.api.getApp())
        .post('/api/records')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Test Record',
          type: 'bylaw',
          content: '# Test Record\n\nContent here...',
        });

      const recordId = createResponse.body.data.id;

      // Test clerk cannot delete
      await request(context.api.getApp())
        .delete(`/api/records/${recordId}`)
        .set('Authorization', `Bearer ${clerkToken}`)
        .expect(403);
    });

    it('should prevent public from creating records', async () => {
      await request(context.api.getApp())
        .post('/api/records')
        .set('Authorization', `Bearer ${publicToken}`)
        .send({
          title: 'Test Record',
          type: 'bylaw',
          content: '# Test Record\n\nContent here...',
        })
        .expect(403);
    });

    it('should prevent public from editing records', async () => {
      // First create a record
      const createResponse = await request(context.api.getApp())
        .post('/api/records')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Test Record',
          type: 'bylaw',
          content: '# Test Record\n\nContent here...',
        });

      const recordId = createResponse.body.data.id;

      // Test public cannot edit
      await request(context.api.getApp())
        .put(`/api/records/${recordId}`)
        .set('Authorization', `Bearer ${publicToken}`)
        .send({
          title: 'Updated Content',
          content: '# Updated Content\n\nNew content here...',
        })
        .expect(403);
    });
  });

  describe('Import/Export Permissions', () => {
    it('should allow admin to import data', async () => {
      await request(context.api.getApp())
        .post('/api/import')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          data: '{}',
        })
        .expect(200);
    });

    it('should allow admin to export data', async () => {
      await request(context.api.getApp())
        .get('/api/export')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });

    it('should prevent clerk from importing data', async () => {
      await request(context.api.getApp())
        .post('/api/import')
        .set('Authorization', `Bearer ${clerkToken}`)
        .send({
          data: '{}',
        })
        .expect(403);
    });

    it('should prevent clerk from exporting data', async () => {
      await request(context.api.getApp())
        .get('/api/export')
        .set('Authorization', `Bearer ${clerkToken}`)
        .expect(403);
    });

    it('should prevent public from importing data', async () => {
      await request(context.api.getApp())
        .post('/api/import')
        .set('Authorization', `Bearer ${publicToken}`)
        .send({
          data: '{}',
        })
        .expect(403);
    });

    it('should prevent public from exporting data', async () => {
      await request(context.api.getApp())
        .get('/api/export')
        .set('Authorization', `Bearer ${publicToken}`)
        .expect(403);
    });
  });

  describe('Template Permissions', () => {
    it('should allow admin to manage templates', async () => {
      // Create template
      await request(context.api.getApp())
        .post('/api/templates')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Test Template',
          content: 'Template content',
        })
        .expect(201);

      // Update template
      await request(context.api.getApp())
        .put('/api/templates/template-1')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Updated Template',
          content: 'Updated content',
        })
        .expect(200);

      // Delete template
      await request(context.api.getApp())
        .delete('/api/templates/template-1')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });

    it('should prevent clerk from managing templates', async () => {
      await request(context.api.getApp())
        .post('/api/templates')
        .set('Authorization', `Bearer ${clerkToken}`)
        .send({
          name: 'Test Template',
          content: 'Template content',
        })
        .expect(403);
    });
  });

  describe('Hook Permissions', () => {
    it('should allow admin to manage hooks', async () => {
      // Create hook
      await request(context.api.getApp())
        .post('/api/hooks')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          event: 'record:created',
          handler: 'testHandler',
        })
        .expect(201);

      // Update hook
      await request(context.api.getApp())
        .put('/api/hooks/hook-1')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          event: 'record:updated',
          handler: 'updatedHandler',
        })
        .expect(200);

      // Delete hook
      await request(context.api.getApp())
        .delete('/api/hooks/hook-1')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });

    it('should prevent clerk from managing hooks', async () => {
      await request(context.api.getApp())
        .post('/api/hooks')
        .set('Authorization', `Bearer ${clerkToken}`)
        .send({
          event: 'record:created',
          handler: 'testHandler',
        })
        .expect(403);
    });
  });

  describe('Workflow Permissions', () => {
    it('should allow admin to manage workflows', async () => {
      // Create workflow
      await request(context.api.getApp())
        .post('/api/workflows')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Test Workflow',
          status: 'active',
        })
        .expect(201);

      // Update workflow
      await request(context.api.getApp())
        .put('/api/workflows/workflow-1')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Updated Workflow',
          status: 'inactive',
        })
        .expect(200);

      // Delete workflow
      await request(context.api.getApp())
        .delete('/api/workflows/workflow-1')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });

    it('should prevent clerk from managing workflows', async () => {
      await request(context.api.getApp())
        .post('/api/workflows')
        .set('Authorization', `Bearer ${clerkToken}`)
        .send({
          name: 'Test Workflow',
          status: 'active',
        })
        .expect(403);
    });
  });
});
