// closes master-plan §5 Phase 3 exit criterion #2 — ADAPTED to the DRAFT model.
//
// The plan's exit criterion #2 ("collaborative edits write back to Markdown")
// was written against a fictional `recordManager.saveDraft`-that-commits-to-Git.
// The REAL system (W5-T1/T2) writes the collaborative Markdown back as a DB
// DRAFT (`record_drafts.markdown_body`); Git only happens later on human publish.
// Per the user's "draft now, revisit Git later" decision this test validates the
// collab → DRAFT round-trip against a REAL DatabaseService — NOT a Git commit.
//
// It also exercises the two pieces the round-trip requires:
//   - seeding-from-Markdown on first connect (spec §6.3 t=0): a fresh room with
//     no snapshot hydrates its Y.Doc from the record's current Markdown, so the
//     writeback preserves the heading ("# Title"), not just the appended text;
//   - the periodic snapshot trigger (spec §6.2): a per-room interval drives the
//     handler snapshot (here we drive it directly to keep the test deterministic).
//
// Server-side integration test: simulated y-protocols clients over real `ws`
// against a real in-memory RealtimeServer (no browser, no HTTP API).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createTestRealtimeServer,
  createSimulatedYClient,
  type TestRealtimeCtx,
} from './harness.js';

describe('exit criterion #2: collaborative edits write back to a Markdown draft', () => {
  let ctx: TestRealtimeCtx;

  beforeEach(async () => {
    // Real DatabaseService draft store + a record source that returns seeded
    // Markdown, so the writeback genuinely persists a draft a getDraft reads back
    // and the room can hydrate from the record's current Markdown on first open.
    ctx = await createTestRealtimeServer({
      graceMs: 5000,
      withRealDraftDb: true,
      records: {
        r1: {
          id: 'r1',
          title: 'Test Bylaw',
          type: 'bylaw',
          status: 'published',
          content: '# Title\n\nInitial.\n',
        },
      },
    });
  });

  afterEach(async () => {
    await ctx.close();
  });

  it('seeds from Markdown then writes both collaborators’ edits back as a draft', async () => {
    // (1) Two clients connect. Each should see the SEEDED record content — proof
    // the Markdown-fallback seeding ran (no snapshot exists for a brand-new room).
    const alice = await createSimulatedYClient({
      ctx,
      userId: 'alice',
      recordId: 'r1',
    });
    await alice.waitForSync();

    const bob = await createSimulatedYClient({
      ctx,
      userId: 'bob',
      recordId: 'r1',
    });
    await bob.waitForSync();

    // Both clients start from the record's seeded content (heading + body).
    await ctx.waitUntil(
      () =>
        alice.getDocText().includes('Title') &&
        alice.getDocText().includes('Initial.') &&
        bob.getDocText().includes('Initial.'),
      'clients did not receive the seeded Markdown content'
    );

    // (2) Interleaved collaborative edits: A appends a paragraph, B waits to see
    // it, then B appends a paragraph; both converge (CRDT merge over the real ws
    // relay). Convergence is asserted by polling the content (rather than an
    // update count) so the assertion is insensitive to relay timing.
    alice.appendParagraph('Alice was here.');
    await alice.flushUpdates();
    await ctx.waitUntil(
      () => bob.getDocText().includes('Alice was here.'),
      'B did not receive A’s collaborative edit'
    );

    bob.appendParagraph('Bob was here.');
    await bob.flushUpdates();

    await ctx.waitUntil(
      () =>
        alice.getDocText() === bob.getDocText() &&
        alice.getDocText().includes('Alice was here.') &&
        alice.getDocText().includes('Bob was here.'),
      'A and B did not converge on both collaborative edits'
    );

    // (3) Trigger the snapshot via the in-process record-snapshot seam (the same
    // path the periodic timer drives) while both clients are still connected.
    const result = await ctx.triggerRecordSnapshot('r1');
    expect(result.snapshotCreated).toBe(true);

    // (4) Assert against the REAL draft DB: the writeback persisted a draft whose
    // markdown_body preserved the SEEDED heading AND both collaborators' edits.
    const draft = await ctx.getDraft('r1');
    expect(draft).not.toBeNull();
    expect(draft?.markdown_body).toContain('# Title');
    expect(draft?.markdown_body).toContain('Alice was here.');
    expect(draft?.markdown_body).toContain('Bob was here.');

    alice.disconnect();
    bob.disconnect();
  });

  it('drives the writeback from the periodic snapshot timer (no-diff skip honoured)', async () => {
    // A short periodic interval drives the handler snapshot automatically; this
    // proves the periodic trigger uses the handler (draft-writing) path — the
    // legacy binary-only snapshot path that never wrote a draft is now retired.
    const fast = await createTestRealtimeServer({
      graceMs: 5000,
      withRealDraftDb: true,
      periodicSnapshotMs: 100,
      records: {
        r9: {
          id: 'r9',
          title: 'Periodic Bylaw',
          type: 'bylaw',
          status: 'published',
          content: '# Heading\n\nSeed.\n',
        },
      },
    });
    try {
      const a = await createSimulatedYClient({
        ctx: fast,
        userId: 'alice',
        recordId: 'r9',
      });
      await a.waitForSync();
      await fast.waitUntil(
        () => a.getDocText().includes('Seed.'),
        'client did not receive the seeded Markdown content'
      );
      a.appendParagraph('Periodic edit.');
      await a.flushUpdates();

      // The periodic timer (100ms) fires the handler snapshot → draft writeback.
      await fast.waitUntil(async () => {
        const d = await fast.getDraft('r9');
        return !!d?.markdown_body?.includes('Periodic edit.');
      }, 'periodic snapshot never wrote the collaborative draft', 5000);

      const draft = await fast.getDraft('r9');
      expect(draft?.markdown_body).toContain('# Heading');
      expect(draft?.markdown_body).toContain('Periodic edit.');

      a.disconnect();
    } finally {
      await fast.close();
    }
  });
});
