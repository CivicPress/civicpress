import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initializeRoleManager } from '@civicpress/core';
import { requirePermission } from '../middleware/require-permission.js';

// Drive the REAL core role system off the default config (no roles.yml present →
// RoleManager falls back to defaults), which now grants the broadcast-box
// permissions: admin → all; clerk → devices:view + all sessions; public → none.
// This verifies both the middleware behaviour AND that the grants are correct.
beforeAll(() => {
  initializeRoleManager(mkdtempSync(join(tmpdir(), 'bb-authz-')));
});

type User = { id: number; username: string; role: string };

async function run(permission: string, user?: User) {
  const res: any = { statusCode: 0, body: null };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: any) => ((res.body = b), res);
  let nextCalled = false;
  await requirePermission(permission)({ user } as any, res, () => {
    nextCalled = true;
  });
  return { res, nextCalled };
}

describe('broadcast-box requirePermission (real role grants)', () => {
  it('401s an unauthenticated request (no req.user)', async () => {
    const { res, nextCalled } = await run('broadcast-box:devices:view');
    expect(res.statusCode).toBe(401);
    expect(nextCalled).toBe(false);
  });

  it('lets an admin view devices', async () => {
    const { res, nextCalled } = await run('broadcast-box:devices:view', {
      id: 1,
      username: 'admin',
      role: 'admin',
    });
    expect(nextCalled).toBe(true);
    expect(res.statusCode).toBe(0);
  });

  it('403s a public user on devices:view', async () => {
    const { res, nextCalled } = await run('broadcast-box:devices:view', {
      id: 2,
      username: 'pub',
      role: 'public',
    });
    expect(res.statusCode).toBe(403);
    expect(nextCalled).toBe(false);
  });

  it('lets a clerk start (create) a recording session', async () => {
    const { nextCalled } = await run('broadcast-box:sessions:create', {
      id: 3,
      username: 'clerk',
      role: 'clerk',
    });
    expect(nextCalled).toBe(true);
  });

  it('403s a clerk on devices:enroll (admin-only)', async () => {
    const { res, nextCalled } = await run('broadcast-box:devices:enroll', {
      id: 3,
      username: 'clerk',
      role: 'clerk',
    });
    expect(res.statusCode).toBe(403);
    expect(nextCalled).toBe(false);
  });

  it('lets an admin reset rate limits (broadcast-box:admin)', async () => {
    const { nextCalled } = await run('broadcast-box:admin', {
      id: 1,
      username: 'admin',
      role: 'admin',
    });
    expect(nextCalled).toBe(true);
  });
});
