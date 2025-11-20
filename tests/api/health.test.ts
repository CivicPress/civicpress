import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import {
  createAPITestContext,
  cleanupAPITestContext,
  setupGlobalTestEnvironment,
} from '../fixtures/test-setup';

// Setup global test environment
await setupGlobalTestEnvironment();

describe('Health API', () => {
  let context: any;

  beforeEach(async () => {
    context = await createAPITestContext();
  });

  afterEach(async () => {
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
});
