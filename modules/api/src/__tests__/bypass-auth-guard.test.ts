/**
 * FA-API-002 — the BYPASS_AUTH / X-Mock-User backdoor must be inert outside
 * an explicit dev/test environment, even when the env var is present.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { authMiddleware } from '../middleware/auth.js';

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

const ADMIN_MOCK = JSON.stringify({ id: 1, username: 'x', role: 'admin' });

describe('BYPASS_AUTH / X-Mock-User guard (FA-API-002)', () => {
  const origEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...origEnv };
    vi.restoreAllMocks();
  });

  function run(env: Record<string, string | undefined>) {
    for (const [k, v] of Object.entries(env)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    const req: any = { headers: { 'x-mock-user': ADMIN_MOCK } };
    const res = mockRes();
    const next = vi.fn();
    const handler = authMiddleware({} as any);
    return { req, res, next, handler };
  }

  it('does NOT honour X-Mock-User with NODE_ENV unset (realistic prod default)', async () => {
    const { req, res, next, handler } = run({
      NODE_ENV: undefined,
      BYPASS_AUTH: 'true',
    });
    await handler(req, res, next);

    expect(req.user).toBeUndefined();
    expect(next).not.toHaveBeenCalled(); // fell through to auth, no header → 401
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('does NOT honour X-Mock-User under NODE_ENV=production', async () => {
    const { req, res, next, handler } = run({
      NODE_ENV: 'production',
      BYPASS_AUTH: 'true',
    });
    await handler(req, res, next);
    expect(req.user).toBeUndefined();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('does NOT honour X-Mock-User in development without the opt-in flag', async () => {
    const { req, res, next, handler } = run({
      NODE_ENV: 'development',
      BYPASS_AUTH: 'true',
      CIVIC_ALLOW_SIMULATED_AUTH: undefined,
    });
    await handler(req, res, next);
    expect(req.user).toBeUndefined();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('honours X-Mock-User under NODE_ENV=test (the test affordance)', async () => {
    const { req, res, next, handler } = run({
      NODE_ENV: 'test',
      BYPASS_AUTH: 'true',
    });
    await handler(req, res, next);
    expect(req.user).toMatchObject({ role: 'admin' });
    expect(next).toHaveBeenCalled();
  });

  it('honours X-Mock-User in development WITH the opt-in flag', async () => {
    const { req, res, next, handler } = run({
      NODE_ENV: 'development',
      BYPASS_AUTH: 'true',
      CIVIC_ALLOW_SIMULATED_AUTH: 'true',
    });
    await handler(req, res, next);
    expect(req.user).toMatchObject({ role: 'admin' });
    expect(next).toHaveBeenCalled();
  });
});
