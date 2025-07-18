import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import {
  createAPITestContext,
  cleanupAPITestContext,
  setupGlobalTestEnvironment,
} from '../fixtures/test-setup';

// Setup global test environment
await setupGlobalTestEnvironment();

describe('Authentication API', () => {
  let context: any;

  beforeEach(async () => {
    context = await createAPITestContext();
  });

  afterEach(async () => {
    await cleanupAPITestContext(context);
  });

  describe('POST /auth/simulated', () => {
    it('should authenticate with valid simulated credentials', async () => {
      console.log('REACHED TEST BODY');
      const response = await request(context.api.getApp())
        .post('/auth/simulated')
        .send({
          username: 'testuser',
          role: 'admin',
        });

      console.log('API_RESPONSE_BODY:', JSON.stringify(response.body, null, 2));

      if (response.status !== 200) {
        const fs = require('fs');
        fs.writeFileSync(
          '/tmp/civicpress-api-debug.json',
          JSON.stringify(response.body, null, 2)
        );
        throw new Error(
          'API_RESPONSE_DEBUG: ' + JSON.stringify(response.body, null, 2)
        );
      }

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.session.token).toBeDefined();
      expect(response.body.data.session.user.username).toBeDefined();
    });

    it('should reject login without username', async () => {
      const response = await request(context.api.getApp())
        .post('/auth/simulated')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error.message).toBe('Username is required');
      expect(response.body.error.code).toBe('MISSING_USERNAME');
    });

    it('should handle invalid role', async () => {
      const response = await request(context.api.getApp())
        .post('/auth/simulated')
        .send({
          username: 'testuser',
          role: 'invalid-role',
        });

      expect(response.status).toBe(400);
      expect(response.body.error.message).toBe('Invalid role: invalid-role');
      expect(response.body.error.code).toBe('INVALID_ROLE');
    });
  });

  describe('GET /auth/me', () => {
    it('should return user info with valid token', async () => {
      // First login to get a token
      const loginResponse = await request(context.api.getApp())
        .post('/auth/simulated')
        .send({
          username: 'testuser',
          role: 'admin',
        });

      const token = loginResponse.body.data.session.token;

      const response = await request(context.api.getApp())
        .get('/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.user.username).toBeDefined();
    });

    it('should reject request without authorization header', async () => {
      const response = await request(context.api.getApp()).get('/auth/me');

      expect(response.status).toBe(401);
      expect(response.body.error.message).toBe('Authorization header required');
      expect(response.body.error.code).toBe('MISSING_AUTH');
    });

    it('should reject request with invalid token', async () => {
      const response = await request(context.api.getApp())
        .get('/auth/me')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
      expect(response.body.error.message).toBe('Invalid or expired token');
      expect(response.body.error.code).toBe('INVALID_TOKEN');
    });
  });

  describe('POST /auth/logout', () => {
    it('should logout successfully', async () => {
      // First login to get a token
      const loginResponse = await request(context.api.getApp())
        .post('/auth/simulated')
        .send({
          username: 'testuser',
          role: 'admin',
        });

      const token = loginResponse.body.data.session.token;

      const response = await request(context.api.getApp())
        .post('/auth/logout')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.message).toBe('Logged out successfully');
    });

    it('should reject logout without authorization header', async () => {
      const response = await request(context.api.getApp()).post('/auth/logout');

      expect(response.status).toBe(401);
      expect(response.body.error.message).toBe('Authorization header required');
      expect(response.body.error.code).toBe('MISSING_AUTH');
    });
  });

  describe('Protected endpoints with JWT auth', () => {
    it('should allow access to records with valid token and permissions', async () => {
      // First login to get a token
      const loginResponse = await request(context.api.getApp())
        .post('/auth/simulated')
        .send({
          username: 'testuser',
          role: 'admin',
        });

      const token = loginResponse.body.data.session.token;

      const response = await request(context.api.getApp())
        .get('/api/records')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });
});
