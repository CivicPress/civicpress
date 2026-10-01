import { describe, it, expect, vi } from 'vitest';
import { authenticateConnection } from '../auth.js';
import { PermissionDeniedError } from '../errors/realtime-errors.js';

/**
 * The WebSocket handshake draws the same line as the API's read paths: a
 * draft, or a record in a status that is not public, needs
 * `records:view_unpublished`. Before this, `records:view` — which every
 * self-registered `public` account holds — was enough to join a draft's
 * collaboration room by id.
 */
function services(opts: {
  permissions: Record<string, boolean>;
  record?: { type: string; status?: string } | null;
  draft?: { type: string; status?: string } | null;
}) {
  const user = { id: 7, username: 'passerby', role: 'public' };
  const authService = {
    validateSession: vi.fn().mockResolvedValue(user),
    userCan: vi.fn(
      async (_user: unknown, permission: string) =>
        opts.permissions[permission] ?? false
    ),
  } as any;
  const recordManager = {
    getRecord: vi.fn().mockResolvedValue(opts.record ?? null),
  } as any;
  const databaseService = {
    getDraft: vi.fn().mockResolvedValue(opts.draft ?? null),
  } as any;
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any;
  return { authService, recordManager, databaseService, logger };
}

const publicOnly = { 'records:view': true };
const reviewer = { 'records:view': true, 'records:view_unpublished': true };

async function connect(s: ReturnType<typeof services>) {
  return authenticateConnection(
    'token',
    'rec-1',
    s.authService,
    s.recordManager,
    s.logger,
    s.databaseService
  );
}

describe('authenticateConnection and unpublished records', () => {
  it('lets records:view alone into a published record', async () => {
    const s = services({
      permissions: publicOnly,
      record: { type: 'bylaw', status: 'published' },
    });
    const conn = await connect(s);
    expect(conn.permissions.canView).toBe(true);
    expect(conn.permissions.canEdit).toBe(false);
  });

  it('refuses records:view alone on a draft row', async () => {
    const s = services({
      permissions: publicOnly,
      draft: { type: 'bylaw', status: 'draft' },
    });
    await expect(connect(s)).rejects.toBeInstanceOf(PermissionDeniedError);
    await expect(connect(s)).rejects.toMatchObject({
      context: { reason: 'unpublished' },
    });
  });

  it('refuses records:view alone on a published-table row in a non-public status', async () => {
    const s = services({
      permissions: publicOnly,
      record: { type: 'bylaw', status: 'pending_review' },
    });
    await expect(connect(s)).rejects.toBeInstanceOf(PermissionDeniedError);
  });

  it('admits records:view_unpublished to a draft', async () => {
    const s = services({
      permissions: reviewer,
      draft: { type: 'bylaw', status: 'draft' },
    });
    const conn = await connect(s);
    expect(conn.permissions.canView).toBe(true);
  });

  it('still refuses a caller without records:view before anything else', async () => {
    const s = services({
      permissions: {},
      record: { type: 'bylaw', status: 'published' },
    });
    await expect(connect(s)).rejects.toBeInstanceOf(PermissionDeniedError);
    expect(s.authService.userCan).not.toHaveBeenCalledWith(
      expect.anything(),
      'records:view_unpublished'
    );
  });
});
