/**
 * Snapshot → Markdown recovery tests (realtime-005, spec §3e / §6.3)
 *
 * The design contract: a snapshot is an EPHEMERAL merge-aid, the Markdown is the
 * canonical durable archive. So when the latest snapshot cannot be trusted —
 * sha256 mismatch (corruption) or a format_version newer than this build
 * understands (format skew) — `loadLatestVerified` returns null and the server
 * must fall back to re-seeding the room from the record's Markdown rather than
 * opening an empty document or applying a corrupt blob.
 *
 * That fallback lived in RealtimeServer.initializeRoom from the start but was
 * never tested end-to-end, so nothing pinned it: the snapshot-first branch could
 * have been made unconditional (or the seed silently dropped) and every existing
 * test would still have passed. These tests drive the REAL path — real SQLite
 * rows corrupted in place, a real WebSocket connection triggering hydration —
 * and assert on the room's resulting document.
 *
 * The first test is the discriminator: it proves an intact snapshot DOES win, so
 * the recovery tests below cannot pass vacuously (e.g. if hydration were simply
 * always seeding from Markdown).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as Y from 'yjs';
import { createTestServer, type TestServerCtx } from './test-utils.js';
import { YjsRoom } from '../rooms/yjs-room.js';
import type { SnapshotManager } from '../persistence/snapshots.js';

/** Markdown the harness RecordManager serves — the canonical archive. */
const RECORD_MARKDOWN = '# Archived Heading\n\nRestored from Markdown.\n';
/** Text carried by the snapshot blob — distinguishable from the Markdown. */
const SNAPSHOT_TEXT = 'Hydrated from the snapshot blob.';

const ROOM_ID = 'records:r1';

/**
 * A VALID Yjs update populating the `default` XmlFragment (the field TipTap's
 * Collaboration extension replicates, and the one serializeToMarkdown reads).
 */
function makeSnapshotBlob(text: string): Uint8Array {
  const doc = new Y.Doc();
  const fragment = doc.getXmlFragment('default');
  const paragraph = new Y.XmlElement('paragraph');
  paragraph.insert(0, [new Y.XmlText(text)]);
  fragment.insert(0, [paragraph]);
  return Y.encodeStateAsUpdate(doc);
}

/**
 * Poll until the room exists and has hydrated content.
 *
 * Hydration is server-side and finishes after the client's `open` event
 * (setupYjsConnection awaits it before the initial SYNC handshake), so the test
 * cannot key off connect() alone.
 */
async function waitForHydratedRoom(
  ctx: TestServerCtx,
  roomId: string,
  timeoutMs = 5000
): Promise<YjsRoom> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const room = ctx.server.getRoomManager()?.getRoom(roomId);
    if (
      room instanceof YjsRoom &&
      room.serializeToMarkdown().trim().length > 0
    ) {
      return room;
    }
    if (Date.now() > deadline) {
      throw new Error(`room ${roomId} never hydrated`);
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 25));
  }
}

describe('snapshot recovery → Markdown fallback (realtime-005)', () => {
  let ctx: TestServerCtx;
  let snapshots: SnapshotManager;

  beforeEach(async () => {
    ctx = await createTestServer({
      snapshots: true,
      recordContent: RECORD_MARKDOWN,
    });
    const manager = ctx.server.getSnapshotManager();
    expect(manager).not.toBeNull();
    snapshots = manager!;
  });

  afterEach(async () => {
    await ctx.close();
  });

  it('hydrates from an INTACT snapshot (the discriminator)', async () => {
    await snapshots.persist({
      roomId: ROOM_ID,
      blob: makeSnapshotBlob(SNAPSHOT_TEXT),
    });
    // Sanity: the row really did land in the real DB.
    expect(await snapshots.loadLatestVerified(ROOM_ID)).not.toBeNull();

    await ctx.connect({
      token: ctx.makeToken({ userId: 'user-a' }),
      roomId: ROOM_ID,
    });
    const markdown = (await waitForHydratedRoom(ctx, ROOM_ID)).serializeToMarkdown();

    expect(markdown).toContain(SNAPSHOT_TEXT);
    expect(markdown).not.toContain('Archived Heading');
  });

  it('re-seeds from the record Markdown when the snapshot hash does not match', async () => {
    await snapshots.persist({
      roomId: ROOM_ID,
      blob: makeSnapshotBlob(SNAPSHOT_TEXT),
    });
    // Corrupt in place — exactly what a torn write / bit-rot looks like on load.
    await ctx.db!.query(
      `UPDATE realtime_snapshots SET integrity_hash = 'invalid' WHERE room_id = ?`,
      [ROOM_ID]
    );

    await ctx.connect({
      token: ctx.makeToken({ userId: 'user-a' }),
      roomId: ROOM_ID,
    });
    const markdown = (await waitForHydratedRoom(ctx, ROOM_ID)).serializeToMarkdown();

    expect(markdown).toContain('Archived Heading');
    expect(markdown).toContain('Restored from Markdown.');
    expect(markdown).not.toContain(SNAPSHOT_TEXT);
  });

  it('re-seeds from the record Markdown on format skew (newer format_version)', async () => {
    await snapshots.persist({
      roomId: ROOM_ID,
      blob: makeSnapshotBlob(SNAPSHOT_TEXT),
    });
    // A row written by a NEWER build: readable bytes, unreadable semantics.
    await ctx.db!.query(
      `UPDATE realtime_snapshots SET format_version = 99 WHERE room_id = ?`,
      [ROOM_ID]
    );

    await ctx.connect({
      token: ctx.makeToken({ userId: 'user-a' }),
      roomId: ROOM_ID,
    });
    const markdown = (await waitForHydratedRoom(ctx, ROOM_ID)).serializeToMarkdown();

    expect(markdown).toContain('Archived Heading');
    expect(markdown).not.toContain(SNAPSHOT_TEXT);
  });

  it('seeds from the record Markdown when no snapshot exists at all (t=0)', async () => {
    await ctx.connect({
      token: ctx.makeToken({ userId: 'user-a' }),
      roomId: ROOM_ID,
    });
    const markdown = (await waitForHydratedRoom(ctx, ROOM_ID)).serializeToMarkdown();

    expect(markdown).toContain('Archived Heading');
  });

  it('keeps the corrupt row readable for diagnosis (recovery is not deletion)', async () => {
    await snapshots.persist({
      roomId: ROOM_ID,
      blob: makeSnapshotBlob(SNAPSHOT_TEXT),
    });
    await ctx.db!.query(
      `UPDATE realtime_snapshots SET integrity_hash = 'invalid' WHERE room_id = ?`,
      [ROOM_ID]
    );

    await ctx.connect({
      token: ctx.makeToken({ userId: 'user-a' }),
      roomId: ROOM_ID,
    });
    await waitForHydratedRoom(ctx, ROOM_ID);

    // Verified load still refuses it; the raw row is still there for an operator.
    expect(await snapshots.loadLatestVerified(ROOM_ID)).toBeNull();
    expect(await snapshots.loadLatest(ROOM_ID)).not.toBeNull();
  });
});
