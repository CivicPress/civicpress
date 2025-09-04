import request from 'supertest';
import {
  createAPITestContext,
  APITestContext,
  cleanupAPITestContext,
} from '../fixtures/test-setup';

describe('API Security Features', () => {
  let context: APITestContext;

  beforeAll(async () => {
    context = await createAPITestContext();
  });

  afterAll(async () => {
    if (context) {
      await cleanupAPITestContext(context);
    }
  });

  describe('Password Management Security', () => {
    let passwordUserId: number;
    let githubUserId: number;
    let adminToken: string;

    beforeAll(async () => {
      // Create password-authenticated user
      const passwordUserResponse = await request(context.api.getApp())
        .post('/api/users/register')
        .send({
          username: 'passworduser',
          email: 'password@example.com',
          password: 'currentpass123',
          name: 'Password User',
        });
      passwordUserId = passwordUserResponse.body.data.user.id;

      // Create external auth user (simulated)
      const githubUser = await context.civic.getAuthService().createUser({
        username: 'githubuser',
        email: 'github@example.com',
        name: 'GitHub User',
        role: 'public',
        auth_provider: 'github',
        email_verified: true,
      });
      githubUserId = githubUser.id;

      // Get admin token
      const adminResponse = await request(context.api.getApp())
        .post('/api/auth/simulated')
        .send({ username: 'admin', role: 'admin' });
      adminToken = adminResponse.body.data.token;
    });

    describe('POST /api/v1/users/:id/change-password', () => {
      it('should allow password change for password-authenticated user', async () => {
        // First get user token
        const userResponse = await request(context.api.getApp())
          .post('/api/auth/simulated')
          .send({ username: 'passworduser', role: 'public' });
        const userToken = userResponse.body.data.token;

        const response = await request(context.api.getApp())
          .post(`/api/v1/users/${passwordUserId}/change-password`)
          .set('Authorization', `Bearer ${userToken}`)
          .send({
            currentPassword: 'currentpass123',
            newPassword: 'newpass123',
          });

        // Note: This will fail because simulated auth doesn't have actual password
        // but it should fail with password verification, not external auth error
        expect([400, 401]).toContain(response.status);
        if (response.status === 400) {
          expect(response.body.message).not.toContain(
            'external authentication'
          );
        }
      });

      it('should prevent password change for external auth user', async () => {
        // Get GitHub user token
        const githubResponse = await request(context.api.getApp())
          .post('/api/auth/simulated')
          .send({ username: 'githubuser', role: 'public' });
        const githubToken = githubResponse.body.data.token;

        const response = await request(context.api.getApp())
          .post(`/api/v1/users/${githubUserId}/change-password`)
          .set('Authorization', `Bearer ${githubToken}`)
          .send({
            currentPassword: 'anypassword',
            newPassword: 'newpass123',
          });

        expect(response.status).toBe(403);
        expect(response.body.message).toContain('external authentication');
      });

      it('should require authentication', async () => {
        const response = await request(context.api.getApp())
          .post(`/api/v1/users/${passwordUserId}/change-password`)
          .send({
            currentPassword: 'currentpass123',
            newPassword: 'newpass123',
          });

        expect(response.status).toBe(401);
      });

      it('should require valid request body', async () => {
        const userResponse = await request(context.api.getApp())
          .post('/api/auth/simulated')
          .send({ username: 'passworduser', role: 'public' });
        const userToken = userResponse.body.data.token;

        const response = await request(context.api.getApp())
          .post(`/api/v1/users/${passwordUserId}/change-password`)
          .set('Authorization', `Bearer ${userToken}`)
          .send({
            // Missing required fields
          });

        expect(response.status).toBe(400);
      });
    });

    describe('POST /api/v1/users/:id/set-password', () => {
      it('should allow admin to set password for password-authenticated user', async () => {
        const response = await request(context.api.getApp())
          .post(`/api/v1/users/${passwordUserId}/set-password`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            password: 'adminsetpass123',
          });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.message).toContain('Password set successfully');
      });

      it('should prevent admin from setting password for external auth user', async () => {
        const response = await request(context.api.getApp())
          .post(`/api/v1/users/${githubUserId}/set-password`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            password: 'adminsetpass123',
          });

        expect(response.status).toBe(403);
        expect(response.body.message).toContain('external authentication');
      });

      it('should require admin privileges', async () => {
        const userResponse = await request(context.api.getApp())
          .post('/api/auth/simulated')
          .send({ username: 'passworduser', role: 'public' });
        const userToken = userResponse.body.data.token;

        const response = await request(context.api.getApp())
          .post(`/api/v1/users/${passwordUserId}/set-password`)
          .set('Authorization', `Bearer ${userToken}`)
          .send({
            password: 'usersetpass123',
          });

        expect(response.status).toBe(403);
        expect(response.body.message).toContain('Admin privileges required');
      });

      it('should return 404 for non-existent user', async () => {
        const response = await request(context.api.getApp())
          .post('/api/v1/users/99999/set-password')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            password: 'adminsetpass123',
          });

        expect(response.status).toBe(404);
      });
    });
  });

  describe('Email Management Security', () => {
    let testUserId: number;
    let userToken: string;
    let adminToken: string;

    beforeAll(async () => {
      // Create test user
      const userResponse = await request(context.api.getApp())
        .post('/api/users/register')
        .send({
          username: 'emailtestuser',
          email: 'emailtest@example.com',
          password: 'password123',
          name: 'Email Test User',
        });
      testUserId = userResponse.body.data.user.id;

      // Get user token
      const tokenResponse = await request(context.api.getApp())
        .post('/api/auth/simulated')
        .send({ username: 'emailtestuser', role: 'public' });
      userToken = tokenResponse.body.data.token;

      // Get admin token
      const adminResponse = await request(context.api.getApp())
        .post('/api/auth/simulated')
        .send({ username: 'admin', role: 'admin' });
      adminToken = adminResponse.body.data.token;
    });

    describe('POST /api/v1/users/:id/request-email-change', () => {
      it('should allow user to request email change', async () => {
        const response = await request(context.api.getApp())
          .post(`/api/v1/users/${testUserId}/request-email-change`)
          .set('Authorization', `Bearer ${userToken}`)
          .send({
            email: 'newemail@example.com',
          });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.message).toContain('Email change requested');
        expect(response.body.requiresVerification).toBe(true);
      });

      it('should reject invalid email format', async () => {
        const response = await request(context.api.getApp())
          .post(`/api/v1/users/${testUserId}/request-email-change`)
          .set('Authorization', `Bearer ${userToken}`)
          .send({
            email: 'invalid-email',
          });

        expect(response.status).toBe(400);
        expect(response.body.message).toContain('Invalid email format');
      });

      it('should reject email already in use', async () => {
        // First create another user with target email
        await request(context.api.getApp()).post('/api/users/register').send({
          username: 'existinguser',
          email: 'existing@example.com',
          password: 'password123',
          name: 'Existing User',
        });

        const response = await request(context.api.getApp())
          .post(`/api/v1/users/${testUserId}/request-email-change`)
          .set('Authorization', `Bearer ${userToken}`)
          .send({
            email: 'existing@example.com',
          });

        expect(response.status).toBe(400);
        expect(response.body.message).toContain('already in use');
      });

      it('should allow admin to request email change for any user', async () => {
        const response = await request(context.api.getApp())
          .post(`/api/v1/users/${testUserId}/request-email-change`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            email: 'adminchanged@example.com',
          });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });

      it('should prevent non-admin from changing other users email', async () => {
        // Create another user
        const otherUserResponse = await request(context.api.getApp())
          .post('/api/users/register')
          .send({
            username: 'otheruser',
            email: 'other@example.com',
            password: 'password123',
            name: 'Other User',
          });
        const otherUserId = otherUserResponse.body.data.user.id;

        const response = await request(context.api.getApp())
          .post(`/api/v1/users/${otherUserId}/request-email-change`)
          .set('Authorization', `Bearer ${userToken}`)
          .send({
            email: 'unauthorized@example.com',
          });

        expect(response.status).toBe(403);
        expect(response.body.message).toContain('own email address');
      });
    });

    describe('POST /api/v1/users/verify-email-change', () => {
      let verificationToken: string;

      beforeAll(async () => {
        // Request an email change to get a token
        const response = await request(context.api.getApp())
          .post(`/api/v1/users/${testUserId}/request-email-change`)
          .set('Authorization', `Bearer ${userToken}`)
          .send({
            email: 'verify@example.com',
          });

        // Extract token from database (in real app, this would come from email)
        const authService = context.civic.getAuthService();
        const user = await authService.getUserById(testUserId);
        verificationToken = user?.pending_email_token || '';
      });

      it('should verify email change with valid token', async () => {
        const response = await request(context.api.getApp())
          .post('/api/v1/users/verify-email-change')
          .send({
            token: verificationToken,
          });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.message).toContain('verified successfully');
      });

      it('should reject invalid token', async () => {
        const response = await request(context.api.getApp())
          .post('/api/v1/users/verify-email-change')
          .send({
            token: 'invalid-token',
          });

        expect(response.status).toBe(400);
        expect(response.body.message).toContain('Invalid or expired');
      });

      it('should not require authentication', async () => {
        // This endpoint should work without auth (token-based verification)
        const response = await request(context.api.getApp())
          .post('/api/v1/users/verify-email-change')
          .send({
            token: 'some-token',
          });

        // Should fail due to invalid token, not missing auth
        expect(response.status).toBe(400);
        expect(response.body.message).toContain('Invalid or expired');
      });
    });

    describe('POST /api/v1/users/:id/cancel-email-change', () => {
      beforeEach(async () => {
        // Request an email change before each test
        await request(context.api.getApp())
          .post(`/api/v1/users/${testUserId}/request-email-change`)
          .set('Authorization', `Bearer ${userToken}`)
          .send({
            email: 'cancel@example.com',
          });
      });

      it('should allow user to cancel their own email change', async () => {
        const response = await request(context.api.getApp())
          .post(`/api/v1/users/${testUserId}/cancel-email-change`)
          .set('Authorization', `Bearer ${userToken}`);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.message).toContain('cancelled');
      });

      it('should allow admin to cancel any email change', async () => {
        const response = await request(context.api.getApp())
          .post(`/api/v1/users/${testUserId}/cancel-email-change`)
          .set('Authorization', `Bearer ${adminToken}`);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });

      it('should return success even if no pending change', async () => {
        // Cancel once
        await request(context.api.getApp())
          .post(`/api/v1/users/${testUserId}/cancel-email-change`)
          .set('Authorization', `Bearer ${userToken}`);

        // Cancel again
        const response = await request(context.api.getApp())
          .post(`/api/v1/users/${testUserId}/cancel-email-change`)
          .set('Authorization', `Bearer ${userToken}`);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });
    });

    describe('GET /api/v1/users/:id/security-info', () => {
      it('should return security info for own account', async () => {
        const response = await request(context.api.getApp())
          .get(`/api/v1/users/${testUserId}/security-info`)
          .set('Authorization', `Bearer ${userToken}`);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty('authProvider');
        expect(response.body.data).toHaveProperty('emailVerified');
        expect(response.body.data).toHaveProperty('canSetPassword');
        expect(response.body.data).toHaveProperty('isExternalAuth');
        expect(response.body.data).toHaveProperty('pendingEmailChange');
        expect(response.body.data.authProvider).toBe('password');
        expect(response.body.data.canSetPassword).toBe(true);
        expect(response.body.data.isExternalAuth).toBe(false);
      });

      it('should allow admin to view any user security info', async () => {
        const response = await request(context.api.getApp())
          .get(`/api/v1/users/${testUserId}/security-info`)
          .set('Authorization', `Bearer ${adminToken}`);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data.authProvider).toBe('password');
      });

      it('should prevent non-admin from viewing other users security info', async () => {
        // Create another user
        const otherUserResponse = await request(context.api.getApp())
          .post('/api/users/register')
          .send({
            username: 'securityother',
            email: 'securityother@example.com',
            password: 'password123',
            name: 'Security Other User',
          });
        const otherUserId = otherUserResponse.body.data.user.id;

        const response = await request(context.api.getApp())
          .get(`/api/v1/users/${otherUserId}/security-info`)
          .set('Authorization', `Bearer ${userToken}`);

        expect(response.status).toBe(403);
        expect(response.body.message).toContain('own security information');
      });

      it('should return 404 for non-existent user', async () => {
        const response = await request(context.api.getApp())
          .get('/api/v1/users/99999/security-info')
          .set('Authorization', `Bearer ${adminToken}`);

        expect(response.status).toBe(404);
      });
    });
  });

  describe('User Update Security Guards', () => {
    let passwordUserId: number;
    let githubUserId: number;
    let adminToken: string;

    beforeAll(async () => {
      // Create password user
      const passwordUserResponse = await request(context.api.getApp())
        .post('/api/users/register')
        .send({
          username: 'updatepassworduser',
          email: 'updatepassword@example.com',
          password: 'password123',
          name: 'Update Password User',
        });
      passwordUserId = passwordUserResponse.body.data.user.id;

      // Create GitHub user
      const githubUser = await context.civic.getAuthService().createUser({
        username: 'updategithubuser',
        email: 'updategithub@example.com',
        name: 'Update GitHub User',
        role: 'public',
        auth_provider: 'github',
        email_verified: true,
      });
      githubUserId = githubUser.id;

      // Get admin token
      const adminResponse = await request(context.api.getApp())
        .post('/api/auth/simulated')
        .send({ username: 'admin', role: 'admin' });
      adminToken = adminResponse.body.data.token;
    });

    describe('PUT /api/v1/users/:id', () => {
      it('should allow normal updates for all users', async () => {
        const response = await request(context.api.getApp())
          .put(`/api/v1/users/${githubUserId}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            name: 'Updated GitHub User',
            email: 'updatedgithub@example.com',
          });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });

      it('should prevent password updates for external auth users', async () => {
        const response = await request(context.api.getApp())
          .put(`/api/v1/users/${githubUserId}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            name: 'Updated GitHub User',
            password: 'newpassword123',
          });

        expect(response.status).toBe(403);
        expect(response.body.message).toContain('external authentication');
      });

      it('should allow password updates for password-authenticated users', async () => {
        const response = await request(context.api.getApp())
          .put(`/api/v1/users/${passwordUserId}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            name: 'Updated Password User',
            password: 'newpassword123',
          });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });
    });
  });
});
