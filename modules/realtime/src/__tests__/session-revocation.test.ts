/**
 * Session-revocation teardown tests (Tier-A skeptic deferral, 2026-07-16)
 *
 * The gap: WebSocket authentication is a CONNECT-TIME check. `validateSession`
 * runs once during the upgrade and nothing re-validates on later frames, so a
 * session revoked server-side (logout-everywhere, password change) left the
 * already-established socket fully live — still reading the room, still writing
 * edits — until it happened to reconnect.
 *
 * These tests pin the realtime half of the fix:
 *  - `revokeUserConnections()` closes every live socket for that user (4001
 *    SESSION_REVOKED) and touches nobody else's,
 *  - the core hook (`auth:sessions:revoked`) drives it,
 *  - server-side state is released SYNCHRONOUSLY, before the close handshake
 *    round-trips — which is what makes the message-path liveness gate effective
 *    against a client that stalls the handshake,
 *  - the connection bookkeeping drains exactly once (no realtime-002 regression),
 *  - a malformed/foreign hook payload is ignored rather than mass-disconnecting.
 *
 * NOTE: nothing in core EMITS `auth:sessions:revoked` yet (AuthService holds no
 * HookSystem), so the subscriber is dormant in production. The hook-driven test
 * below emits it on the same bus core would, which is what pins the contract.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WebSocket } from 'ws';
import { createTestServer, type TestServerCtx } from './test-utils.js';
import { SESSION_REVOKED_HOOK } from '../realtime-server.js';

interface CloseInfo {
  code: number;
  reason: string;
}

/** Capture the close code/reason a client observes. Attach BEFORE revoking. */
function onClose(ws: WebSocket): Promise<CloseInfo> {
  return new Promise<CloseInfo>((resolve) => {
    ws.once('close', (code: number, reason: Buffer) =>
      resolve({ code, reason: reason.toString() })
    );
  });
}

/** Collect every JSON control frame the client receives. */
function collectMessages(ws: WebSocket): Array<Record<string, unknown>> {
  const seen: Array<Record<string, unknown>> = [];
  ws.on('message', (data: Buffer, isBinary: boolean) => {
    if (isBinary) {
      return; // y-protocols frames are not control messages.
    }
    try {
      seen.push(JSON.parse(data.toString()));
    } catch {
      // Non-JSON text frames are not part of this contract.
    }
  });
  return seen;
}

