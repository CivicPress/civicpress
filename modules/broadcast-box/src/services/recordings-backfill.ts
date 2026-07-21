/**
 * FA-BB-002 Commit F — backfill: re-home pre-redaction raw recordings.
 *
 * Before the redaction pipeline (Commits B/C), device uploads landed directly
 * in the PUBLIC `recordings` folder and were attached to their session
 * records — i.e. raw, possibly in-camera-bearing originals are publicly
 * served today. This backfill moves every such file into the private
 * `recordings_raw` folder and re-latches its session to
 * `redaction_status: 'pending'`, so the redaction worker re-publishes a
 * verified blanked variant. The origin/main unfreeze gates on this.
 *
 * A file in `recordings` is kept ONLY if it is some session's
 * `capture.public_file` — i.e. it was published by the redaction worker after
 * verification. Everything else (raw av_file refs AND orphans) is treated as
 * an unverified raw: fail-closed.
 *
 * Safety order per file: copy to recordings_raw → verify the copy exists →
 * update the record (capture + strip stale public attachments) → delete the
 * public object. A failure before the delete leaves the public file in place
 * (reported loudly) — bytes are never lost.
 */

import { createReadStream } from 'node:fs';
import * as fs from 'node:fs/promises';
import type { Logger } from '@civicpress/core';

const SYSTEM_USER = { id: 1, username: 'system', role: 'admin' };

export interface BackfillRecordStore {
  listRecords(options: {
    type?: string;
    limit?: number | 'all';
    offset?: number;
  }): Promise<{ records: Array<{ id: string }> }>;
  getRecord(id: string): Promise<Record<string, any> | null>;
  updateRecord(
    id: string,
    request: Record<string, unknown>,
    user: Record<string, unknown>
  ): Promise<unknown>;
  mergeCapture(
    id: string,
    partialCapture: Record<string, unknown>,
    user: Record<string, unknown>,
    options?: Record<string, unknown>
  ): Promise<Record<string, unknown> | null>;
}

export interface BackfillBlobStore {
  listFiles(folder: string): Promise<
    Array<{
      id: string;
      folder: string;
      original_name: string;
      provider_path: string;
      size: number;
      mime_type: string;
    }>
  >;
  getFileById(id: string): Promise<{ id: string } | null>;
  uploadFileStream(request: {
    stream: NodeJS.ReadableStream;
    filename: string;
    folder: string;
    size: number;
    contentType?: string;
    description?: string;
    uploaded_by?: string;
  }): Promise<{ success: boolean; file?: { id: string }; error?: string }>;
  deleteFile(id: string, userId?: string): Promise<boolean>;
}

export interface BackfillSummary {
  /** Raw files moved to recordings_raw (session-referenced + orphans). */
  moved: number;
  /** Worker-published redacted variants left in place. */
  keptRedacted: number;
  /** Files that could not be moved (public object left in place). */
  errors: number;
  /** Per-file detail for the operator. */
  details: Array<{
    oldId: string;
    newId?: string;
    recordId?: string;
    outcome: 'moved' | 'kept-redacted' | 'error';
    error?: string;
  }>;
}

