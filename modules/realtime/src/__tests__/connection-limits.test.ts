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
