// closes master-plan §5 Phase 3 exit criterion #1
//
// A client that drops mid-edit and reconnects WITHIN the grace period recovers
// its edits; two clients converge after a mid-edit drop. Server-side integration
// test: simulated y-protocols clients over real `ws` connections against a real
// in-memory RealtimeServer (no browser). The grace-period behaviour under test is
// spec §6.3 (multi-client edit + crash recovery).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createTestRealtimeServer,
  createSimulatedYClient,
  type TestRealtimeCtx,
} from './harness.js';

describe('exit criterion #1: offline edit then reconnect-and-sync', () => {
  let ctx: TestRealtimeCtx;

  beforeEach(async () => {
    ctx = await createTestRealtimeServer({ graceMs: 500 });
  });

  afterEach(async () => {
    await ctx.close();
  });

  it("preserves A's edits across A reconnect within grace period", async () => {
    // Client A connects, edits, drops, reconnects → state persists.
    const a1 = await createSimulatedYClient({
      ctx,
      userId: 'user-a',
      recordId: 'r1',
    });
    a1.insertText('Hello world.');
    await a1.flushUpdates();

    a1.disconnect(); // abrupt drop
    await ctx.tick(50); // less than graceMs

    const a2 = await createSimulatedYClient({
      ctx,
      userId: 'user-a',
      recordId: 'r1',
    });
    await a2.waitForSync();
    expect(a2.getText()).toBe('Hello world.');
    a2.disconnect();
  });

  it('converges A and B after A reconnects mid-B-edit', async () => {
    const a1 = await createSimulatedYClient({
      ctx,
      userId: 'user-a',
      recordId: 'r2',
    });
    a1.insertText('A1 ');
    await a1.flushUpdates();
    a1.disconnect();
    await ctx.tick(50);

    const b = await createSimulatedYClient({
      ctx,
      userId: 'user-b',
      recordId: 'r2',
    });
    await b.waitForSync();
    b.appendText('B1 ');
    await b.flushUpdates();

    const a2 = await createSimulatedYClient({
      ctx,
      userId: 'user-a',
      recordId: 'r2',
    });
    await a2.waitForSync();
    a2.appendText('A2 ');
    await a2.flushUpdates();
    // Let A2's edit relay to B and converge (CRDT merge), then assert equality.
    await ctx.waitUntil(
      () =>
        a2.getText() === b.getText() &&
        b.getText().includes('A1 ') &&
        b.getText().includes('B1 ') &&
        b.getText().includes('A2 '),
      'A and B did not converge after reconnect-mid-edit'
    );

    // Both clients see the same final state.
    expect(a2.getText()).toBe(b.getText());
    expect(a2.getText()).toContain('A1 ');
    expect(a2.getText()).toContain('B1 ');
    expect(a2.getText()).toContain('A2 ');

    a2.disconnect();
    b.disconnect();
  });

  it('finalizes (snapshots + evicts) the room when grace elapses', async () => {
    const a = await createSimulatedYClient({
      ctx,
      userId: 'user-a',
      recordId: 'r3',
    });
    await a.waitForSync();
    a.insertText('Persist me.');
    await a.flushUpdates();
    a.disconnect();

    expect(ctx.hasRoom('records:r3')).toBe(true);

    // Wait past the grace window: the room must be finalized + evicted.
    await ctx.waitForRoomEviction('records:r3');
    expect(ctx.hasRoom('records:r3')).toBe(false);

    // Finalization triggered the handler snapshot, which writes the
    // collaborative Markdown back as a draft.
    const draft = await ctx.getDraft('r3');
    expect(draft).not.toBeNull();
    expect(draft?.markdown_body).toContain('Persist me.');

    // A fresh client gets the persisted state back from the snapshot baseline.
    const a2 = await createSimulatedYClient({
      ctx,
      userId: 'user-a',
      recordId: 'r3',
    });
    await a2.waitForSync();
    expect(a2.getText()).toBe('Persist me.');
    a2.disconnect();
  });

  it('cancels the grace timer when a client reconnects within grace', async () => {
    const a = await createSimulatedYClient({
      ctx,
      userId: 'user-a',
      recordId: 'r4',
    });
    a.insertText('Stay alive.');
    await a.flushUpdates();
    const room = ctx.getRoom('records:r4');
    a.disconnect();
    await ctx.tick(50);

    // Reconnect within grace cancels the timer and reuses the same in-memory room.
    const a2 = await createSimulatedYClient({
      ctx,
      userId: 'user-a',
      recordId: 'r4',
    });
    await a2.waitForSync();
    expect(ctx.getRoom('records:r4')).toBe(room); // same instance — not evicted

    // Past the original grace window: still present, because reconnect cancelled it.
    await ctx.tick(600);
    expect(ctx.hasRoom('records:r4')).toBe(true);
    expect(a2.getText()).toBe('Stay alive.');
    a2.disconnect();
  });
});
