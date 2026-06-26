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

import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type {
  AudioRef,
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

/** The slice of @civicpress/core's RecordManager this gateway needs. */
export interface RecordStore {
  listRecords(options: {
    type?: string;
  }): Promise<{ records: Array<{ id: string }> }>;
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
   * audio. `segments` is only ever written by the manifest (an empty `[]` =
   * all-public still counts as ready); waiting for it is the safe contract.
   */
  async findNeedingTranscription(): Promise<SessionForTranscription[]> {
    const { records } = await this.opts.records.listRecords({
      type: 'session',
    });
    const out: SessionForTranscription[] = [];
    for (const row of records) {
      const session = await this.getSession(row.id);
      if (
        session?.capture?.av_file &&
        session.capture.segments !== undefined &&
        !session.transcript_status
      ) {
        out.push(session);
      }
    }
    return out;
  }

  async getSession(id: string): Promise<SessionForTranscription | null> {
    const record = await this.opts.records.getRecord(id);
    return record ? toSession(record) : null;
  }

  /** Fetch the A/V blob to a temp file the engine can decode. */
  async prepareAudio(session: SessionForTranscription): Promise<AudioRef> {
    const uuid = session.capture?.av_file;
    if (!uuid) {
      throw new Error(`session ${session.id} has no capture.av_file`);
    }
    const buffer = await this.opts.storage.getFileContent(uuid);
    if (!buffer) {
      throw new Error(
        `A/V ${uuid} for session ${session.id} not found in storage`
      );
    }
    const dir = await mkdtemp(join(tmpdir(), 'transcribe-av-'));
    const path = join(dir, uuid); // raw container; the engine decodes to WAV
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
    payload: { transcript: TranscriptResult; status: 'automated' }
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

    await this.opts.records.updateRecord(
      id,
      {
        metadata: {
          transcript_status: payload.status,
          media,
        },
      },
      this.user
    );
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
