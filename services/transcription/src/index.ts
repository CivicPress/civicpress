/**
 * @civicpress/transcription — the optional BroadcastBox W2 transcription worker.
 *
 * Public surface: the worker, the engine/gateway contracts, and the noop engine.
 * Real adapters (whisper.cpp engine, a RecordsGateway over @civicpress/core) and
 * the `civic start` launcher are added in the wiring step.
 */

export { TranscriptionWorker, computePublicRanges } from './worker.js';
export type { WorkerOptions } from './worker.js';
export { NoopEngine } from './engines/noop.js';
export type {
  AudioRef,
  CaptureSegment,
  Logger,
  RecordsGateway,
  RunSummary,
  SessionCapture,
  SessionForTranscription,
  TimeRange,
  TranscriptionEngine,
  TranscriptResult,
  TranscriptSegment,
  TranscriptStatus,
  Visibility,
} from './types.js';
