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
        .post('/api/v1/users/register')
        .send({
          username: 'passworduser',
          email: 'password@example.com',
          password: 'Currentpass!123',
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
        .post('/api/v1/auth/simulated')
        .send({ username: 'admin', role: 'admin' });
      adminToken = adminResponse.body.data.session.token;
    });

    describe('POST /api/v1/users/:id/change-password', () => {
      it('should allow password change for password-authenticated user', async () => {
        // 'passworduser' was registered with a real bcrypt password (role public).
        // Logging in via simulated auth resolves to that SAME registered user, so a
        // self password-change with the correct current password legitimately
        // succeeds (200) — the prior [400,401] expectation was based on the false
        // premise that the simulated login is a passwordless user.
        const userResponse = await request(context.api.getApp())
          .post('/api/v1/auth/simulated')
          .send({ username: 'passworduser', role: 'public' });
        const userToken = userResponse.body.data.session.token;
        const simulatedUserId = userResponse.body.data.session.user.id;

        const response = await request(context.api.getApp())
          .post(`/api/v1/users/${simulatedUserId}/change-password`)
          .set('Authorization', `Bearer ${userToken}`)
          .send({
            currentPassword: 'Currentpass!123',
            newPassword: 'Newpass!123',
          });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });

      it('should prevent password change for external auth user', async () => {
        // TODO: Fix external auth user password change - getting 400 instead of 403
        // Issue: GitHub user password change should return 403 (Forbidden) not 400 (Bad Request)
        // Test with admin token (admin can attempt to change any user's password)
        const response = await request(context.api.getApp())
          .post(`/api/v1/users/${githubUserId}/change-password`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            currentPassword: 'anypassword',
            newPassword: 'Newpass!123',
          });

        expect(response.status).toBe(403);
        expect(response.body.error.message).toContain(
          'external authentication'
        );
      });

      it('should require authentication', async () => {
        const response = await request(context.api.getApp())
          .post(`/api/v1/users/${passwordUserId}/change-password`)
          .send({
            currentPassword: 'Currentpass!123',
            newPassword: 'Newpass!123',
          });

        expect(response.status).toBe(401);
      });

      it('should require valid request body', async () => {
        const userResponse = await request(context.api.getApp())
          .post('/api/v1/auth/simulated')
          .send({ username: 'passworduser', role: 'public' });
        const userToken = userResponse.body.data.session.token;

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
        // The route (and the real UI client) use `newPassword`; the success
        // payload is nested under `data` by sendSuccess.
        const response = await request(context.api.getApp())
          .post(`/api/v1/users/${passwordUserId}/set-password`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            newPassword: 'Adminsetpass!123',
          });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data.message).toContain('Password set successfully');
      });

      it('should prevent admin from setting password for external auth user', async () => {
        const response = await request(context.api.getApp())
          .post(`/api/v1/users/${githubUserId}/set-password`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            newPassword: 'Adminsetpass!123',
          });

        expect(response.status).toBe(403);
        expect(response.body.error.message).toContain(
          'external authentication'
        );
      });

      it('should require admin privileges', async () => {
        const userResponse = await request(context.api.getApp())
          .post('/api/v1/auth/simulated')
          .send({ username: 'passworduser', role: 'public' });
        const userToken = userResponse.body.data.session.token;

        const response = await request(context.api.getApp())
          .post(`/api/v1/users/${passwordUserId}/set-password`)
          .set('Authorization', `Bearer ${userToken}`)
          .send({
            newPassword: 'Usersetpass!123',
          });

        expect(response.status).toBe(403);
        expect(response.body.error.message).toContain('Insufficient permissions');
      });

      it('should return 404 for non-existent user', async () => {
        const response = await request(context.api.getApp())
          .post('/api/v1/users/99999/set-password')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            newPassword: 'Adminsetpass!123',
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
        .post('/api/v1/users/register')
        .send({
          username: 'emailtestuser',
          email: 'emailtest@example.com',
          password: 'Passw0rd!123',
          name: 'Email Test User',
        });
      testUserId = userResponse.body.data.user.id;

      // Get user token
      const tokenResponse = await request(context.api.getApp())
        .post('/api/v1/auth/simulated')
        .send({ username: 'emailtestuser', role: 'public' });
      userToken = tokenResponse.body.data.session.token;

      // Get admin token
      const adminResponse = await request(context.api.getApp())
        .post('/api/v1/auth/simulated')
        .send({ username: 'admin', role: 'admin' });
      adminToken = adminResponse.body.data.session.token;
    });

    describe('POST /api/v1/users/:id/request-email-change', () => {
      it('should allow user to request email change', async () => {
        const response = await request(context.api.getApp())
          .post(`/api/v1/users/${testUserId}/request-email-change`)
          .set('Authorization', `Bearer ${userToken}`)
          .send({
            newEmail: 'newemail@example.com',
          });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data.message).toContain(
          'Email verification sent to new address'
        );
        expect(response.body.data.requiresVerification).toBe(true);
      });

      it('should reject invalid email format', async () => {
        const response = await request(context.api.getApp())
          .post(`/api/v1/users/${testUserId}/request-email-change`)
          .set('Authorization', `Bearer ${userToken}`)
          .send({
            newEmail: 'invalid-email',
          });

        expect(response.status).toBe(400);
        expect(response.body.error.message).toContain('Invalid email format');
      });

      it('should reject email already in use', async () => {
        // First create another user with target email
        await request(context.api.getApp())
          .post('/api/v1/users/register')
          .send({
            username: 'existinguser',
            email: 'existing@example.com',
            password: 'Passw0rd!123',
            name: 'Existing User',
          });

        const response = await request(context.api.getApp())
          .post(`/api/v1/users/${testUserId}/request-email-change`)
          .set('Authorization', `Bearer ${userToken}`)
          .send({
            newEmail: 'existing@example.com',
          });

        expect(response.status).toBe(400);
        expect(response.body.error.message).toContain('already in use');
      });

      it('should allow admin to request email change for any user', async () => {
        const response = await request(context.api.getApp())
          .post(`/api/v1/users/${testUserId}/request-email-change`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            newEmail: 'adminchanged@example.com',
          });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });

      it('should prevent non-admin from changing other users email', async () => {
        // Create another user
        const otherUserResponse = await request(context.api.getApp())
          .post('/api/v1/users/register')
          .send({
            username: 'otheruser',
            email: 'other@example.com',
            password: 'Passw0rd!123',
            name: 'Other User',
          });
        const otherUserId = otherUserResponse.body.data.user.id;

        const response = await request(context.api.getApp())
          .post(`/api/v1/users/${otherUserId}/request-email-change`)
          .set('Authorization', `Bearer ${userToken}`)
          .send({
            newEmail: 'unauthorized@example.com',
          });

        expect(response.status).toBe(403);
        expect(response.body.error.message).toContain(
          'Insufficient permissions'
        );
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
            newEmail: 'verify@example.com',
          });

        // Extract token from the DB directly. AuthService.getUserById deliberately
        // does NOT expose pending_email_token (it is a live verification secret), so
        // read the column via a raw query rather than widening getUserById.
        const rows = await context.civic
          .getDatabaseService()
          .query<{ pending_email_token?: string }>(
            'SELECT pending_email_token FROM users WHERE id = ?',
            [testUserId]
          );
        verificationToken = rows?.[0]?.pending_email_token || '';
      });

      it('should verify email change with valid token', async () => {
        const response = await request(context.api.getApp())
          .post('/api/v1/users/verify-email-change')
          .send({
            token: verificationToken,
          });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data.message).toContain('successfully updated');
      });

      it('should reject invalid token', async () => {
        const response = await request(context.api.getApp())
          .post('/api/v1/users/verify-email-change')
          .send({
            token: 'invalid-token',
          });

        expect(response.status).toBe(400);
        expect(response.body.error.message).toContain('Invalid or expired');
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
        expect(response.body.error.message).toContain('Invalid or expired');
      });
    });

    describe('POST /api/v1/users/:id/cancel-email-change', () => {
      beforeEach(async () => {
        // Request an email change before each test
        await request(context.api.getApp())
          .post(`/api/v1/users/${testUserId}/request-email-change`)
          .set('Authorization', `Bearer ${userToken}`)
          .send({
            newEmail: 'cancel@example.com',
          });
      });

      it('should allow user to cancel their own email change', async () => {
        const response = await request(context.api.getApp())
          .post(`/api/v1/users/${testUserId}/cancel-email-change`)
          .set('Authorization', `Bearer ${userToken}`);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data.message).toContain('cancelled');
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
        expect(response.body.data.securityInfo).toHaveProperty('authProvider');
        expect(response.body.data.securityInfo).toHaveProperty('emailVerified');
        expect(response.body.data.securityInfo).toHaveProperty(
          'canSetPassword'
        );
        expect(response.body.data.securityInfo).toHaveProperty(
          'isExternalAuth'
        );
        expect(response.body.data.securityInfo).toHaveProperty(
          'pendingEmailChange'
        );
        expect(response.body.data.securityInfo.authProvider).toBe('password');
        expect(response.body.data.securityInfo.canSetPassword).toBe(true);
        expect(response.body.data.securityInfo.isExternalAuth).toBe(false);
      });

      it('should allow admin to view any user security info', async () => {
        const response = await request(context.api.getApp())
          .get(`/api/v1/users/${testUserId}/security-info`)
          .set('Authorization', `Bearer ${adminToken}`);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data.securityInfo.authProvider).toBe('password');
      });

      it('should prevent non-admin from viewing other users security info', async () => {
        // Create another user
        const otherUserResponse = await request(context.api.getApp())
          .post('/api/v1/users/register')
          .send({
            username: 'securityother',
            email: 'securityother@example.com',
            password: 'Passw0rd!123',
            name: 'Security Other User',
          });
        const otherUserId = otherUserResponse.body.data.user.id;

        const response = await request(context.api.getApp())
          .get(`/api/v1/users/${otherUserId}/security-info`)
          .set('Authorization', `Bearer ${userToken}`);

        expect(response.status).toBe(403);
        expect(response.body.error.message).toContain(
          'Insufficient permissions'
        );
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
        .post('/api/v1/users/register')
        .send({
          username: 'updatepassworduser',
          email: 'updatepassword@example.com',
          password: 'Passw0rd!123',
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
        .post('/api/v1/auth/simulated')
        .send({ username: 'admin', role: 'admin' });
      adminToken = adminResponse.body.data.session.token;
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
        // TODO: Fix external auth user update - getting 500 instead of 403
        // Issue: External auth users should get 403 (Forbidden) not 500 (Internal Server Error)
        const response = await request(context.api.getApp())
          .put(`/api/v1/users/${githubUserId}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            name: 'Updated GitHub User',
            password: 'Newpassword!123',
          });

        expect(response.status).toBe(403);
        expect(response.body.error.message).toContain(
          'external authentication'
        );
      });

      it('should allow password updates for password-authenticated users', async () => {
        const response = await request(context.api.getApp())
          .put(`/api/v1/users/${passwordUserId}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            name: 'Updated Password User',
            password: 'Newpassword!123',
          });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });
    });
  });

  describe('FA-API-005: record path traversal is contained', () => {
    let viewerToken: string;

    beforeAll(async () => {
      const viewer = await request(context.api.getApp())
        .post('/api/v1/auth/simulated')
        .send({ username: 'viewer', role: 'public' });
      viewerToken = viewer.body.data.session.token;
    });

    it('POST /api/v1/validation/record refuses ../ escapes (no file content leaks)', async () => {
      // Try to read a file OUTSIDE data/records via the traversal shape from
      // the audit. Regardless of which not-found branch answers, no content
      // may come back and no 500 (fs error oracle) may fire.
      for (const recordId of [
        '../../.civic/roles.yml',
        '../../../etc/hostname',
        'bylaw/../../.civic/org-config.yml',
      ]) {
        const response = await request(context.api.getApp())
          .post('/api/v1/validation/record')
          .set('Authorization', `Bearer ${viewerToken}`)
          .send({ recordId });

        expect(response.status).toBe(200); // validation report, not a read
        const report = response.body.data ?? response.body;
        expect(JSON.stringify(report)).not.toContain('permissions:');
        expect(JSON.stringify(report)).not.toContain('roles:');
        const issues = report.results?.[0]?.issues ?? report.issues ?? [];
        expect(
          issues.some((i: any) => i.code === 'RECORD_NOT_FOUND')
        ).toBe(true);
      }
    });

    it('a legitimate record reference still validates', async () => {
      // A published record lands in the data/records tree (drafts do not).
      const created = await context.civic.getRecordManager().createRecord(
        {
          title: 'Traversal Guard Bylaw',
          type: 'bylaw',
          content: '# Guard',
          status: 'published',
        },
        { id: 1, username: 'admin', role: 'admin' }
      );

      const response = await request(context.api.getApp())
        .post('/api/v1/validation/record')
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({ recordId: created.id });
      expect(response.status).toBe(200);
      const report = response.body.data ?? response.body;
      const issues = report.results?.[0]?.issues ?? report.issues ?? [];
      expect(
        issues.some((i: any) => i.code === 'RECORD_NOT_FOUND')
      ).toBe(false);
    });
  });
});
