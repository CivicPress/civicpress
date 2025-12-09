import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createAPITestContext,
  cleanupAPITestContext,
  setupGlobalTestEnvironment,
} from '../fixtures/test-setup';
import request from 'supertest';

// Setup global test environment
await setupGlobalTestEnvironment();

describe('Draft → Publish Workflow Integration', () => {
  let context: any;
  let adminToken: string;

  beforeEach(async () => {
    context = await createAPITestContext();

    // Get authentication token for admin
    const adminResponse = await request(context.api.getApp())
      .post('/api/v1/auth/simulated')
      .send({
        username: 'admin',
        role: 'admin',
      });
    adminToken = adminResponse.body.data.session.token;
  });

  afterEach(async () => {
    await cleanupAPITestContext(context);
  });

  it.skip('should create draft, update workflowState, then publish', async () => {
    const recordId = 'integration-workflow-1';

    // Step 1: Create draft
    const createResponse = await request(context.api.getApp())
      .put(`/api/v1/records/${recordId}/draft`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Integration Test Record',
        type: 'policy',
        markdownBody: '# Integration Test\n\nContent here.',
        status: 'draft',
        workflowState: 'draft',
      });

    expect(createResponse.status).toBe(200);
    expect(createResponse.body.success).toBe(true);
    expect(createResponse.body.data.workflowState).toBe('draft');

    // Step 2: Update workflowState to 'under_review'
    const updateReviewResponse = await request(context.api.getApp())
      .put(`/api/v1/records/${recordId}/draft`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        workflowState: 'under_review',
      });

    expect(updateReviewResponse.status).toBe(200);
    expect(updateReviewResponse.body.data.workflowState).toBe('under_review');
    expect(updateReviewResponse.body.data.status).toBe('draft'); // Status unchanged

    // Step 3: Update workflowState to 'ready_for_publication'
    const updateReadyResponse = await request(context.api.getApp())
      .put(`/api/v1/records/${recordId}/draft`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        workflowState: 'ready_for_publication',
      });

    expect(updateReadyResponse.status).toBe(200);
    expect(updateReadyResponse.body.data.workflowState).toBe(
      'ready_for_publication'
    );

    // Step 4: Publish draft
    const publishResponse = await request(context.api.getApp())
      .post(`/api/v1/records/${recordId}/publish`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        status: 'published',
      });

    expect([200, 201]).toContain(publishResponse.status);
    expect(publishResponse.body.success).toBe(true);

    // Step 5: Verify published record (workflowState should be cleared)
    const getResponse = await request(context.api.getApp())
      .get(`/api/v1/records/${recordId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(getResponse.status).toBe(200);
    expect(getResponse.body.data.status).toBe('published');
    // workflowState should be cleared when publishing (published records don't need editorial state)
    expect(getResponse.body.data.workflowState).toBeNull();
  });

  it('should handle status and workflowState independently', async () => {
    const recordId = 'integration-independence-1';

    // Create draft
    await request(context.api.getApp())
      .put(`/api/v1/records/${recordId}/draft`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Independence Test',
        type: 'policy',
        markdownBody: '# Test\n\nContent.',
        status: 'draft',
        workflowState: 'draft',
      });

    // Update status independently
    const statusUpdate = await request(context.api.getApp())
      .put(`/api/v1/records/${recordId}/draft`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        status: 'under_review', // Legal status change
      });

    expect(statusUpdate.body.data.status).toBe('under_review');
    expect(statusUpdate.body.data.workflowState).toBe('draft'); // Unchanged

    // Update workflowState independently
    const workflowUpdate = await request(context.api.getApp())
      .put(`/api/v1/records/${recordId}/draft`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        workflowState: 'ready_for_publication', // Internal workflow change
      });

    expect(workflowUpdate.body.data.status).toBe('under_review'); // Unchanged
    expect(workflowUpdate.body.data.workflowState).toBe(
      'ready_for_publication'
    );
  });
});
