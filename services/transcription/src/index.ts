/**
 * @civicpress/transcription — the optional BroadcastBox W2 transcription worker.
 *
 * Public surface: the worker, the engine/gateway contracts, and the noop engine.
 * Real adapters (whisper.cpp engine, a RecordsGateway over @civicpress/core) and
 * the `civic start` launcher are added in the wiring step.
 */

export { TranscriptionWorker } from './worker.js';
export type { WorkerOptions } from './worker.js';
export {
  DEFAULT_LEAD_PAD_S,
  DEFAULT_TRAIL_PAD_S,
  mergeRanges,
  padRanges,
  resolveVisibility,
  subtractRanges,
} from './visibility.js';
export type { VisibilityDecision, VisibilityOptions } from './visibility.js';
export { NoopEngine } from './engines/noop.js';
export {
  WhisperCppEngine,
  toWhisperLanguage,
  mapWhisperJson,
} from './engines/whisper-cpp.js';
export type {
  WhisperCppEngineOptions,
  WhisperJson,
} from './engines/whisper-cpp.js';
export { createEngine } from './engines/factory.js';
export { renderVtt, formatTimestamp } from './vtt.js';
export { CoreRecordsGateway } from './gateways/core-records-gateway.js';
export type {
  BlobStore,
  CoreRecord,
  CoreRecordsGatewayOptions,
  CoreUser,
  RecordStore,
} from './gateways/core-records-gateway.js';
export {
  DEFAULT_TRANSCRIPTION_CONFIG,
  normalizeTranscriptionConfig,
} from './config.js';
export type {
  EngineKind,
  TranscriptionConfig,
  WhisperCppConfig,
} from './config.js';
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
