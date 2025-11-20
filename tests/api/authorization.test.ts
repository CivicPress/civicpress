import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import {
  createAPITestContext,
  cleanupAPITestContext,
  setupGlobalTestEnvironment,
} from '../fixtures/test-setup';

// Setup global test environment
await setupGlobalTestEnvironment();

describe('Authorization System', () => {
  let context: any;
  let adminToken: string;
  let clerkToken: string;
  let publicToken: string;
  let recordId: string;

  beforeEach(async () => {
    context = await createAPITestContext();

    // Get authentication tokens for different roles
    const adminResponse = await request(context.api.getApp())
      .post('/api/v1/auth/simulated')
      .send({
        username: 'admin',
        role: 'admin',
      });
    adminToken = adminResponse.body.data.session.token;

    const clerkResponse = await request(context.api.getApp())
      .post('/api/v1/auth/simulated')
      .send({
        username: 'clerk',
        role: 'clerk',
      });
    clerkToken = clerkResponse.body.data.session.token;

    const publicResponse = await request(context.api.getApp())
      .post('/api/v1/auth/simulated')
      .send({
        username: 'public',
        role: 'public',
      });
    publicToken = publicResponse.body.data.session.token;

    // Create a test record for testing permissions
    const createResponse = await request(context.api.getApp())
      .post('/api/v1/records')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        type: 'policy',
        title: 'Test Policy for Authorization',
        content:
          '# Test Policy\n\nThis is a test policy for authorization testing.',
      });

    // Debug: Log response if creation failed
    if (!createResponse.body.data) {
      console.error('Record creation failed:', {
        status: createResponse.status,
        body: createResponse.body,
      });
      throw new Error(
        `Record creation failed: ${JSON.stringify(createResponse.body)}`
      );
    }

    recordId = createResponse.body.data.id;
  });

  afterEach(async () => {
    await cleanupAPITestContext(context);
  });

  describe('Record Creation Permissions', () => {
    it('should allow admin to create records', async () => {
      const response = await request(context.api.getApp())
        .post('/api/v1/records')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          type: 'policy',
          title: 'Admin Created Policy',
          content: '# Admin Policy\n\nCreated by admin.',
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
    });

    it('should allow clerk to create records', async () => {
      const response = await request(context.api.getApp())
        .post('/api/v1/records')
        .set('Authorization', `Bearer ${clerkToken}`)
        .send({
          type: 'policy',
          title: 'Clerk Created Policy',
          content: '# Clerk Policy\n\nCreated by clerk.',
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
    });

    it('should deny public users from creating records', async () => {
      const response = await request(context.api.getApp())
        .post('/api/v1/records')
        .set('Authorization', `Bearer ${publicToken}`)
        .send({
          type: 'policy',
          title: 'Public Created Policy',
          content: '# Public Policy\n\nCreated by public user.',
        });

      expect(response.status).toBe(403);
    });
  });

  describe('Record Reading Permissions', () => {
    it('should allow admin to read records', async () => {
      const response = await request(context.api.getApp())
        .get(`/api/v1/records/${recordId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should allow clerk to read records', async () => {
      const response = await request(context.api.getApp())
        .get(`/api/v1/records/${recordId}`)
        .set('Authorization', `Bearer ${clerkToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should allow public users to read records', async () => {
      const response = await request(context.api.getApp())
        .get(`/api/v1/records/${recordId}`)
        .set('Authorization', `Bearer ${publicToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe('Record Update Permissions', () => {
    it('should allow admin to update records', async () => {
      const response = await request(context.api.getApp())
        .put(`/api/v1/records/${recordId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Updated by Admin',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should allow clerk to update records', async () => {
      const response = await request(context.api.getApp())
        .put(`/api/v1/records/${recordId}`)
        .set('Authorization', `Bearer ${clerkToken}`)
        .send({
          title: 'Updated by Clerk',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe('Record Deletion Permissions', () => {
    it('should allow admin to delete records', async () => {
      const response = await request(context.api.getApp())
        .post('/api/v1/records')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          type: 'policy',
          title: 'Policy to Delete',
          content: '# Policy to Delete\n\nThis will be deleted.',
        });

      const newRecordId = response.body.data.id;

      const deleteResponse = await request(context.api.getApp())
        .delete(`/api/v1/records/${newRecordId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(deleteResponse.status).toBe(200);
      expect(deleteResponse.body.success).toBe(true);
    });

    it('should deny clerk from deleting records', async () => {
      const response = await request(context.api.getApp())
        .post('/api/v1/records')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          type: 'policy',
          title: 'Policy to Delete by Clerk',
          content: '# Policy to Delete\n\nThis will not be deleted by clerk.',
        });

      const newRecordId = response.body.data.id;

      const deleteResponse = await request(context.api.getApp())
        .delete(`/api/v1/records/${newRecordId}`)
        .set('Authorization', `Bearer ${clerkToken}`);

      expect(deleteResponse.status).toBe(403);
    });
  });

  describe('Role-Based Access Control', () => {
    it('should enforce role-based permissions correctly', async () => {
      // Test that different roles have different access levels
      const adminResponse = await request(context.api.getApp())
        .post('/api/v1/records')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          type: 'policy',
          title: 'Role Test Policy',
          content: '# Role Test\n\nTesting role permissions.',
        });

      expect(adminResponse.status).toBe(201);

      const clerkResponse = await request(context.api.getApp())
        .post('/api/v1/records')
        .set('Authorization', `Bearer ${clerkToken}`)
        .send({
          type: 'policy',
          title: 'Role Test Policy 2',
          content: '# Role Test 2\n\nTesting clerk permissions.',
        });

      expect(clerkResponse.status).toBe(201);

      const publicResponse = await request(context.api.getApp())
        .post('/api/v1/records')
        .set('Authorization', `Bearer ${publicToken}`)
        .send({
          type: 'policy',
          title: 'Role Test Policy 3',
          content: '# Role Test 3\n\nTesting public permissions.',
        });

      expect(publicResponse.status).toBe(403);
    });

    it('should handle invalid tokens correctly', async () => {
      const response = await request(context.api.getApp())
        .put(`/api/v1/records/${recordId}`)
        .set('Authorization', 'Bearer invalid-token')
        .send({
          title: 'Updated with Invalid Token',
        });

      expect(response.status).toBe(401);
    });
  });
});
