/**
 * Build the configured transcription engine. Falls back to the {@link NoopEngine}
 * (always idle) whenever the engine isn't fully configured, so a partial or
 * malformed config degrades gracefully instead of throwing at startup.
 */

import type { Logger, TranscriptionEngine } from '../types.js';
import type { TranscriptionConfig } from '../config.js';
import { NoopEngine } from './noop.js';
import { WhisperCppEngine } from './whisper-cpp.js';

export function createEngine(
  config: TranscriptionConfig,
  logger?: Logger
): TranscriptionEngine {
  if (config.engine === 'whisper-cpp' && config.whisperCpp) {
    return new WhisperCppEngine({
      binary: config.whisperCpp.binary,
      model: config.whisperCpp.model,
      threads: config.whisperCpp.threads,
      language: config.language,
      logger,
    });
  }
  return new NoopEngine();
}
