// W5-T12: three additional realtime integration tests.
//
// All three use the shared harness from harness.ts (built in W5-T10/T11) and
// pin already-built behaviour — TDD-ish regression/integration style.
//
// 1. Connection-limit churn (realtime-001/002 regression): 100 connect/
//    disconnect cycles leave the server's count maps empty — no leak.
// 2. Snapshot round-trip: edit → grace-finalize → new client recovers state.
// 3. Snapshot integrity fallback: corrupted snapshot → Markdown seed (not
//    A's lost edit) is returned to a fresh client.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createTestRealtimeServer,
  createSimulatedYClient,
  type TestRealtimeCtx,
} from './harness.js';

// ---------------------------------------------------------------------------
// 1. Connection-limit churn (realtime-001 + realtime-002 regression)
// ---------------------------------------------------------------------------
describe('realtime-001/002: connection-limit churn leaves no leak', () => {
  let ctx: TestRealtimeCtx;

  beforeEach(async () => {
    // Set connectionsPerIp high enough so the 100-cycle churn is never limited.
    // The harness default (100) matches spec; no option needed here because the
    // harness already configures connections_per_ip = 100 and
    // connections_per_user = 100.
    ctx = await createTestRealtimeServer({ graceMs: 200 });
  });

  afterEach(async () => {
    await ctx.close();
  });

  it('100 sequential connect/disconnect cycles leave no count-map entry', async () => {
    const CYCLES = 100;
    for (let i = 0; i < CYCLES; i++) {
      const client = await createSimulatedYClient({
        ctx,
        userId: `churn-user-${i}`,
        recordId: 'churn-record',
      });
      // Abrupt terminate (simulates a network drop — same path as the real
      // disconnect handler).
      client.disconnect();
      // Allow the 'close' event on the server side to propagate before the
      // next iteration. The handler is synchronous once 'close' fires, but
      // the event loop must turn over once.
      await ctx.tick(5);
    }

    // After all connections are torn down, both count maps must be empty: no
    // per-IP count, no per-user set. A non-zero size means handleDisconnect
    // leaked an entry (realtime-001 per-IP or realtime-002 per-user).
    expect(ctx.server.getConnectionCounts().size).toBe(0);
    expect(ctx.server.getUserConnections().size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 2. Snapshot round-trip
// ---------------------------------------------------------------------------
describe('snapshot round-trip: edit persists and rehydrates', () => {
  let ctx: TestRealtimeCtx;

  beforeEach(async () => {
    ctx = await createTestRealtimeServer({
      graceMs: 300,
      records: {
        snap1: {
          id: 'snap1',
          title: 'Snapshot Bylaw',
          type: 'bylaw',
          status: 'published',
          content: '# Snapshot Bylaw\n\nOriginal.\n',
        },
      },
    });
  });

  afterEach(async () => {
    await ctx.close();
  });

  it("client A edits, grace-finalizes, then a new client recovers A's edit from the snapshot", async () => {
    // (1) Client A connects, syncs, and makes an edit.
    const alice = await createSimulatedYClient({
      ctx,
      userId: 'alice',
      recordId: 'snap1',
    });
    await alice.waitForSync();

    alice.appendParagraph('Alice snapshot edit.');
    await alice.flushUpdates();

    // (2) A disconnects → room becomes clientless → grace timer starts.
    alice.disconnect();

    // (3) Wait for the room to be evicted (grace window elapses → finalize →
    //     snapshot persisted).
    await ctx.waitForRoomEviction('records:snap1');

    // (4) The SnapshotManager should now have a row for the room.
    const sm = ctx.snapshotManager;
    expect(sm).not.toBeNull();
    const row = await sm!.loadLatestVerified('records:snap1');
    expect(row).not.toBeNull();

    // (5) A FRESH client connects. The server seeds from the persisted snapshot
    //     (no in-memory room). After sync the client should see A's edit.
    const bob = await createSimulatedYClient({
      ctx,
      userId: 'bob',
      recordId: 'snap1',
    });
    await bob.waitForSync();

    // Give the server time to apply the snapshot to the fresh room.
    await ctx.waitUntil(
      () => bob.getDocText().includes('Alice snapshot edit.'),
      "new client did not recover A's edit from the persisted snapshot"
    );

    expect(bob.getDocText()).toContain('Alice snapshot edit.');
    bob.disconnect();
  });
});

// ---------------------------------------------------------------------------
// 3. Snapshot integrity fallback
// ---------------------------------------------------------------------------
describe('snapshot integrity fallback: corrupted snapshot → Markdown seed', () => {
  let ctx: TestRealtimeCtx;

  const RECORD_CONTENT = '# Integrity Bylaw\n\nOriginal content.\n';

  beforeEach(async () => {
    ctx = await createTestRealtimeServer({
      graceMs: 300,
      records: {
        integ1: {
          id: 'integ1',
          title: 'Integrity Bylaw',
          type: 'bylaw',
          status: 'published',
          content: RECORD_CONTENT,
        },
      },
    });
  });

  afterEach(async () => {
    await ctx.close();
  });

  it('corrupted snapshot is discarded and the room seeds from Markdown instead', async () => {
    // (1) Client A connects, edits, disconnects → room finalizes → snapshot.
    const alice = await createSimulatedYClient({
      ctx,
      userId: 'alice',
      recordId: 'integ1',
    });
    await alice.waitForSync();

    alice.appendParagraph('Lost edit — should not appear after corruption.');
    await alice.flushUpdates();
    alice.disconnect();

    await ctx.waitForRoomEviction('records:integ1');

    // Confirm the snapshot was actually persisted before we corrupt it.
    const sm = ctx.snapshotManager;
    expect(sm).not.toBeNull();
    const rowBefore = await sm!.loadLatestVerified('records:integ1');
    expect(rowBefore).not.toBeNull();

    // (2) Corrupt the persisted snapshot (overwrite integrity_hash in meta.json).
    await ctx.corruptSnapshot('records:integ1');

    // The corruption is immediate: loadLatestVerified now returns null.
    const rowAfter = await sm!.loadLatestVerified('records:integ1');
    expect(rowAfter).toBeNull();

    // (3) A NEW client connects. initializeRoom() calls loadLatestVerified →
    //     null (corrupted) → falls back to room.initialize(recordId) which
    //     seeds from the record's Markdown content.
    const bob = await createSimulatedYClient({
      ctx,
      userId: 'bob',
      recordId: 'integ1',
    });
    await bob.waitForSync();

    // The client should see the ORIGINAL record Markdown, NOT A's lost edit.
    await ctx.waitUntil(
      () =>
        bob.getDocText().includes('Original content.') ||
        bob.getDocText().includes('Integrity Bylaw'),
      'new client did not receive the Markdown-seed fallback content'
    );

    expect(bob.getDocText()).not.toContain(
      'Lost edit — should not appear after corruption.'
    );
    // The seeded content comes from the record's Markdown (heading + body).
    expect(bob.getDocText()).toMatch(/Integrity Bylaw|Original content\./);
    bob.disconnect();
  });
});
