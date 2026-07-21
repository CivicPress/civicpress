/**
 * RecordsGateway over @civicpress/core's RecordManager + a UUID blob store.
 *
 * Built against NARROW structural interfaces (not a hard @civicpress/core import)
 * so the worker package stays decoupled and unit-testable with fakes — the real
 * RecordManager / CloudUuidStorageService satisfy these shapes at wiring time.
 *
 * Write path (pinned 2026-06-25 against the real merged `session` schema):
 *   - `transcript_status` is a broadcast-box extension field → written TOP-LEVEL
 *     by the core serializer (fix 41adfb1) when broadcast-box is enabled.
 *   - core `session.media.transcript` is typed STRING (a path/URL), so the
 *     structured TranscriptResult CANNOT go there (the update saga's validator
 *     rejects an object). It is written to `media.transcript_data` instead
 *     (validates via media's additionalProperties; serializes top-level under
 *     `media`). See docs/specs/2026-06-20-transcription-service-design.md §10.5.
 *
 * Design: docs/specs/2026-06-20-transcription-service-design.md §10.2 step 3.
 */

import { createWriteStream } from 'node:fs';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type {
  AgendaItem,
  AudioRef,
  DraftTopic,
  Logger,
  RecordsGateway,
  SessionCapture,
  SessionForTranscription,
  TranscriptResult,
  TranscriptStatus,
  Visibility,
} from '../types.js';
import { renderVtt } from '../vtt.js';

/** A parsed core record (only the fields this gateway reads). */
export interface CoreRecord {
  id: string;
  metadata?: Record<string, unknown> | null;
  // After parse, extension/known fields may also surface top-level.
  [key: string]: unknown;
}

/**
 * One row as `RecordManager.listRecords` actually returns it: the raw `records`
 * table row, whose `metadata` column is the record's frontmatter serialized to
 * JSON (so it carries `transcript_status` — see findNeedingTranscription).
 */
export interface ScannedRecordRow {
  id: string;
  metadata?: string | Record<string, unknown> | null;
}

/** The slice of @civicpress/core's RecordManager this gateway needs. */
export interface RecordStore {
  listRecords(options: {
    type?: string;
    limit?: number | 'all';
    offset?: number;
  }): Promise<{ records: ScannedRecordRow[] }>;
  getRecord(id: string): Promise<CoreRecord | null>;
  updateRecord(
    id: string,
    request: { metadata?: Record<string, unknown> },
    user: CoreUser
  ): Promise<unknown>;
}

/**
 * A multer-style file — the shape `CloudUuidStorageService.uploadFile` requires
 * (it validates by the `originalname` extension and explicitly rejects raw
 * Buffers). We mirror the full shape here so the real service stays structurally
 * assignable to `BlobStore` without this package depending on `@civicpress/storage`.
 */
export interface UploadArtifactFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  destination: string;
  filename: string;
  path: string;
  buffer: Buffer;
}

/** The slice of @civicpress/storage's CloudUuidStorageService this gateway needs. */
export interface BlobStore {
  getFileContent(id: string): Promise<Buffer | null>;
  /**
   * Preferred A/V fetch: a byte stream straight from the provider. Matches
   * CloudUuidStorageService.downloadFileStream. Optional so a small fake (and
   * any store without a streaming path) still works via getFileContent.
   */
  downloadFileStream?(id: string): Promise<NodeJS.ReadableStream | null>;
  /**
   * Store the rendered transcript artifact. Optional: when absent (or it fails),
   * the worker still writes `media.transcript_data` and just skips the
   * `media.transcript` path. Matches CloudUuidStorageService.uploadFile.
   */
  uploadFile?(request: {
    file: UploadArtifactFile;
    folder: string;
    description?: string;
    uploaded_by?: string;
  }): Promise<{ success: boolean; file?: { id: string }; error?: string }>;
}

