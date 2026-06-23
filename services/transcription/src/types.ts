/**
 * CivicPress transcription worker (BroadcastBox W2) — contracts.
 *
 * The worker logic depends only on these interfaces, so it is pure and testable
 * with fakes. The real adapters (a RecordsGateway over @civicpress/core's
 * RecordManager + storage; a whisper.cpp TranscriptionEngine) are wired
 * separately when the worker is launched by `civic start`.
 *
 * Design: docs/specs/2026-06-20-transcription-service-design.md
 */

export type Visibility = 'public' | 'in_camera';

/** Public trust label on the transcript (broadcast-box session schema extension). */
export type TranscriptStatus = 'automated' | 'reviewed';

export interface TimeRange {
  start: number;
  end: number;
}

export interface CaptureSegment extends TimeRange {
  visibility: Visibility;
}

/** The capture provenance block contributed by the broadcast-box module. */
export interface SessionCapture {
  device?: string;
  /** Storage UUID of the recorded A/V (an attached_files[] entry). */
  av_file?: string;
  duration_s?: number;
  segments?: CaptureSegment[];
}

/** The slice of a `session` record the worker cares about. */
export interface SessionForTranscription {
  id: string;
  /** Session-level visibility; an in_camera session is never transcribed. */
  visibility?: Visibility;
  capture?: SessionCapture;
  transcript_status?: TranscriptStatus;
}

export interface TranscriptSegment extends TimeRange {
  text: string;
  speaker?: string;
}

export interface TranscriptResult {
  language: string;
  text: string;
  segments: TranscriptSegment[];
}

/** A handle to fetched A/V the engine can read (e.g. a local file path). */
export interface AudioRef {
  path: string;
}

/**
 * Pluggable transcription backend (whisper.cpp default; http / noop others).
 * Engine-agnostic; selected by config.
 */
export interface TranscriptionEngine {
  readonly name: string;
  /** Health/precondition probe; false → the worker stays idle (A/V still public). */
  available(): Promise<boolean>;
  transcribe(input: {
    audio: AudioRef;
    language?: string;
    /**
     * Public time ranges to transcribe. `null` = the whole recording is public
     * (no segments declared). A non-empty list excludes in-camera segments.
     */
    publicRanges: TimeRange[] | null;
  }): Promise<TranscriptResult>;
}

/**
 * The worker's view of the records API (validation + Git + audit live behind it,
 * never the DB directly). Implemented for real over @civicpress/core; faked in
 * tests.
 */
export interface RecordsGateway {
  /** Derived scan: sessions with `capture.av_file` present and no `transcript_status`. */
  findNeedingTranscription(): Promise<SessionForTranscription[]>;
  /** Re-fetch a single session (used by the re-read-before-write idempotency guard). */
  getSession(id: string): Promise<SessionForTranscription | null>;
  /** Fetch the session's A/V into a local handle the engine can read. */
  prepareAudio(session: SessionForTranscription): Promise<AudioRef>;
  /** Atomic write-back: `media.transcript` + `transcript_status` in one records-API update. */
  writeTranscript(
    id: string,
    payload: { transcript: TranscriptResult; status: 'automated' }
  ): Promise<void>;
}

export interface Logger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  debug(message: string, meta?: Record<string, unknown>): void;
}

export interface RunSummary {
  processed: number;
  skipped: number;
  failed: number;
}
