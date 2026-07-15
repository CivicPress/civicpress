/**
 * Connection-limit lifecycle tests (regression: realtime-001 + realtime-002)
 *
 * Pins the auth-first ordering and the single canonical disconnect path:
 *  - per-user / per-IP limits are enforced AFTER authentication (so the userId
 *    branch is reachable) — realtime-001.
 *  - both the per-IP count and the per-user set are decremented on disconnect,
 *    with the map entry deleted at zero — realtime-002.
 *  - a failed authentication never increments any count (no leak).
 *
 * See docs/specs/2026-06-04-phase-3-realtime-design.md §6.4.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WebSocket } from 'ws';
import { createTestServer, type TestServerCtx } from './test-utils.js';
import type {
  RoomTypeHandler,
  ConnectionContext,
  AuthResult,
} from '../types/handler-registry.types.js';

describe('RealtimeServer connection limits', () => {
  let ctx: TestServerCtx;

  beforeEach(async () => {
    ctx = await createTestServer({
      connectionLimits: {
        connectionsPerIp: 3,
        connectionsPerUser: 2,
      },
    });
  });

  afterEach(async () => {
    await ctx.close();
  });

  it('enforces per-user limit POST-AUTH (regression: realtime-001)', async () => {
    const userA = ctx.makeToken({ userId: 'user-a' });

    const ws1 = await ctx.connect({ token: userA, roomId: 'records:r1' });
    const ws2 = await ctx.connect({ token: userA, roomId: 'records:r2' });
    expect(ws1.readyState).toBe(WebSocket.OPEN);
    expect(ws2.readyState).toBe(WebSocket.OPEN);

    const ws3 = await ctx.connectExpectingClose({
      token: userA,
      roomId: 'records:r3',
    });
    expect(ws3.closeCode).toBe(4029);
    expect(ws3.closeReason).toContain('CONNECTION_LIMIT_EXCEEDED');
  });

  it('enforces per-IP limit POST-AUTH across users', async () => {
    const userA = ctx.makeToken({ userId: 'user-a' });
    const userB = ctx.makeToken({ userId: 'user-b' });
    const userC = ctx.makeToken({ userId: 'user-c' });
    const userD = ctx.makeToken({ userId: 'user-d' });

    await ctx.connect({ token: userA, roomId: 'records:r1' });
    await ctx.connect({ token: userB, roomId: 'records:r1' });
    await ctx.connect({ token: userC, roomId: 'records:r1' });

    const ws4 = await ctx.connectExpectingClose({
      token: userD,
      roomId: 'records:r1',
    });
    expect(ws4.closeCode).toBe(4029);
  });

  it('rejects unauthenticated connections without counting them (no leak)', async () => {
    const ws = await ctx.connectExpectingClose({
      token: 'invalid-token',
      roomId: 'records:r1',
    });
    expect(ws.closeCode).toBe(4001);

    // After auth failure, the count should NOT have incremented.
    const ipCount = ctx.server.getConnectionCounts().get(ctx.localIp) ?? 0;
    expect(ipCount).toBe(0);
  });

  it('decrements per-IP count on disconnect (regression: realtime-002)', async () => {
    const userA = ctx.makeToken({ userId: 'user-a' });
    const ws1 = await ctx.connect({ token: userA, roomId: 'records:r1' });

    expect(ctx.server.getConnectionCounts().get(ctx.localIp)).toBe(1);

    ws1.close();
    await ctx.waitForDisconnect(ws1);

    expect(ctx.server.getConnectionCounts().has(ctx.localIp)).toBe(false);
  });

  it('decrements per-user set on last-disconnect (regression: realtime-002)', async () => {
    const userA = ctx.makeToken({ userId: 'user-a' });
    const ws1 = await ctx.connect({ token: userA, roomId: 'records:r1' });
    const ws2 = await ctx.connect({ token: userA, roomId: 'records:r2' });

    expect(ctx.server.getUserConnections().get('user-a')?.size).toBe(2);

    ws1.close();
    await ctx.waitForDisconnect(ws1);
    expect(ctx.server.getUserConnections().get('user-a')?.size).toBe(1);

    ws2.close();
    await ctx.waitForDisconnect(ws2);
    expect(ctx.server.getUserConnections().has('user-a')).toBe(false);
  });

  it('does NOT leak counts across 20 connect-disconnect cycles (no-leak invariant)', async () => {
    const userA = ctx.makeToken({ userId: 'user-a' });
    for (let i = 0; i < 20; i++) {
      const ws = await ctx.connect({ token: userA, roomId: `records:r${i}` });
      ws.close();
      await ctx.waitForDisconnect(ws);
    }
    expect(ctx.server.getConnectionCounts().size).toBe(0);
    expect(ctx.server.getUserConnections().size).toBe(0);
  });
});

/**
 * Close-during-setup race (regression: realtime-002 — adversarial review).
 *
 * The leak: connection counts (per-IP + per-user) and the live connections map
 * are registered SYNCHRONOUSLY, but the canonical disconnect path
 * (ws.once('close', () => handleDisconnect(...))) was wired only AFTER the
 * per-connection async setup (handler.onPostConnect, room hydration). A socket
 * that closes DURING that await window attaches the listener too late — the
 * 'close' event already fired — so handleDisconnect never runs and all three
 * maps leak permanently.
 *
 * Latent today (RecordRoomHandler has no onPostConnect; the hydration await is
 * dead), but live the moment W3/W5 add real async per-room setup. This test
 * injects exactly that async setup via a delaying onPostConnect and closes the
 * socket mid-await, asserting both count maps AND the live connections map drain
 * to zero. It MUST fail against the pre-fix server (proving the leak) and pass
 * once the disconnect path is wired synchronously-adjacent to register and
 * handleDisconnect is made idempotent + partial-setup-tolerant.
 */
