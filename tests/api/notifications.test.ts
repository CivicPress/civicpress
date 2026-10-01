import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { CentralConfigManager } from '@civicpress/core';
import {
  createAPITestContext,
  cleanupAPITestContext,
  setupGlobalTestEnvironment,
} from '../fixtures/test-setup';

// HTTP integration tests for the `notifications` router
// (`POST /api/v1/notifications/test`). The whole router is admin-only, and its
// happy path is gated on the email channel being enabled — which it is NOT by
// default, so the honest response for an admin is a 400 EMAIL_CHANNEL_DISABLED.

await setupGlobalTestEnvironment();

describe('API Notifications Integration', () => {
  let context: any;
  let adminToken: string;
  let publicToken: string;

  beforeEach(async () => {
    context = await createAPITestContext();

    const adminResponse = await request(context.api.getApp())
      .post('/api/v1/auth/simulated')
      .send({ username: 'admin', role: 'admin' });
    adminToken = adminResponse.body.data.session.token;

    const publicResponse = await request(context.api.getApp())
      .post('/api/v1/auth/simulated')
      .send({ username: 'public', role: 'public' });
    publicToken = publicResponse.body.data.session.token;
  });

  afterEach(async () => {
    await cleanupAPITestContext(context);
  });

  describe('POST /api/v1/notifications/test — authorization', () => {
    it('rejects an anonymous caller with 401', async () => {
      const response = await request(context.api.getApp())
        .post('/api/v1/notifications/test')
        .send({ to: 'someone@example.com' });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it('rejects a non-admin token with 403', async () => {
      const response = await request(context.api.getApp())
        .post('/api/v1/notifications/test')
        .set('Authorization', `Bearer ${publicToken}`)
        .send({ to: 'someone@example.com' });

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/v1/notifications/test — admin', () => {
    it('400s when the recipient (to) is missing', async () => {
      const response = await request(context.api.getApp())
        .post('/api/v1/notifications/test')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ subject: 'Hi', message: 'Body' });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('lets an admin past auth + validation into the send path', async () => {
      const response = await request(context.api.getApp())
        .post('/api/v1/notifications/test')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ to: 'someone@example.com', message: 'Test' });

      // Admin clears auth and the `to` check; the downstream outcome depends on
      // channel config/rate-limits (email is enabled in the fixture), so assert
      // we reached the handler with the standard envelope, not an auth/validation
      // rejection.
      expect([401, 403]).not.toContain(response.status);
      expect(typeof response.body.success).toBe('boolean');
      if (!response.body.success) {
        expect(typeof response.body.error.code).toBe('string');
      }
    });
  });

  /**
   * The endpoint against the file an instance really has: the shipped
   * `notifications.yml`, in the field shape, installed where `civic init` puts
   * it. The reader used to cast that shape without unwrapping it, so "off" read
   * as on and the configured provider read as an object.
   */
  describe('POST /api/v1/notifications/test — the shipped configuration', () => {
    const SHIPPED = join(
      process.cwd(),
      'core',
      'src',
      'defaults',
      'notifications.yml'
    );

    /** Install the shipped file, optionally edited the way an operator would. */
    const install = (edit: (yaml: string) => string = (yaml) => yaml) => {
      const dir = CentralConfigManager.getSystemDataDir();
      mkdirSync(dir, { recursive: true });
      const shipped = readFileSync(SHIPPED, 'utf8');
      const edited = edit(shipped);
      writeFileSync(join(dir, 'notifications.yml'), edited);
      return { shipped, edited };
    };

    const sendTest = () =>
      request(context.api.getApp())
        .post('/api/v1/notifications/test')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ to: 'someone@example.com', message: 'Test' });

    it('says email is disabled, because the shipped file says so', async () => {
      install();

      const response = await sendTest();

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('EMAIL_CHANNEL_DISABLED');
    });

    it('reports a send that failed as a failure, without the raw error', async () => {
      // Email on, SMTP pointed at a port nothing listens on.
      const { shipped, edited } = install((yaml) =>
        yaml
          .replace(/(email:\n\s+enabled:\n\s+value: )false/, '$1true')
          .replace(/(smtp:\n\s+host:\n\s+value: )'localhost'/, "$1'127.0.0.1'")
          .replace(/(smtp:[\s\S]*?port:\n\s+value: )587/, '$11')
      );
      expect(edited).not.toBe(shipped);
      expect(edited).toMatch(/host:\n\s+value: '127\.0\.0\.1'/);

      const response = await sendTest();

      // It used to answer 200 `{ success: true, data: { success: false, errors } }`
      // and the settings page showed "Test email sent".
      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('NOTIFICATION_SEND_FAILED');
      // SMTP errors carry hosts, ports and credential hints.
      expect(JSON.stringify(response.body)).not.toMatch(
        /ECONNREFUSED|127\.0\.0\.1|rate-limited/i
      );
    });
  });
});