describe('RealtimeServer session revocation', () => {
  let ctx: TestServerCtx;

  beforeEach(async () => {
    ctx = await createTestServer({
      connectionLimits: { connectionsPerIp: 10, connectionsPerUser: 5 },
    });
  });

  afterEach(async () => {
    await ctx.close();
  });

  it('closes every live socket of the revoked user with 4001 SESSION_REVOKED', async () => {
    const userA = ctx.makeToken({ userId: 'user-a' });
    const ws1 = await ctx.connect({ token: userA, roomId: 'records:r1' });
    const ws2 = await ctx.connect({ token: userA, roomId: 'records:r2' });

    const closes = Promise.all([onClose(ws1), onClose(ws2)]);
    expect(ctx.server.revokeUserConnections('user-a')).toBe(2);

    const [c1, c2] = await closes;
    expect(c1.code).toBe(4001);
    expect(c1.reason).toContain('SESSION_REVOKED');
    expect(c2.code).toBe(4001);
    expect(c2.reason).toContain('SESSION_REVOKED');
  });

  it('leaves other users connected', async () => {
    const userA = ctx.makeToken({ userId: 'user-a' });
    const userB = ctx.makeToken({ userId: 'user-b' });
    await ctx.connect({ token: userA, roomId: 'records:r1' });
    const wsB = await ctx.connect({ token: userB, roomId: 'records:r1' });

    expect(ctx.server.revokeUserConnections('user-a')).toBe(1);

    expect(ctx.server.getUserConnections().has('user-a')).toBe(false);
    expect(ctx.server.getUserConnections().get('user-b')?.size).toBe(1);
    expect(wsB.readyState).toBe(WebSocket.OPEN);
  });

  it('tells the client WHY before closing (session.revoked control frame)', async () => {
    const userA = ctx.makeToken({ userId: 'user-a' });
    const ws = await ctx.connect({ token: userA, roomId: 'records:r1' });
    const seen = collectMessages(ws);

    const closed = onClose(ws);
    ctx.server.revokeUserConnections('user-a', 'password_changed');
    const info = await closed;

    const notice = seen.find((m) => m.event === 'session.revoked');
    expect(notice).toBeDefined();
    expect(notice!.reason).toBe('password_changed');
    // The reason also rides the close frame, for clients that only read that.
    expect(info.reason).toContain('password_changed');
  });

  it('is driven by the core session-revocation hook', async () => {
    const userA = ctx.makeToken({ userId: 'user-a' });
    const ws = await ctx.connect({ token: userA, roomId: 'records:r1' });

    const closed = onClose(ws);
    await ctx.emitHook(SESSION_REVOKED_HOOK, {
      userId: 'user-a',
      reason: 'logout_everywhere',
    });
    const info = await closed;

    expect(info.code).toBe(4001);
    expect(info.reason).toContain('logout_everywhere');
    expect(ctx.server.getConnections().size).toBe(0);
  });

  it('accepts a numeric userId on the hook (core ids are numbers)', async () => {
    // The per-user tracking key is String(user.id); the hook contract allows the
    // raw numeric id, so the two must still meet.
    const user7 = ctx.makeToken({ userId: 7 });
    const ws = await ctx.connect({ token: user7, roomId: 'records:r1' });

    const closed = onClose(ws);
    await ctx.emitHook(SESSION_REVOKED_HOOK, { userId: 7 });
    expect((await closed).code).toBe(4001);
  });

  it('releases server-side state SYNCHRONOUSLY, before the close handshake', async () => {
    // This is what stops a client that stalls the close handshake (ws waits ~30s
    // before destroying the socket) from continuing to push edits: the
    // connection is out of `connections` the instant revoke returns, and the
    // message handler's liveness gate drops anything that arrives after.
    const userA = ctx.makeToken({ userId: 'user-a' });
    await ctx.connect({ token: userA, roomId: 'records:r1' });
    expect(ctx.server.getConnections().size).toBe(1);

    expect(ctx.server.revokeUserConnections('user-a')).toBe(1);

    // No await between the revoke above and these assertions.
    expect(ctx.server.getConnections().size).toBe(0);
    expect(ctx.server.getUserConnections().has('user-a')).toBe(false);
    expect(ctx.server.getConnectionCounts().size).toBe(0);
  });

  it('drains the count maps exactly once (no realtime-002 double-release)', async () => {
    const userA = ctx.makeToken({ userId: 'user-a' });
    const userB = ctx.makeToken({ userId: 'user-b' });
    const wsA = await ctx.connect({ token: userA, roomId: 'records:r1' });
    await ctx.connect({ token: userB, roomId: 'records:r1' });

    expect(ctx.server.getConnectionCounts().get(ctx.localIp)).toBe(2);

    const closed = onClose(wsA);
    ctx.server.revokeUserConnections('user-a');
    await closed;
    // Let the socket's own 'close' listener fire too — it must be a no-op.
    await new Promise<void>((resolve) => setTimeout(resolve, 100));

    // user-b's connection must still be counted: a double-release would zero it.
    expect(ctx.server.getConnectionCounts().get(ctx.localIp)).toBe(1);
    expect(ctx.server.getUserConnections().get('user-b')?.size).toBe(1);
  });

  it('is a no-op for a user with no live connections', async () => {
    expect(ctx.server.revokeUserConnections('nobody')).toBe(0);
  });

  it('ignores a malformed hook payload instead of mass-disconnecting', async () => {
    const userA = ctx.makeToken({ userId: 'user-a' });
    const ws = await ctx.connect({ token: userA, roomId: 'records:r1' });

    for (const payload of [
      undefined,
      null,
      'user-a',
      {},
      { userId: null },
      { userId: '' },
      { user: 'user-a' },
    ]) {
      await ctx.emitHook(SESSION_REVOKED_HOOK, payload);
    }

    expect(ws.readyState).toBe(WebSocket.OPEN);
    expect(ctx.server.getConnections().size).toBe(1);
  });

  it('detaches its hook listener on shutdown', async () => {
    // The core hook bus is process-wide; a listener left behind would keep a
    // dead server (and every map it owns) reachable forever.
    await ctx.server.shutdown();
    // Emitting after shutdown must not throw into the bus.
    await expect(
      ctx.emitHook(SESSION_REVOKED_HOOK, { userId: 'user-a' })
    ).resolves.toBeUndefined();
  });
});
