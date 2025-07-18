import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  createAPITestContext,
  cleanupAPITestContext,
  setupGlobalTestEnvironment,
  createTestUser,
  createAuthToken,
} from '../fixtures/test-setup';
import request from 'supertest';

setupGlobalTestEnvironment();

describe('Concurrent Testing Example', () => {
  let context: any;

  beforeEach(async () => {
    // This now uses a random port between 3000-3999
    context = await createAPITestContext();
  });

  afterEach(async () => {
    await cleanupAPITestContext(context);
  });

  it('should work with dynamic port allocation', async () => {
    const adminUser = createTestUser('admin');
    const authToken = createAuthToken(adminUser);

    // The port is automatically available in the context
    const response = await request(context.api.getApp())
      .get('/api/health')
      .set('Authorization', `Bearer ${authToken}`);

    expect(response.status).toBe(200);
  });

  it('should handle multiple concurrent tests', async () => {
    // This test will get a different port than the previous test
    const adminUser = createTestUser('admin');
    const authToken = createAuthToken(adminUser);

    const response = await request(context.api.getApp())
      .get('/api/health')
      .set('Authorization', `Bearer ${authToken}`);

    expect(response.status).toBe(200);
  });
});
