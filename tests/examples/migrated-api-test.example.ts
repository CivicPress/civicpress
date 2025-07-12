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

// Setup global test environment (mocks, etc.)
setupGlobalTestEnvironment();

describe('API Records Integration (Migrated Example)', () => {
  let context: any;

  beforeEach(async () => {
    // Create test context with API server, database, and sample data
    context = await createAPITestContext();
  });

  afterEach(async () => {
    // Clean up test context and temporary files
    await cleanupAPITestContext(context);
  });

  describe('POST /api/records - Create Record', () => {
    it('should create a record successfully with admin role', async () => {
      const adminUser = createTestUser('admin');
      const authToken = createAuthToken(adminUser);

      const response = await request(context.api.getApp())
        .post('/api/records')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Test Record',
          type: 'bylaw',
          content: '# Test Record\n\nContent here...',
          metadata: { priority: 'high' },
        });

      expect(response.status).toBe(201);
      expect(response.body.record.title).toBe('Test Record');
      expect(response.body.record.type).toBe('bylaw');
    });

    it('should fail to create a record without authentication', async () => {
      const response = await request(context.api.getApp())
        .post('/api/records')
        .send({
          title: 'Test Record',
          type: 'bylaw',
          content: '# Test Record\n\nContent here...',
        });

      expect(response.status).toBe(401);
    });

    it('should reject creation with insufficient permissions', async () => {
      const publicUser = createTestUser('public');
      const authToken = createAuthToken(publicUser);

      const response = await request(context.api.getApp())
        .post('/api/records')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Test Record',
          type: 'bylaw',
          content: '# Test Record\n\nContent here...',
        });

      expect(response.status).toBe(403);
    });
  });

  describe('GET /api/records - List Records', () => {
    it('should list records successfully', async () => {
      const adminUser = createTestUser('admin');
      const authToken = createAuthToken(adminUser);

      const response = await request(context.api.getApp())
        .get('/api/records')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.records).toBeDefined();
      expect(Array.isArray(response.body.records)).toBe(true);
    });

    it('should handle empty results', async () => {
      const adminUser = createTestUser('admin');
      const authToken = createAuthToken(adminUser);

      const response = await request(context.api.getApp())
        .get('/api/records?type=nonexistent')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.records).toEqual([]);
      expect(response.body.total).toBe(0);
    });
  });

  describe('Authentication and Authorization', () => {
    it('should require authentication for protected endpoints', async () => {
      const response = await request(context.api.getApp()).get('/api/records');

      expect(response.status).toBe(401);
    });

    it('should map JWT tokens to roles correctly', async () => {
      const adminUser = createTestUser('admin');
      const clerkUser = createTestUser('clerk');
      const publicUser = createTestUser('public');

      const adminToken = createAuthToken(adminUser);
      const clerkToken = createAuthToken(clerkUser);
      const publicToken = createAuthToken(publicUser);

      // Admin should have full access
      const adminResponse = await request(context.api.getApp())
        .get('/api/records')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(adminResponse.status).toBe(200);

      // Clerk should have limited access
      const clerkResponse = await request(context.api.getApp())
        .get('/api/records')
        .set('Authorization', `Bearer ${clerkToken}`);
      expect(clerkResponse.status).toBe(200);

      // Public should have minimal access
      const publicResponse = await request(context.api.getApp())
        .get('/api/records')
        .set('Authorization', `Bearer ${publicToken}`);
      expect(publicResponse.status).toBe(200);
    });
  });

  describe('Error Handling', () => {
    it('should handle validation errors', async () => {
      const adminUser = createTestUser('admin');
      const authToken = createAuthToken(adminUser);

      const response = await request(context.api.getApp())
        .post('/api/records')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          // Missing required fields
          content: '# Test Record\n\nContent here...',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
    });

    it('should handle RecordManager errors gracefully', async () => {
      const adminUser = createTestUser('admin');
      const authToken = createAuthToken(adminUser);

      const response = await request(context.api.getApp())
        .post('/api/records')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Database Error Test',
          type: 'bylaw',
          content: '# Test Record\n\nContent here...',
        });

      expect(response.status).toBe(500);
      expect(response.body.error).toBeDefined();
    });
  });
});
