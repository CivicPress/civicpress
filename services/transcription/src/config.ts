/**
 * Transcription service configuration (BroadcastBox W2).
 *
 * The optional worker is launched by `civic start` ONLY when `enabled` and the
 * selected engine reports `available()` (graceful degradation — the A/V is
 * public regardless). This block is the contract the launcher + the engine
 * factory read; it is intentionally small for the transcript-only MVP.
 *
 * Example `data/.civic/config.yml`:
 *
 *   transcription:
 *     enabled: true
 *     engine: whisper-cpp
 *     language: fr-CA
 *     poll_interval_ms: 30000
 *     whisper_cpp:
 *       binary: /opt/whisper.cpp/build/bin/whisper-cli
 *       model: /opt/whisper.cpp/models/ggml-small.bin
 *       threads: 4
 *
 * Design: docs/specs/2026-06-20-transcription-service-design.md §5.
 */

/** Engine selector. `noop` = always idle (default; A/V still public). */
export type EngineKind = 'whisper-cpp' | 'noop';

export interface WhisperCppConfig {
  /** Path to the whisper.cpp CLI binary (`whisper-cli`). */
  binary: string;
  /** Path to the ggml model file (default model class = `small`, fr-CA accuracy). */
  model: string;
  /** Threads for whisper (omit → whisper's own default). */
  threads?: number;
}

export interface TranscriptionConfig {
  /** Opt-in. The launcher starts the worker only when true (default off). */
  enabled: boolean;
  /** Engine selector (default `noop`). */
  engine: EngineKind;
  /** Language hint (BCP-47-ish; normalized per engine, e.g. `fr-CA` → `fr`). */
  language: string;
  /** Poll cadence when the worker runs as a loop. */
  pollIntervalMs: number;
  /** whisper.cpp settings (required when `engine === 'whisper-cpp'`). */
  whisperCpp?: WhisperCppConfig;
}

export const DEFAULT_TRANSCRIPTION_CONFIG: TranscriptionConfig = {
  enabled: false,
  engine: 'noop',
  language: 'fr-CA',
  pollIntervalMs: 30_000,
};

/**
 * Normalize a raw config object (e.g. parsed from `config.yml`, snake_case) into
 * a {@link TranscriptionConfig}, filling defaults. Tolerant of missing/extra
 * keys so a partial block degrades to the safe default (disabled, noop).
 */
export function normalizeTranscriptionConfig(
  raw: Record<string, unknown> | undefined | null
): TranscriptionConfig {
  const r = raw ?? {};
  const whisperRaw = (r.whisper_cpp ?? r.whisperCpp) as
    | Record<string, unknown>
    | undefined;

  const engine: EngineKind = r.engine === 'whisper-cpp' ? 'whisper-cpp' : 'noop';
  const pollRaw = r.poll_interval_ms ?? r.pollIntervalMs;

  const config: TranscriptionConfig = {
    enabled: r.enabled === true,
    engine,
    language:
      typeof r.language === 'string' && r.language.length > 0
        ? r.language
        : DEFAULT_TRANSCRIPTION_CONFIG.language,
    pollIntervalMs:
      typeof pollRaw === 'number'
        ? pollRaw
        : DEFAULT_TRANSCRIPTION_CONFIG.pollIntervalMs,
  };

  if (
    whisperRaw &&
    typeof whisperRaw.binary === 'string' &&
    typeof whisperRaw.model === 'string'
  ) {
    config.whisperCpp = {
      binary: whisperRaw.binary,
      model: whisperRaw.model,
      ...(typeof whisperRaw.threads === 'number'
        ? { threads: whisperRaw.threads }
        : {}),
    };
  }

  return config;
}
