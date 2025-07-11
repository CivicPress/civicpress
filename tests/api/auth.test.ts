import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { CivicPressAPI } from '../../modules/api/src/index';
import { CivicPress } from '@civicpress/core';

// Mock the CivicPress core
vi.mock('@civicpress/core', () => ({
  CivicPress: vi.fn().mockImplementation(() => ({
    initialize: vi.fn().mockResolvedValue(undefined),
    getCore: () => ({
      initialize: vi.fn().mockResolvedValue(undefined),
      getDataDir: () => '/mock/data/dir',
    }),
    getAuthService: vi.fn().mockReturnValue({
      authenticateWithGitHub: vi.fn(),
      validateSession: vi.fn(),
      invalidateSession: vi.fn(),
    }),
    getRecordManager: vi.fn().mockReturnValue({
      createRecord: vi.fn(),
      updateRecord: vi.fn(),
      archiveRecord: vi.fn(),
      getRecord: vi.fn(),
      listRecords: vi.fn(),
    }),
  })),
  Logger: vi.fn().mockImplementation(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  })),
  CentralConfigManager: {
    getDatabaseConfig: vi.fn().mockReturnValue({
      type: 'sqlite',
      database: ':memory:',
    }),
  },
  WorkflowConfigManager: vi.fn().mockImplementation(() => ({
    validateAction: vi.fn().mockResolvedValue({ valid: true }),
  })),
}));

// TODO: Fix authentication API tests after JWT integration is complete
describe.skip('Authentication API', () => {
  let api: CivicPressAPI;
  let mockAuthService: any;

  beforeEach(async () => {
    // Reset mocks
    vi.clearAllMocks();

    // Create API instance
    api = new CivicPressAPI(3004);
    await api.initialize('/mock/data/dir');

    // Get mock auth service - access it from the API's CivicPress instance
    const civicPress = (api as any).civicPress;
    mockAuthService = civicPress.getAuthService();
  });

  describe('POST /api/v1/auth/login', () => {
    it('should authenticate with valid GitHub token', async () => {
      const mockSession = {
        token: 'mock-jwt-token',
        user: {
          id: '123',
          username: 'testuser',
          role: 'citizen',
          email: 'test@example.com',
          name: 'Test User',
          avatar_url: 'https://example.com/avatar.jpg',
          permissions: ['read', 'comment'],
        },
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        createdAt: new Date(),
      };

      mockAuthService.authenticateWithGitHub.mockResolvedValue(mockSession);

      const response = await request(api.getApp())
        .post('/api/v1/auth/login')
        .send({
          githubToken: 'mock-github-token',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.session.token).toBe('mock-jwt-token');
      expect(response.body.session.user.username).toBe('testuser');
      expect(response.body.session.user.role).toBe('citizen');
    });

    it('should reject login without GitHub token', async () => {
      const response = await request(api.getApp())
        .post('/api/v1/auth/login')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error.message).toBe('GitHub token is required');
      expect(response.body.error.code).toBe('MISSING_TOKEN');
    });

    it('should handle authentication failure', async () => {
      mockAuthService.authenticateWithGitHub.mockRejectedValue(
        new Error('Invalid GitHub token')
      );

      const response = await request(api.getApp())
        .post('/api/v1/auth/login')
        .send({
          githubToken: 'invalid-token',
        });

      expect(response.status).toBe(401);
      expect(response.body.error.message).toBe('Authentication failed');
      expect(response.body.error.code).toBe('AUTH_FAILED');
    });
  });

  describe('GET /api/v1/auth/me', () => {
    it('should return user info with valid token', async () => {
      const mockUser = {
        id: '123',
        username: 'testuser',
        role: 'citizen',
        email: 'test@example.com',
        name: 'Test User',
        avatar_url: 'https://example.com/avatar.jpg',
        permissions: ['read', 'comment'],
      };

      mockAuthService.validateSession.mockReturnValue(mockUser);

      const response = await request(api.getApp())
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer mock-jwt-token');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.user.username).toBe('testuser');
      expect(response.body.user.role).toBe('citizen');
    });

    it('should reject request without authorization header', async () => {
      const response = await request(api.getApp()).get('/api/v1/auth/me');

      expect(response.status).toBe(401);
      expect(response.body.error.message).toBe('Authorization header required');
      expect(response.body.error.code).toBe('MISSING_AUTH');
    });

    it('should reject request with invalid token', async () => {
      mockAuthService.validateSession.mockReturnValue(null);

      const response = await request(api.getApp())
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
      expect(response.body.error.message).toBe('Invalid or expired token');
      expect(response.body.error.code).toBe('INVALID_TOKEN');
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    it('should logout successfully', async () => {
      mockAuthService.invalidateSession.mockReturnValue(true);

      const response = await request(api.getApp())
        .post('/api/v1/auth/logout')
        .set('Authorization', 'Bearer mock-jwt-token');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Logged out successfully');
    });

    it('should reject logout without authorization header', async () => {
      const response = await request(api.getApp()).post('/api/v1/auth/logout');

      expect(response.status).toBe(401);
      expect(response.body.error.message).toBe('Authorization header required');
      expect(response.body.error.code).toBe('MISSING_AUTH');
    });
  });

  describe('Protected endpoints with JWT auth', () => {
    it('should allow access to records with valid token and permissions', async () => {
      const mockUser = {
        id: '123',
        username: 'testuser',
        role: 'citizen',
        permissions: ['read', 'write'],
      };

      mockAuthService.validateSession.mockReturnValue(mockUser);

      const response = await request(api.getApp())
        .get('/api/v1/records')
        .set('Authorization', 'Bearer mock-jwt-token');

      // Should not return 401 (auth error)
      expect(response.status).not.toBe(401);
    });

    it('should reject access to protected endpoints without token', async () => {
      const response = await request(api.getApp()).get('/api/v1/records');

      expect(response.status).toBe(401);
      expect(response.body.error.message).toBe('Authorization header required');
    });

    it('should reject access with invalid token', async () => {
      mockAuthService.validateSession.mockReturnValue(null);

      const response = await request(api.getApp())
        .get('/api/v1/records')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
      expect(response.body.error.message).toBe('Invalid or expired token');
    });
  });
});
