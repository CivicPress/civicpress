import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { CivicPressAPI } from '../../modules/api/src/index.js';

describe('Health API', () => {
  let api: CivicPressAPI;

  beforeEach(async () => {
    api = new CivicPressAPI(3001);
    await api.initialize('./test-health-data');
    await api.start();
  });

  afterEach(async () => {
    await api.shutdown();
  });

  it('should return health status', async () => {
    const response = await request(api.getApp()).get('/health').expect(200);

    expect(response.body.status).toBe('healthy');
    expect(response.body.timestamp).toBeDefined();
    expect(response.body.uptime).toBeDefined();
    expect(response.body.environment).toBeDefined();
  });

  it('should return detailed health status', async () => {
    const response = await request(api.getApp())
      .get('/health/detailed')
      .expect(200);

    expect(response.body.status).toBe('healthy');
    expect(response.body.timestamp).toBeDefined();
    expect(response.body.uptime).toBeDefined();
    expect(response.body.memory).toBeDefined();
    expect(response.body.version).toBeDefined();
    expect(response.body.platform).toBeDefined();
    expect(response.body.arch).toBeDefined();
    expect(response.body.pid).toBeDefined();
  });

  it('should test validation error logging', async () => {
    const response = await request(api.getApp())
      .post('/health/test-error')
      .send({ errorType: 'validation' })
      .expect(400);

    expect(response.body.error.message).toBe('Validation error test');
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should test not found error logging', async () => {
    const response = await request(api.getApp())
      .post('/health/test-error')
      .send({ errorType: 'not_found' })
      .expect(404);

    expect(response.body.error.message).toBe('Not found error test');
    expect(response.body.error.code).toBe('NOT_FOUND_ERROR');
  });

  it('should test server error logging', async () => {
    const response = await request(api.getApp())
      .post('/health/test-error')
      .send({ errorType: 'server_error' })
      .expect(500);

    expect(response.body.error.message).toBe('Server error test');
    expect(response.body.error.code).toBe('TEST_ERROR');
  });

  it('should test generic error logging', async () => {
    const response = await request(api.getApp())
      .post('/health/test-error')
      .send({ errorType: 'generic' })
      .expect(500);

    expect(response.body.error.message).toBe('Generic error test');
    expect(response.body.error.code).toBe('TEST_ERROR');
  });
});
