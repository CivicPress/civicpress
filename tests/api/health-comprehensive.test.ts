import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  createAPITestContext,
  cleanupAPITestContext,
  setupGlobalTestEnvironment,
} from '../fixtures/test-setup';
import request from 'supertest';

// Setup global test environment
await setupGlobalTestEnvironment();

describe('Health API (Comprehensive)', () => {
  let context: any;

  beforeEach(async () => {
    // Create isolated test environment with API server
    context = await createAPITestContext();
  });

  afterEach(async () => {
    // Clean up test environment
    await cleanupAPITestContext(context);
  });

  it('should return health status', async () => {
    const response = await request(context.api.getApp())
      .get('/api/v1/health')
      .expect(200);

    expect(response.body.data.status).toBe('healthy');
    expect(response.body.data.timestamp).toBeDefined();
    expect(response.body.data.uptime).toBeDefined();
    expect(response.body.data.environment).toBeDefined();
  });

  it('should return detailed health status', async () => {
    const response = await request(context.api.getApp())
      .get('/api/v1/health/detailed')
      .expect(200);

    expect(response.body.data.status).toBe('healthy');
    expect(response.body.data.timestamp).toBeDefined();
    expect(response.body.data.uptime).toBeDefined();
    expect(response.body.data.memory).toBeDefined();
    expect(response.body.data.version).toBeDefined();
    expect(response.body.data.platform).toBeDefined();
    expect(response.body.data.arch).toBeDefined();
    expect(response.body.data.pid).toBeDefined();
  });

  it('should test validation error logging', async () => {
    const response = await request(context.api.getApp())
      .post('/api/v1/health/test-error')
      .send({ errorType: 'validation' })
      .expect(400);

    expect(response.body.error.message).toBe('Validation error test');
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should test not found error logging', async () => {
    const response = await request(context.api.getApp())
      .post('/api/v1/health/test-error')
      .send({ errorType: 'not_found' })
      .expect(404);

    expect(response.body.error.message).toBe('Not found error test');
    expect(response.body.error.code).toBe('NOT_FOUND_ERROR');
  });

  it('should test server error logging', async () => {
    const response = await request(context.api.getApp())
      .post('/api/v1/health/test-error')
      .send({ errorType: 'server_error' })
      .expect(500);

    expect(response.body.error.message).toBe('Server error test');
    expect(response.body.error.code).toBe('TEST_ERROR');
  });

  it('should test generic error logging', async () => {
    const response = await request(context.api.getApp())
      .post('/api/v1/health/test-error')
      .send({ errorType: 'generic' })
      .expect(500);

    expect(response.body.error.message).toBe('Generic error test');
    expect(response.body.error.code).toBe('TEST_ERROR');
  });

  it('should handle concurrent requests', async () => {
    // Test that the API can handle multiple concurrent requests
    const promises = Array.from({ length: 5 }, () =>
      request(context.api.getApp()).get('/api/v1/health')
    );

    const responses = await Promise.all(promises);

    responses.forEach((response) => {
      expect(response.status).toBe(200);
      expect(response.body.data.status).toBe('healthy');
    });
  });

  it('should return proper content type headers', async () => {
    const response = await request(context.api.getApp())
      .get('/api/v1/health')
      .expect(200);

    expect(response.headers['content-type']).toContain('application/json');
  });

  it('should handle malformed requests gracefully', async () => {
    const response = await request(context.api.getApp())
      .post('/api/v1/health/test-error')
      .set('Content-Type', 'application/json')
      .send('invalid json')
      .expect(400);

    expect(response.body.error).toBeDefined();
  });
});
