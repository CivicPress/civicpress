/**
 * Round-trip idempotency for RecordParser (serialize <-> parse).
 *
 * Regression for a corruption that broke the BroadcastBox redaction pipeline:
 * `buildFrontmatter` nests non-top-level metadata fields under `metadata:`, but
 * `parseFromMarkdown` did NOT perform the inverse — a top-level `metadata:`
 * frontmatter block was carried back as a literal `metadata` KEY inside
 * `record.metadata` (i.e. `record.metadata.metadata`) instead of having its
 * contents spread back in.
 *
 * Consequences observed on a live instance:
 *   1. Every serialize -> parse -> serialize cycle added one more `metadata:`
 *      nesting level (`metadata.metadata.metadata...`).
 *   2. Because each write read `record.metadata?.capture` (which the nesting had
 *      moved to `record.metadata.metadata.capture`), a subsequent capture merge
 *      saw NO existing capture, wrote a fresh one a level up, and the object
 *      SPLIT across two depths. The redaction worker reads `metadata.capture`
 *      and never saw the half carrying `redaction_status: pending` -> the
 *      session was stuck at `pending` and never published.
 *
 * The contract these tests pin: a field placed in `record.metadata` survives a
 * serialize/parse round-trip AT THE SAME PLACE, and repeated read-merge-write
 * cycles keep a single, complete object.
 */

import { describe, it, expect } from 'vitest';
import { RecordParser } from '../record-parser.js';
import type { RecordData } from '../record-manager.js';

const baseRecord = (metadata: Record<string, unknown>): RecordData =>
  ({
    id: 'record-test-1',
    title: 'Demo Council Meeting',
    type: 'session',
    status: 'draft',
    content: '# Body',
    author: 'admin',
    created_at: '2026-08-05T18:22:44.965Z',
    updated_at: '2026-08-05T18:22:44.965Z',
    metadata,
  }) as RecordData;

describe('RecordParser round-trip idempotency', () => {
  it('a metadata field round-trips to the SAME place (not nested under metadata.metadata)', () => {
    const capture = {
      device: 'device-uuid',
      av_file: 'av-uuid',
      redaction_status: 'pending',
      segments: [] as unknown[],
    };
    const record = baseRecord({ capture });

    const md1 = RecordParser.serializeToMarkdown(record);
    const parsed1 = RecordParser.parseFromMarkdown(md1);

    // The field is where the writer put it — accessible as metadata.capture.
    expect(parsed1.metadata?.capture).toEqual(capture);
    // ...and NOT smuggled a level deeper.
    expect(
      (parsed1.metadata as Record<string, unknown>)?.metadata
    ).toBeUndefined();
  });

  it('serialize -> parse -> serialize is stable (no growing metadata nesting)', () => {
    const record = baseRecord({
      capture: { av_file: 'x', redaction_status: 'pending' },
    });

    const md1 = RecordParser.serializeToMarkdown(record);
    const md2 = RecordParser.serializeToMarkdown(
      RecordParser.parseFromMarkdown(md1)
    );
    const md3 = RecordParser.serializeToMarkdown(
      RecordParser.parseFromMarkdown(md2)
    );

    // Idempotent: the second and third serializations are identical to the
    // first. (Before the fix each cycle appended another `metadata:` level.)
    expect(md2).toEqual(md1);
    expect(md3).toEqual(md1);
  });

  it('repeated capture merges keep a single, complete capture (no split or loss)', () => {
    // Mirrors RecordManager.mergeCapture + the file round-trip that each
    // BroadcastBox write performs: read metadata.capture, merge a partial,
    // write it back, serialize to disk, parse on the next update.
    const mergeAndRoundTrip = (
      rec: RecordData,
      partial: Record<string, unknown>
    ): RecordData => {
      const existing = (rec.metadata?.capture ?? {}) as Record<string, unknown>;
      const merged = { ...existing, ...partial };
      const updated = {
        ...rec,
        metadata: { ...rec.metadata, capture: merged },
      } as RecordData;
      return RecordParser.parseFromMarkdown(
        RecordParser.serializeToMarkdown(updated)
      );
    };

    let record = baseRecord({});
    // write 1 — applySessionManifest (device + segments)
    record = mergeAndRoundTrip(record, { device: 'dev-uuid', segments: [] });
    // write 2 — linkFileToSession (av_file + redaction_status)
    record = mergeAndRoundTrip(record, {
      av_file: 'av-uuid',
      redaction_status: 'pending',
    });
    // write 3 — a later manifest (duration)
    record = mergeAndRoundTrip(record, { duration_s: 58 });

    const cap = record.metadata?.capture as Record<string, unknown>;
    expect(cap).toBeDefined();
    // All three writes are present in ONE capture object.
    expect(cap.device).toBe('dev-uuid');
    expect(cap.av_file).toBe('av-uuid');
    expect(cap.redaction_status).toBe('pending');
    expect(cap.duration_s).toBe(58);
    // No second capture hiding a level down, no runaway nesting.
    expect(
      (record.metadata as Record<string, unknown>)?.metadata
    ).toBeUndefined();
  });
});
