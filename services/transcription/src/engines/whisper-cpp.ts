/**
 * whisper.cpp transcription engine (BroadcastBox W2 default).
 *
 * Spawns the `whisper-cli` binary, transcribes the PUBLIC audio, and maps its
 * JSON output to a {@link TranscriptResult}. Engine-agnostic boundary: the
 * worker only sees the {@link TranscriptionEngine} contract.
 *
 * CLI + JSON shape pinned against whisper.cpp ggml 0.15.2 (commit 43d78af,
 * 2026-06-23) on 2026-06-25:
 *   whisper-cli -m <model> -f <wav> -l <lang> -oj -of <prefix> [-ot <ms> -d <ms>]
 *   → <prefix>.json = { result: { language }, transcription: [ { offsets: {from,to}/*ms*​/, text } ] }
 * Findings that shape this adapter:
 *   - `offsets.from/to` are MILLISECONDS (→ seconds here; capture segments are seconds).
 *   - with `-ot`, returned offsets are ABSOLUTE from file start (no re-mapping needed).
 *   - whisper rejects region subtags: `fr-CA` → must pass `fr`.
 */

import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, access } from 'node:fs/promises';
import { constants as FS } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type {
  AudioRef,
  Logger,
  TimeRange,
  TranscriptionEngine,
  TranscriptResult,
  TranscriptSegment,
} from '../types.js';

export interface WhisperCppEngineOptions {
  /** Path to the `whisper-cli` binary. */
  binary: string;
  /** Path to the ggml model file. */
  model: string;
  /** Threads for whisper (omit → whisper default). */
  threads?: number;
  /** Default language when `transcribe()` is not given one. */
  language?: string;
  /** ffmpeg binary used to decode the A/V to 16 kHz mono WAV (default `ffmpeg`). */
  ffmpeg?: string;
  logger?: Logger;
}

/** The subset of whisper.cpp `-oj` output this adapter consumes. */
export interface WhisperJson {
  result?: { language?: string };
  transcription?: Array<{
    offsets?: { from?: number; to?: number };
    text?: string;
  }>;
}

/**
 * Map a BCP-47-ish hint to a whisper language code. whisper.cpp rejects region
 * subtags (`fr-CA` → `unknown language 'fr-ca'`), so keep only the primary
 * subtag. Empty/unknown → `auto` (whisper auto-detects).
 */
export function toWhisperLanguage(language: string | undefined): string {
  if (!language) return 'auto';
  const base = language.split(/[-_]/)[0].trim().toLowerCase();
  return base.length > 0 ? base : 'auto';
}

/** Map pinned whisper JSON → a TranscriptResult (offsets ms → seconds). */
export function mapWhisperJson(
  json: WhisperJson,
  fallbackLanguage: string
): TranscriptResult {
  const rows = Array.isArray(json.transcription) ? json.transcription : [];
  const segments: TranscriptSegment[] = rows
    .filter((r) => r && r.offsets && typeof r.text === 'string')
    .map((r) => ({
      start: (r.offsets?.from ?? 0) / 1000,
      end: (r.offsets?.to ?? 0) / 1000,
      text: (r.text ?? '').trim(),
    }))
    .filter((s) => s.text.length > 0);

  return {
    language: json.result?.language || fallbackLanguage,
    text: segments.map((s) => s.text).join(' ').trim(),
    segments,
  };
}

export class WhisperCppEngine implements TranscriptionEngine {
  readonly name = 'whisper-cpp';

  constructor(private readonly opts: WhisperCppEngineOptions) {}

  /** Precondition probe: the binary is executable and the model is readable. */
  async available(): Promise<boolean> {
    try {
      await access(this.opts.binary, FS.X_OK);
      await access(this.opts.model, FS.R_OK);
      return true;
    } catch {
      return false;
    }
  }

  async transcribe(input: {
    audio: AudioRef;
    language?: string;
    publicRanges: TimeRange[] | null;
  }): Promise<TranscriptResult> {
    const lang = toWhisperLanguage(input.language ?? this.opts.language);
    const workDir = await mkdtemp(join(tmpdir(), 'whisper-'));
    try {
      // whisper-cli reads 16 kHz mono WAV only — decode the source A/V first.
      const wav = join(workDir, 'audio.wav');
      await this.toWav(input.audio.path, wav);

      // null → the whole recording is public: one pass over the file.
      // [...] → in-camera excluded: one pass per public range (offsets stay
      //         absolute, so the segments merge directly). An empty list never
      //         reaches here — the worker skips a fully-in-camera session.
      const ranges: Array<TimeRange | null> =
        input.publicRanges === null ? [null] : input.publicRanges;

      const all: TranscriptSegment[] = [];
      let detectedLanguage = lang;
      for (let i = 0; i < ranges.length; i++) {
        const json = await this.runWhisper(wav, lang, ranges[i], workDir, i);
        const partial = mapWhisperJson(json, lang);
        if (partial.language) detectedLanguage = partial.language;
        all.push(...partial.segments);
      }

      all.sort((a, b) => a.start - b.start);
      return {
        language: detectedLanguage,
        text: all.map((s) => s.text).join(' ').trim(),
        segments: all,
      };
    } finally {
      await rm(workDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  /** Decode any A/V to the 16 kHz mono PCM WAV whisper.cpp requires. */
  private async toWav(input: string, output: string): Promise<void> {
    await this.exec(this.opts.ffmpeg ?? 'ffmpeg', [
      '-nostdin',
      '-y',
      '-i', input,
      '-ar', '16000', // 16 kHz
      '-ac', '1', // mono
      '-c:a', 'pcm_s16le',
      '-f', 'wav',
      output,
    ]);
  }

  /** Run whisper-cli once over the whole WAV or a single [start,end] range. */
  private async runWhisper(
    wavPath: string,
    lang: string,
    range: TimeRange | null,
    workDir: string,
    index: number
  ): Promise<WhisperJson> {
    const prefix = join(workDir, `out-${index}`);
    const args = [
      '-m', this.opts.model,
      '-f', wavPath,
      '-l', lang,
      '-oj',
      '-of', prefix,
      '-np', // no progress prints; the JSON file is the contract
    ];
    if (this.opts.threads) args.push('-t', String(this.opts.threads));
    if (range) {
      const startMs = Math.max(0, Math.round(range.start * 1000));
      const durMs = Math.max(0, Math.round((range.end - range.start) * 1000));
      args.push('-ot', String(startMs), '-d', String(durMs));
    }

    await this.exec(this.opts.binary, args);
    const raw = await readFile(`${prefix}.json`, 'utf-8');
    return JSON.parse(raw) as WhisperJson;
  }

  /** Spawn a process; resolve on exit 0, reject with stderr otherwise. */
  private exec(command: string, args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, { stdio: ['ignore', 'ignore', 'pipe'] });
      let stderr = '';
      child.stderr?.on('data', (d) => {
        stderr += String(d);
      });
      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) resolve();
        else
          reject(
            new Error(
              `whisper-cli exited ${code}: ${stderr.trim().slice(-500)}`
            )
          );
      });
    });
  }
}