export async function backfillPublicRaws(opts: {
  records: BackfillRecordStore;
  storage: BackfillBlobStore;
  logger: Logger;
}): Promise<BackfillSummary> {
  const { records, storage, logger } = opts;
  const summary: BackfillSummary = {
    moved: 0,
    keptRedacted: 0,
    errors: 0,
    details: [],
  };

  // Map every capture reference: av_file → record, public_file → record.
  //
  // This map decides whether a file in the PUBLIC folder is a worker-verified
  // variant (kept) or an unverified raw (moved out + the public object
  // DELETED), so it must cover EVERY session. `limit: 'all'` is what makes
  // that true, and it is the whole reason the store's limit contract is
  // explicit: listRecords used to append a silent `LIMIT 10`, which mapped
  // only the 10 newest sessions and would have re-homed — and deleted the
  // published copy of — a verified variant belonging to any older one. A short
  // read here is indistinguishable from "this file belongs to no session",
  // which is precisely the input that makes this loop delete public bytes, so
  // an oversized corpus must throw rather than truncate.
  const avFileToRecord = new Map<string, string>();
  const publicFileIds = new Set<string>();
  const { records: sessionIds } = await records.listRecords({
    type: 'session',
    limit: 'all',
  });
  for (const { id } of sessionIds) {
    const rec = await records.getRecord(id);
    if (!rec) continue;
    const capture = rec.metadata?.capture ?? rec.capture ?? {};
    if (capture.av_file) avFileToRecord.set(String(capture.av_file), id);
    if (capture.public_file) publicFileIds.add(String(capture.public_file));
  }

  const publicFiles = await storage.listFiles('recordings');
  logger.info('backfill: scanning public recordings folder', {
    operation: 'broadcast-box:backfill:scan',
    files: publicFiles.length,
    sessions: sessionIds.length,
  });

  for (const file of publicFiles) {
    // Worker-published redacted variant — the only legitimate resident.
    if (publicFileIds.has(file.id)) {
      summary.keptRedacted++;
      summary.details.push({ oldId: file.id, outcome: 'kept-redacted' });
      continue;
    }

    const recordId = avFileToRecord.get(file.id);
    try {
      // 1. Copy the bytes into the private folder (stream — never a Buffer).
      await fs.access(file.provider_path);
      const uploaded = await storage.uploadFileStream({
        stream: createReadStream(file.provider_path),
        filename: file.original_name,
        folder: 'recordings_raw',
        size: file.size,
        contentType: file.mime_type,
        description: `Backfilled raw original (was public ${file.id})`,
        uploaded_by: 'system',
      });
      if (!uploaded.success || !uploaded.file) {
        throw new Error(uploaded.error ?? 'upload to recordings_raw failed');
      }
      const newId = uploaded.file.id;

      // 2. Verify the private copy is really there before touching anything.
      if (!(await storage.getFileById(newId))) {
        throw new Error(`private copy ${newId} not retrievable`);
      }

      // 3. Re-point the session record (if one references this raw).
      if (recordId) {
        await records.mergeCapture(
          recordId,
          { av_file: newId, redaction_status: 'pending' },
          SYSTEM_USER
        );
        // Strip the pre-redaction public attachment(s) at the old raw — the
        // worker re-attaches the verified public variant after redaction.
        const rec = await records.getRecord(recordId);
        const attached: any[] = rec?.attachedFiles ?? [];
        if (attached.some((f) => f?.id === file.id)) {
          await records.updateRecord(
            recordId,
            { attachedFiles: attached.filter((f) => f?.id !== file.id) },
            SYSTEM_USER
          );
        }
      }

      // 4. Only now remove the public object.
      const deleted = await storage.deleteFile(file.id, 'system');
      if (!deleted) {
        // The record already points at the private copy; the stale public
        // object must go — report loudly for manual cleanup.
        throw new Error(
          `public object ${file.id} could not be deleted (record already re-pointed to ${newId})`
        );
      }

      summary.moved++;
      summary.details.push({
        oldId: file.id,
        newId,
        recordId,
        outcome: 'moved',
      });
      logger.info('backfill: raw re-homed to recordings_raw', {
        operation: 'broadcast-box:backfill:moved',
        oldId: file.id,
        newId,
        recordId: recordId ?? '(orphan)',
      });
    } catch (error) {
      summary.errors++;
      summary.details.push({
        oldId: file.id,
        recordId,
        outcome: 'error',
        error: error instanceof Error ? error.message : String(error),
      });
      logger.error('backfill: failed to re-home public raw — LEFT IN PLACE', {
        operation: 'broadcast-box:backfill:error',
        fileId: file.id,
        recordId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  logger.info('backfill complete', {
    operation: 'broadcast-box:backfill:done',
    ...summary,
    details: undefined,
  });
  return summary;
}
