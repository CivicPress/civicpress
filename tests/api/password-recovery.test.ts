/**
 * Forgot/reset password endpoints + the operator notification center admin API.
 *
 * Core runs from dist (@civicpress/core); the API runs from src. context.civic
 * is the same CivicPress instance the app uses, so tokens minted / notifications
 * filed through it are visible to the HTTP layer.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import {
  createAPITestContext,
  cleanupAPITestContext,
  setupGlobalTestEnvironment,
} from '../fixtures/test-setup';

await setupGlobalTestEnvironment();

async function seedPasswordUser(
  civic: any,
  username = 'reset.me',
  email = 'reset.me@example.org'
) {
  const passwordHash = await bcrypt.hash('OldPassw0rd!', 12);
  await civic.getAuthService().createUserWithPassword({
    username,
    role: 'clerk',
    email,
    passwordHash,
    auth_provider: 'password',
    email_verified: true,
  });
  return { username, email };
}

describe('POST /api/v1/auth/forgot-password', () => {
  let context: any;

  beforeEach(async () => {
    context = await createAPITestContext();
  });
  afterEach(async () => {
    await cleanupAPITestContext(context);
  });

  it('responds identically for a match, a miss, and a blank body (anti-enumeration)', async () => {
    await seedPasswordUser(context.civic);
    const app = context.api.getApp();

    const hit = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ identifier: 'reset.me' });
    const miss = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ identifier: 'does-not-exist' });
    const blank = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({});

    for (const r of [hit, miss, blank]) {
      expect(r.status).toBe(200);
      expect(r.body.success).toBe(true);
    }
    // The exact payload must not vary by whether an account matched.
    expect(miss.body.data).toEqual(hit.body.data);
    expect(blank.body.data).toEqual(hit.body.data);
  });

  it('files an operator task when no user-facing channel is configured', async () => {
    // Force the no-channel path: console off (email is off by default in tests).
    const prev = process.env.CIVIC_CONSOLE_NOTIFICATIONS;
    process.env.CIVIC_CONSOLE_NOTIFICATIONS = 'false';
    try {
      const { username } = await seedPasswordUser(context.civic, 'taskuser');
      const res = await request(context.api.getApp())
        .post('/api/v1/auth/forgot-password')
        .send({ identifier: username });
      expect(res.status).toBe(200);

      const { notifications } = await context.civic
        .getOperatorNotifier()
        .list({ type: 'password_reset_request' });
      expect(notifications).toHaveLength(1);
      expect(notifications[0].severity).toBe('action');
      expect(notifications[0].data?.username).toBe('taskuser');
      // The token is NEVER in the operator feed.
      expect(JSON.stringify(notifications[0])).not.toMatch(/token/i);
    } finally {
      if (prev === undefined) delete process.env.CIVIC_CONSOLE_NOTIFICATIONS;
      else process.env.CIVIC_CONSOLE_NOTIFICATIONS = prev;
    }
  });
});

describe('POST /api/v1/auth/reset-password', () => {
  let context: any;

  beforeEach(async () => {
    context = await createAPITestContext();
  });
  afterEach(async () => {
    await cleanupAPITestContext(context);
  });

  it('resets the password with a valid token, then rejects reuse', async () => {
    const { username } = await seedPasswordUser(context.civic);
    const minted = await context.civic
      .getAuthService()
      .createPasswordResetToken(username);
    expect(minted?.token).toBeTruthy();

    const app = context.api.getApp();
    const ok = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: minted.token, newPassword: 'BrandNewP4ss!' });
    expect(ok.status).toBe(200);
    expect(ok.body.success).toBe(true);
    expect(ok.body.data.sessionsRevoked).toBe(true);

    // The new password now authenticates.
    const login = await request(app)
      .post('/api/v1/auth/password')
      .send({ username, password: 'BrandNewP4ss!' });
    expect(login.status).toBe(200);

    // The same link cannot be reused.
    const replay = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: minted.token, newPassword: 'AnotherP4ss!' });
    expect(replay.status).toBe(400);
  });

  it('rejects a garbage token and missing fields with 400', async () => {
    const app = context.api.getApp();
    const garbage = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: 'nope', newPassword: 'BrandNewP4ss!' });
    expect(garbage.status).toBe(400);

    const missing = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: 'nope' });
    expect(missing.status).toBe(400);
    expect(missing.body.error.code).toBe('MISSING_FIELDS');
  });
});

describe('GET/POST /api/v1/admin/notifications (operator center)', () => {
  let context: any;
  let adminAuth: string;

  beforeEach(async () => {
    context = await createAPITestContext();
    // Mint an admin token via the API (context.adminToken relies on a CLI
    // round-trip that is flaky in-suite; /auth/simulated is deterministic).
    const auth = await request(context.api.getApp())
      .post('/api/v1/auth/simulated')
      .send({ username: 'testadmin', role: 'admin' });
    adminAuth = `Bearer ${auth.body.data.session.token}`;
  });
  afterEach(async () => {
    await cleanupAPITestContext(context);
  });

  it('requires authentication', async () => {
    const res = await request(context.api.getApp()).get(
      '/api/v1/admin/notifications'
    );
    expect(res.status).toBe(401);
  });

  it('forbids non-admins', async () => {
    const app = context.api.getApp();
    const auth = await request(app)
      .post('/api/v1/auth/simulated')
      .send({ username: 'joe.public', role: 'public' });
    const token = auth.body.data.session.token;

    const res = await request(app)
      .get('/api/v1/admin/notifications')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('lists, counts, marks read, and dismisses for an admin', async () => {
    const notifier = context.civic.getOperatorNotifier();
    const errId = await notifier.systemError({ title: 'Backup failed' });
    await notifier.securityAlert({ title: 'Account locked: x' });

    const app = context.api.getApp();
    const auth = adminAuth;

    const list = await request(app)
      .get('/api/v1/admin/notifications')
      .set('Authorization', auth);
    expect(list.status).toBe(200);
    expect(list.body.data.total).toBe(2);
    expect(list.body.data.unread).toBe(2);

    const count = await request(app)
      .get('/api/v1/admin/notifications/unread-count')
      .set('Authorization', auth);
    expect(count.body.data.unread).toBe(2);

    const read = await request(app)
      .post(`/api/v1/admin/notifications/${errId}/read`)
      .set('Authorization', auth);
    expect(read.status).toBe(200);
    expect(read.body.data.changed).toBe(true);

    const afterRead = await request(app)
      .get('/api/v1/admin/notifications/unread-count')
      .set('Authorization', auth);
    expect(afterRead.body.data.unread).toBe(1);

    const dismiss = await request(app)
      .post(`/api/v1/admin/notifications/${errId}/dismiss`)
      .set('Authorization', auth);
    expect(dismiss.body.data.changed).toBe(true);

    const readAll = await request(app)
      .post('/api/v1/admin/notifications/read-all')
      .set('Authorization', auth);
    expect(readAll.status).toBe(200);
  });

  it('rejects an invalid notification id', async () => {
    const res = await request(context.api.getApp())
      .post('/api/v1/admin/notifications/not-a-number/read')
      .set('Authorization', adminAuth);
    expect(res.status).toBe(400);
  });
});
