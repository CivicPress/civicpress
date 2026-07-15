/**
 * WhisperCppEngine — pure mapping units + a real-binary integration test.
 *
 * The integration test is GATED on env pointing at a built whisper.cpp:
 *   WHISPER_CPP_BIN, WHISPER_CPP_MODEL, WHISPER_CPP_SAMPLE (a .wav)
 * (skipped otherwise, so the suite stays green on boxes without whisper).
 */

import { describe, it, expect } from 'vitest';
import {
  WhisperCppEngine,
  toWhisperLanguage,
  mapWhisperJson,
  type WhisperJson,
} from '../engines/whisper-cpp.js';

describe('toWhisperLanguage', () => {
  it('strips region subtags (whisper rejects them)', () => {
    expect(toWhisperLanguage('fr-CA')).toBe('fr');
    expect(toWhisperLanguage('en-US')).toBe('en');
    expect(toWhisperLanguage('FR_ca')).toBe('fr');
  });
  it('passes through a primary subtag', () => {
    expect(toWhisperLanguage('fr')).toBe('fr');
  });
  it('falls back to auto when empty/undefined', () => {
    expect(toWhisperLanguage(undefined)).toBe('auto');
    expect(toWhisperLanguage('')).toBe('auto');
  });
});

describe('mapWhisperJson', () => {
  const json: WhisperJson = {
    result: { language: 'fr' },
    transcription: [
      { offsets: { from: 0, to: 1200 }, text: ' Bonjour.' },
      { offsets: { from: 1200, to: 4000 }, text: ' Bienvenue au conseil.' },
      { offsets: { from: 4000, to: 4200 }, text: '   ' }, // blank → dropped
    ],
  };

  it('converts ms offsets to seconds', () => {
    const r = mapWhisperJson(json, 'fr-CA');
    expect(r.segments[0]).toEqual({ start: 0, end: 1.2, text: 'Bonjour.' });
    expect(r.segments[1].start).toBe(1.2);
    expect(r.segments[1].end).toBe(4);
  });
  it('drops blank segments and joins text', () => {
    const r = mapWhisperJson(json, 'fr-CA');
    expect(r.segments).toHaveLength(2);
    expect(r.text).toBe('Bonjour. Bienvenue au conseil.');
  });
  it('uses whisper result.language, else the fallback', () => {
    expect(mapWhisperJson(json, 'fr-CA').language).toBe('fr');
    expect(mapWhisperJson({ transcription: [] }, 'fr-CA').language).toBe('fr-CA');
  });
});

describe('WhisperCppEngine.available', () => {
  it('false when the binary/model are missing (graceful degradation)', async () => {
    const engine = new WhisperCppEngine({
      binary: '/nonexistent/whisper-cli',
      model: '/nonexistent/model.bin',
    });
    expect(await engine.available()).toBe(false);
  });
});

const BIN = process.env.WHISPER_CPP_BIN;
const MODEL = process.env.WHISPER_CPP_MODEL;
const SAMPLE = process.env.WHISPER_CPP_SAMPLE;
const haveWhisper = Boolean(BIN && MODEL && SAMPLE);

describe('WhisperCppEngine integration (real binary)', () => {
  it.skipIf(!haveWhisper)(
    'available() is true with a real binary + model',
    async () => {
      const engine = new WhisperCppEngine({ binary: BIN!, model: MODEL! });
      expect(await engine.available()).toBe(true);
    }
  );

  it.skipIf(!haveWhisper)(
    'transcribes the whole file (publicRanges null)',
    async () => {
      const engine = new WhisperCppEngine({ binary: BIN!, model: MODEL! });
      const result = await engine.transcribe({
        audio: { path: SAMPLE! },
        language: 'en',
        publicRanges: null,
      });
      expect(result.language).toBeTruthy();
      expect(result.segments.length).toBeGreaterThan(0);
      // offsets are seconds (not ms): a ~11s clip stays well under 60.
      expect(result.segments[0].start).toBeGreaterThanOrEqual(0);
      expect(result.segments[0].end).toBeLessThan(60);
      expect(result.text.length).toBeGreaterThan(0);
    },
    60_000
  );

  it.skipIf(!haveWhisper)(
    'restricts to a public range (in-camera exclusion)',
    async () => {
      const engine = new WhisperCppEngine({ binary: BIN!, model: MODEL! });
      const result = await engine.transcribe({
        audio: { path: SAMPLE! },
        language: 'en',
        // only the first 5s is public; offsets stay absolute from file start.
        publicRanges: [{ start: 0, end: 5 }],
      });
      expect(result.segments.length).toBeGreaterThan(0);
      // nothing past the public window (allow whisper's segment rounding).
      for (const s of result.segments) {
        expect(s.start).toBeLessThan(6);
      }
    },
    60_000
  );
});