describe('RealtimeServer close-during-setup race (regression: realtime-002)', () => {
  let ctx: TestServerCtx;

  beforeEach(async () => {
    ctx = await createTestServer({
      connectionLimits: {
        connectionsPerIp: 5,
        connectionsPerUser: 5,
      },
    });
  });

  afterEach(async () => {
    await ctx.close();
  });

  it('does NOT leak counts when the socket closes mid async setup (onPostConnect)', async () => {
    // A `records`-room handler whose onPostConnect awaits a delay — simulating
    // the real per-room async setup W5 will add. Registering it replaces the
    // harness default RecordRoomHandler for the `records` room type.
    let postConnectEntered = false;
    const slowHandler: RoomTypeHandler = {
      roomType: 'records',
      async onConnect(_ctx: ConnectionContext): Promise<AuthResult> {
        return { success: true };
      },
      async onPostConnect(): Promise<void> {
        postConnectEntered = true;
        // Long enough that the client can close while we are still in here.
        await new Promise<void>((resolve) => setTimeout(resolve, 500));
      },
    };
    ctx.server.registerRoomTypeHandler(slowHandler);

    const userA = ctx.makeToken({ userId: 'user-a' });

    // Open the socket directly (the harness connect() resolves on 'open', but we
    // need to close DURING the server's post-open async setup, so we drive the
    // raw socket and close as soon as it opens).
    const url = `ws://127.0.0.1:${ctx.port}/realtime/records/race1`;
    const ws = new WebSocket(url, {
      headers: { Authorization: `Bearer ${userA}` },
    });

    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('race connect timed out')), 4000);
      ws.on('open', () => {
        clearTimeout(t);
        resolve();
      });
      ws.on('error', (e) => {
        clearTimeout(t);
        reject(e);
      });
    });

    // The HTTP upgrade has completed (open fired); the server is now mid
    // onPostConnect await. Close the socket inside that window.
    const closed = new Promise<void>((resolve) => ws.once('close', () => resolve()));
    ws.close();
    await closed;

    // Let the server's onPostConnect await settle (>500ms) plus a margin so the
    // (now correctly wired) close handler has run to completion.
    await new Promise<void>((resolve) => setTimeout(resolve, 800));

    // The setup path must actually have been entered — otherwise this test would
    // be vacuously green (not exercising the race window at all).
    expect(postConnectEntered).toBe(true);

    // All three maps must be fully drained for this client.
    expect(ctx.server.getConnectionCounts().get(ctx.localIp) ?? 0).toBe(0);
    expect(ctx.server.getConnectionCounts().size).toBe(0);
    expect(ctx.server.getUserConnections().get('user-a')?.size ?? 0).toBe(0);
    expect(ctx.server.getUserConnections().size).toBe(0);
    expect(ctx.server.getConnections().size).toBe(0);
  });
});
