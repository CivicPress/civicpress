/**
 * FA-API-007 — /auth/password locks an account after repeated failures.
 *
 * The default policy is 5 attempts / 15m (auth-config). We drive 5 wrong
 * passwords and assert the account is then locked (429) even when the correct
 * password is finally supplied — proving the lock is per-account, not just a
 * bad-credential response.
 */

import request from 'supertest';
import {
  createAPITestContext,
  APITestContext,
  cleanupAPITestContext,
} from '../fixtures/test-setup';

describe('FA-API-007: account lockout on /auth/password', () => {
  let context: APITestContext;
  // Unique per run so a lingering lock from a prior run can't bleed in.
  const username = `lockme-${Date.now()}`;
  const goodPassword = 'CorrectHorse123!';

  beforeAll(async () => {
    context = await createAPITestContext();
    // Real password user (bcrypt hash stored).
    const reg = await request(context.api.getApp())
      .post('/api/v1/users/register')
      .send({
        username,
        email: `${username}@example.com`,
        password: goodPassword,
        name: 'Lock Me',
      });
    // Created (200/201), or 409 if a prior run/seed already made the account.
    expect([200, 201, 409]).toContain(reg.status);
  });

  afterAll(async () => {
    await cleanupAPITestContext(context);
  });

  it('locks the account (429) after repeated failures, refusing even the right password', async () => {
    // Drive wrong passwords until the account locks (default policy 5/15m; the
    // exact count is config-driven, so don't hard-code it — just prove it
    // locks within a small bound and not on the very first try).
    let firstStatus: number | undefined;
    let lockedAt = -1;
    for (let i = 0; i < 8; i++) {
      const res = await request(context.api.getApp())
        .post('/api/v1/auth/password')
        .send({ username, password: 'wrong-password' });
      if (firstStatus === undefined) firstStatus = res.status;
      if (res.status === 429) {
        lockedAt = i;
        break;
      }
    }
    expect(firstStatus).not.toBe(429); // not locked on the first attempt
    expect(lockedAt).toBeGreaterThan(0); // locked within the bound

    // Even the CORRECT password is refused while locked.
    const locked = await request(context.api.getApp())
      .post('/api/v1/auth/password')
      .send({ username, password: goodPassword });
    expect(locked.status).toBe(429);
    expect(JSON.stringify(locked.body).toLowerCase()).toContain('locked');
  });

  it('a different account is unaffected by another account being locked', async () => {
    const other = `freeuser-${Date.now()}`;
    await request(context.api.getApp())
      .post('/api/v1/users/register')
      .send({
        username: other,
        email: `${other}@example.com`,
        password: goodPassword,
        name: 'Free User',
      });

    const res = await request(context.api.getApp())
      .post('/api/v1/auth/password')
      .send({ username: other, password: goodPassword });
    expect(res.status).toBe(200);
  });
});