/** The service AuthUser shape (matches SessionController's system actor). */
export interface CoreUser {
  id: number;
  username: string;
  role: string;
}

const SYSTEM_USER: CoreUser = { id: 1, username: 'system', role: 'admin' };

/**
 * `transcript_status` as carried by a listRecords ROW, or undefined when the
 * row has no readable metadata. Undefined means "unknown", NOT "not
 * transcribed" — see findNeedingTranscription.
 */
function rowTranscriptStatus(row: ScannedRecordRow): string | undefined {
  let meta: unknown = row.metadata;
  if (typeof meta === 'string') {
    try {
      meta = JSON.parse(meta);
    } catch {
      return undefined;
    }
  }
  const status = (meta as Record<string, unknown> | null | undefined)
    ?.transcript_status;
  return typeof status === 'string' ? status : undefined;
}

export interface CoreRecordsGatewayOptions {
  records: RecordStore;
  storage: BlobStore;
  /** Actor for the write-back (default the system admin). */
  user?: CoreUser;
  logger?: Logger;
}

/** Read a field that may live under `metadata` or be lifted to top-level. */
function field<T>(record: CoreRecord, key: string): T | undefined {
  const meta = record.metadata as Record<string, unknown> | undefined | null;
  return (meta?.[key] ?? record[key]) as T | undefined;
}

function toSession(record: CoreRecord): SessionForTranscription {
  return {
    id: record.id,
    visibility: field<Visibility>(record, 'visibility'),
    capture: field<SessionCapture>(record, 'capture'),
    transcript_status: field<TranscriptStatus>(record, 'transcript_status'),
  };
}

/**
 * The linked `meeting` record id on a session — `linkedRecords` may be a parsed
 * array (published) or a JSON string (draft).
 */
function linkedMeetingId(record: CoreRecord): string | null {
  let raw: unknown =
    field<unknown>(record, 'linkedRecords') ??
    field<unknown>(record, 'linked_records');
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(raw)) return null;
  const meeting = raw.find(
    (l) =>
      l &&
      typeof l === 'object' &&
      (l as { type?: unknown }).type === 'meeting' &&
      (l as { id?: unknown }).id
  );
  return meeting ? String((meeting as { id: unknown }).id) : null;
}

