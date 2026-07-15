/**
 * normalizeTranscriptionConfig — tolerant parse of the `transcription:` block.
 */

import { describe, it, expect } from 'vitest';
import {
  normalizeTranscriptionConfig,
  DEFAULT_TRANSCRIPTION_CONFIG,
} from '../config.js';

describe('normalizeTranscriptionConfig', () => {
  it('returns the safe default for missing/empty input', () => {
    expect(normalizeTranscriptionConfig(undefined)).toEqual(
      DEFAULT_TRANSCRIPTION_CONFIG
    );
    expect(normalizeTranscriptionConfig({})).toEqual(
      DEFAULT_TRANSCRIPTION_CONFIG
    );
  });

  it('parses a full whisper-cpp block (snake_case from YAML)', () => {
    const config = normalizeTranscriptionConfig({
      enabled: true,
      engine: 'whisper-cpp',
      language: 'fr-CA',
      poll_interval_ms: 15000,
      whisper_cpp: {
        binary: '/opt/whisper/whisper-cli',
        model: '/opt/whisper/ggml-small.bin',
        threads: 4,
      },
    });
    expect(config).toEqual({
      enabled: true,
      engine: 'whisper-cpp',
      language: 'fr-CA',
      pollIntervalMs: 15000,
      leadPadS: 3,
      trailPadS: 5,
      whisperCpp: {
        binary: '/opt/whisper/whisper-cli',
        model: '/opt/whisper/ggml-small.bin',
        threads: 4,
      },
    });
  });

  it('parses the visibility skew pads (snake_case from YAML)', () => {
    const config = normalizeTranscriptionConfig({
      visibility_pad_lead_s: 1,
      visibility_pad_trail_s: 2,
    });
    expect(config.leadPadS).toBe(1);
    expect(config.trailPadS).toBe(2);
  });

  it('drops an incomplete whisper_cpp block (missing model) → no engine config', () => {
    const config = normalizeTranscriptionConfig({
      engine: 'whisper-cpp',
      whisper_cpp: { binary: '/opt/whisper/whisper-cli' },
    });
    expect(config.whisperCpp).toBeUndefined();
  });

  it('falls back to noop for an unknown engine', () => {
    expect(normalizeTranscriptionConfig({ engine: 'magic' }).engine).toBe(
      'noop'
    );
  });

  it('keeps enabled strictly boolean (truthy strings do not enable)', () => {
    expect(normalizeTranscriptionConfig({ enabled: 'yes' }).enabled).toBe(false);
  });
});
