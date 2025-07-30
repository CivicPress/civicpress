import request from 'supertest';
import {
  createAPITestContext,
  APITestContext,
  cleanupAPITestContext,
} from '../fixtures/test-setup';

describe('API User Management', () => {
  let context: APITestContext;

  beforeAll(async () => {
    context = await createAPITestContext();
  });

  afterAll(async () => {
    if (context) {
      await cleanupAPITestContext(context);
    }
  });

  describe('POST /api/users/register - User Registration', () => {
    it('should register a new user successfully', async () => {
      const userData = {
        username: 'newuser',
        email: 'newuser@example.com',
        password: 'password123',
        name: 'New User',
      };

      const response = await request(context.api.getApp())
        .post('/api/users/register')
        .send(userData);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.user).toBeDefined();
      expect(response.body.data.message).toBeDefined();
      expect(response.body.data.user.username).toBe('newuser');
      expect(response.body.data.user.email).toBe('newuser@example.com');
      expect(response.body.data.user.role).toBe('public');
    });

    it('should fail registration with missing username', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User',
      };

      const response = await request(context.api.getApp())
        .post('/api/users/register')
        .send(userData);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toBe('Username is required');
    });

    it('should fail registration with missing password', async () => {
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        name: 'Test User',
      };

      const response = await request(context.api.getApp())
        .post('/api/users/register')
        .send(userData);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toBe('Password is required');
    });

    it('should fail registration with missing email', async () => {
      const userData = {
        username: 'testuser',
        password: 'password123',
        name: 'Test User',
      };

      const response = await request(context.api.getApp())
        .post('/api/users/register')
        .send(userData);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toBe('Email is required');
    });

    it('should fail registration with duplicate username', async () => {
      const userData1 = {
        username: 'duplicateuser',
        email: 'duplicate1@example.com',
        password: 'password123',
        name: 'First User',
      };

      const userData2 = {
        username: 'duplicateuser', // Same username
        email: 'duplicate2@example.com',
        password: 'password123',
        name: 'Second User',
      };

      // First registration should succeed
      await request(context.api.getApp())
        .post('/api/users/register')
        .send(userData1);

      // Second registration should fail
      const response = await request(context.api.getApp())
        .post('/api/users/register')
        .send(userData2);

      expect(response.status).toBe(409);
      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toBe('Username already exists');
    });
  });

  describe('POST /api/users/auth/password - User Authentication', () => {
    it('should authenticate user with valid credentials', async () => {
      // First register a user
      const userData = {
        username: 'authuser',
        email: 'authuser@example.com',
        password: 'password123',
        name: 'Auth User',
      };

      await request(context.api.getApp())
        .post('/api/users/register')
        .send(userData);

      // Then authenticate
      const authData = {
        username: 'authuser',
        password: 'password123',
      };

      const response = await request(context.api.getApp())
        .post('/api/users/auth/password')
        .send(authData);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.session).toBeDefined();
      expect(response.body.session.token).toBeDefined();
      expect(response.body.session.user.username).toBe('authuser');
    });

    it('should fail authentication with invalid password', async () => {
      // First register a user
      const userData = {
        username: 'wrongpassuser',
        email: 'wrongpass@example.com',
        password: 'password123',
        name: 'Wrong Pass User',
      };

      await request(context.api.getApp())
        .post('/api/users/register')
        .send(userData);

      // Then try to authenticate with wrong password
      const authData = {
        username: 'wrongpassuser',
        password: 'wrongpassword',
      };

      const response = await request(context.api.getApp())
        .post('/api/users/auth/password')
        .send(authData);

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it('should fail authentication with non-existent user', async () => {
      const authData = {
        username: 'nonexistent',
        password: 'password123',
      };

      const response = await request(context.api.getApp())
        .post('/api/users/auth/password')
        .send(authData);

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it('should fail authentication with missing credentials', async () => {
      const response = await request(context.api.getApp())
        .post('/api/users/auth/password')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });
});