/** Normalize a meeting's `agenda` field into AgendaItem[] (tolerates strings + a JSON-string). */
function normalizeAgenda(raw: unknown): AgendaItem[] {
  let val = raw;
  if (typeof val === 'string') {
    try {
      val = JSON.parse(val);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(val)) return [];
  const items: AgendaItem[] = [];
  for (const it of val) {
    if (typeof it === 'string' && it.trim()) {
      items.push({ title: it.trim() });
    } else if (
      it &&
      typeof it === 'object' &&
      typeof (it as { title?: unknown }).title === 'string'
    ) {
      const title = ((it as { title: string }).title || '').trim();
      const description = (it as { description?: unknown }).description;
      if (title) {
        items.push({
          title,
          description:
            typeof description === 'string' ? description : undefined,
        });
      }
    }
  }
  return items;
}

export class CoreRecordsGateway implements RecordsGateway {
  private readonly user: CoreUser;

  constructor(private readonly opts: CoreRecordsGatewayOptions) {
    this.user = opts.user ?? SYSTEM_USER;
  }

  /**
   * Derived scan: enumerate `session` records, then read each authoritatively
   * (parsed frontmatter) and keep those READY for transcription — `capture.av_file`
   * present, `capture.segments` present, and no `transcript_status`.
   *
   * The `segments` requirement is the manifest-applied gate (civic-critical):
   * `capture.av_file` is written by the upload finalize, but the visibility
   * `capture.segments` arrive separately via the device `session.manifest`. The
   * two RACE, so triggering on `av_file` alone lets the worker transcribe a
   * recording before its in-camera windows are known — leaking closed-session
   * audio. `segments` is only ever written by the manifest; waiting for it (or
   * an explicit `all_public` attestation) is the safe contract. NB an empty
   * `[]` is UNKNOWN, not all-public — the worker HOLDS on it (FA-BB-002).
   */
  async findNeedingTranscription(): Promise<SessionForTranscription[]> {
    const out: SessionForTranscription[] = [];
    for (const row of await this.scanSessionRows()) {
      // Cheap scope first: a row that POSITIVELY reports a transcript_status is
      // already transcribed and can be dropped without the getSession() below,
      // which costs a DB read plus a markdown read + YAML parse per session on
      // every poll cycle. Absence is "unknown", not "not transcribed" — an
      // un-indexed row still gets the authoritative read (the markdown file is
      // the source of truth), so this can only ever skip real work, never
      // invent it.
      if (rowTranscriptStatus(row)) continue;
      const session = await this.getSession(row.id);
      if (
        session?.capture?.av_file &&
        (session.capture.segments !== undefined ||
          session.capture.all_public === true) &&
        !session.transcript_status
      ) {
        out.push(session);
      }
    }
    return out;
  }

  /**
   * Every `session` row. `limit: 'all'` is load-bearing: core's listRecords
   * used to append a silent `LIMIT 10`, so the unpaginated scan this replaces
   * only ever saw the 10 most recent sessions — past the tenth recording an
   * older un-transcribed session was never picked up again. The hand-rolled
   * offset paging that first fixed that is gone: the store now answers "all"
   * in one query, which also drops the page-edge race it carried (offset
   * paging over a non-unique sort can shift a row across an edge under a
   * concurrent insert).
   */
  private async scanSessionRows(): Promise<ScannedRecordRow[]> {
    const { records } = await this.opts.records.listRecords({
      type: 'session',
      limit: 'all',
    });
    return records;
  }

  async getSession(id: string): Promise<SessionForTranscription | null> {
    const record = await this.opts.records.getRecord(id);
    return record ? toSession(record) : null;
  }

  /**
   * Resolve the structured agenda for a session — from its linked `meeting` record
   * (the core session schema only carries `media.agenda` as a path). Best-effort:
   * no link / no meeting / no agenda → [], and the worker derives no topics.
   */
  async getAgenda(session: SessionForTranscription): Promise<AgendaItem[]> {
    const record = await this.opts.records.getRecord(session.id);
    if (!record) return [];
    const meetingId = linkedMeetingId(record);
    if (!meetingId) return [];
    const meeting = await this.opts.records.getRecord(meetingId);
    if (!meeting) return [];
    return normalizeAgenda(field<unknown>(meeting, 'agenda'));
  }

  /**
   * Fetch the A/V blob to a temp file the engine can decode.
   *
   * STREAMED, not buffered: the payload here is a full council-meeting
   * recording (single-digit GB is normal, the upload cap is 16 GiB). The
   * previous `getFileContent()` materialized the whole container as one Buffer
   * before writing it, which pins that much RSS per in-flight session and hard-
   * fails past Node's ~2 GiB max Buffer length — a long meeting could not be
   * transcribed at all. `getFileContent` is kept only as the fallback for a
   * store with no streaming path (small fakes, tests).
   */
  async prepareAudio(session: SessionForTranscription): Promise<AudioRef> {
    const uuid = session.capture?.av_file;
    if (!uuid) {
      throw new Error(`session ${session.id} has no capture.av_file`);
    }
    const { storage } = this.opts;
    const dir = await mkdtemp(join(tmpdir(), 'transcribe-av-'));
    // FA-BB-013: `uuid` is capture.av_file — a device-controlled value. Reduce
    // it to a bare basename so a traversal-laden id (e.g. `../../etc/x`) can
    // never steer the temp WRITE out of the freshly-created temp dir. (The
    // fetch below already resolves it as a storage file id, but the write path
    // is defended independently.)
    const path = join(dir, basename(uuid)); // raw container; the engine decodes to WAV

    if (storage.downloadFileStream) {
      const stream = await storage.downloadFileStream(uuid);
      if (!stream) {
        throw new Error(
          `A/V ${uuid} for session ${session.id} not found in storage`
        );
      }
      // pipeline() destroys both ends on failure, so a mid-transfer provider
      // error can't leak an open handle or leave a silently truncated file
      // that the engine would happily transcribe as a short meeting.
      await pipeline(stream, createWriteStream(path));
      return { path };
    }

    const buffer = await storage.getFileContent(uuid);
    if (!buffer) {
      throw new Error(
        `A/V ${uuid} for session ${session.id} not found in storage`
      );
    }
    await writeFile(path, buffer);
    return { path };
  }

  /**
   * Atomic write-back: set `transcript_status` (the idempotency latch) and the
   * structured transcript under `media.transcript_data`, merged with any
   * existing `media` so other media fields are preserved.
   */
  async writeTranscript(
    id: string,
    payload: {
      transcript: TranscriptResult;
      status: 'automated';
      topics?: DraftTopic[];
    }
  ): Promise<void> {
    const record = await this.opts.records.getRecord(id);
    const existingMedia =
      (field<Record<string, unknown>>(record ?? { id }, 'media') as
        | Record<string, unknown>
        | undefined) ?? {};

    const media: Record<string, unknown> = {
      ...existingMedia,
      transcript_data: payload.transcript,
    };

    // Best-effort: render + store the WebVTT artifact and point
    // `media.transcript` (string-typed) at it. A storage gap never blocks the
    // write-back — `transcript_data` still lands.
    const artifactPath = await this.storeTranscriptArtifact(
      id,
      payload.transcript
    );
    if (artifactPath) media.transcript = artifactPath;

    const metadata: Record<string, unknown> = {
      transcript_status: payload.status,
      media,
    };
    // Draft structured minutes (bb-002): write the derived topics + flag the
    // minutes as a draft for clerk review. Empty/absent topics leave them untouched.
    if (payload.topics && payload.topics.length > 0) {
      metadata.topics = payload.topics;
      metadata.minutes_status = 'draft';
    }

    await this.opts.records.updateRecord(id, { metadata }, this.user);
  }

  /**
   * Render the transcript to WebVTT, store it via the storage service, and
   * return its `/api/v1/storage/files/<uuid>` path — or null if storage can't
   * take it (no uploadFile, upload failure, or a render/store error). Never
   * throws: the transcript_data write must still proceed.
   */
  private async storeTranscriptArtifact(
    id: string,
    transcript: TranscriptResult
  ): Promise<string | null> {
    if (!this.opts.storage.uploadFile) return null;
    try {
      const vtt = renderVtt(transcript);
      const buffer = Buffer.from(vtt, 'utf-8');
      // CloudUuidStorageService validates by the originalname extension and
      // rejects raw Buffers, so pass a multer-style `.vtt` file (an extension the
      // `transcripts` folder allows).
      const res = await this.opts.storage.uploadFile({
        file: {
          fieldname: 'file',
          originalname: 'transcript.vtt',
          encoding: '7bit',
          mimetype: 'text/vtt',
          size: buffer.length,
          destination: '',
          filename: '',
          path: '',
          buffer,
        },
        folder: 'transcripts',
        description: `Transcript for session ${id}`,
        uploaded_by: this.user.username,
      });
      if (res.success && res.file) {
        return `/api/v1/storage/files/${res.file.id}`;
      }
      this.opts.logger?.warn(
        'transcript artifact upload failed — wrote transcript_data only',
        { id, error: res.error }
      );
    } catch (error) {
      this.opts.logger?.warn(
        'transcript artifact render/store threw — wrote transcript_data only',
        { id, error: error instanceof Error ? error.message : String(error) }
      );
    }
    return null;
  }
}
