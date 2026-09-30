import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import {
  createAPITestContext,
  cleanupAPITestContext,
  type APITestContext,
} from '../fixtures/test-setup';

/**
 * `auth.registration.enabled` — the operator switch for self-service accounts.
 *
 * `POST /users/register` needed no authentication, no verification and had no
 * switch, and handed out the `public` role — which, until the gate learned to
 * ask for `records:view_unpublished`, was enough to read every draft. The
 * permission closes that; this switch lets an instance decide that accounts
 * are created by an administrator only.
 *
 * On by default: an upgrade changes nothing.
 */
describe('auth.registration.enabled', () => {
  const account = {
    username: 'walkin',
    email: 'walkin@example.com',
    password: 'Passw0rd!123',
  };

  describe('closed (enabled: false)', () => {
    let context: APITestContext;

    beforeAll(async () => {
      context = await createAPITestContext({
        civicrc: { auth: { registration: { enabled: false } } },
      });
    });

    afterAll(async () => {
      await cleanupAPITestContext(context);
    });

    it('refuses registration with 403 REGISTRATION_DISABLED before reading the body', async () => {
      const res = await request(context.api.getApp())
        .post('/api/v1/users/register')
        .send(account);
      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error?.code).toBe('REGISTRATION_DISABLED');

      // An empty body gets the same answer — a closed door does not say which
      // usernames or emails it already knows.
      const empty = await request(context.api.getApp())
        .post('/api/v1/users/register')
        .send({});
      expect(empty.status).toBe(403);
      expect(empty.body.error?.code).toBe('REGISTRATION_DISABLED');
    });

    it('tells the UI through /auth/providers', async () => {
      const res = await request(context.api.getApp()).get(
        '/api/v1/auth/providers'
      );
      expect(res.status).toBe(200);
      expect(res.body.data.registration).toEqual({ enabled: false });
    });

    it('leaves password login untouched for existing accounts', async () => {
      // The admin the fixture creates through simulated auth still logs in;
      // the switch is about creating accounts, not using them.
      const me = await request(context.api.getApp())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${context.adminToken}`);
      expect(me.status).toBe(200);
    });
  });

  describe('default (no auth section in .civicrc)', () => {
    let context: APITestContext;

    beforeAll(async () => {
      context = await createAPITestContext();
    });

    afterAll(async () => {
      await cleanupAPITestContext(context);
    });

    it('is open, and says so', async () => {
      const providers = await request(context.api.getApp()).get(
        '/api/v1/auth/providers'
      );
      expect(providers.body.data.registration).toEqual({ enabled: true });

      const res = await request(context.api.getApp())
        .post('/api/v1/users/register')
        .send(account);
      expect(res.status).toBe(200);
      expect(res.body.data.user.role).toBe('public');
    });
  });
});
