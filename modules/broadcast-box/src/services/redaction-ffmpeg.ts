/**
 * ffmpeg/ffprobe media operations for the redaction worker (FA-BB-002).
 *
 * The blanking command is the one VALIDATED on the real capstone MP4 (design
 * doc §ffmpeg): timeline-preserving full re-encode with `drawbox t=fill`
 * (overwrites every pixel) + `volume=0` (zeroes every sample) enabled across
 * each padded hidden window. A filtered range cannot be stream-copied; the
 * all-public fast path remuxes with `-c copy`.
 *
 * Verification primitives decode actual output frames/samples — the encode's
 * exit code is NOT enough (a mis-mapped audio track exits 0 while leaking).
 *
 * Everything shells out via execFile (no shell interpolation) and operates on
 * local paths — a multi-hour recording is never loaded into a Buffer.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Logger } from '@civicpress/core';
import type { TimeRange } from '@civicpress/transcription';

const execFileAsync = promisify(execFile);

/** Stream/duration facts the worker needs before deciding how to redact. */
export interface MediaProbe {
  durationS: number;
  hasAudio: boolean;
  hasVideo: boolean;
}

/**
 * The media seam the worker depends on — real ffmpeg in production, a fake in
 * unit tests.
 */
export interface MediaProcessor {
  /** Are ffmpeg + ffprobe callable? False → the worker idles (no false 'failed'). */
  available(): Promise<boolean>;
  probe(inputPath: string): Promise<MediaProbe>;
  /** All-public fast path: stream-copy remux with faststart. */
  copy(inputPath: string, outputPath: string): Promise<void>;
  /** Re-encode with every hidden window blanked (black video + silent audio). */
  blank(
    inputPath: string,
    outputPath: string,
    hiddenRanges: TimeRange[],
    probe: MediaProbe
  ): Promise<void>;
  /** Max luma (0–255) of one decoded frame at `atS`. Black ≈ 16 (limited range). */
  frameMaxLuma(inputPath: string, atS: number): Promise<number>;
  /**
   * Mean audio volume (dBFS) over ~`windowS` seconds around `atS`.
   * Digital silence reports around -91 dB (or -Infinity).
   */
  meanVolumeDb(inputPath: string, atS: number, windowS: number): Promise<number>;
}

export interface FfmpegMediaProcessorOptions {
  ffmpegPath?: string;
  ffprobePath?: string;
  logger?: Logger;
  /** Encode timeout (ms). Default 6h — a multi-hour meeting re-encode is slow. */
  encodeTimeoutMs?: number;
}

/** Build the `between(t,A,B)+…` enable expression for a set of ranges. */
export function enableExpression(ranges: TimeRange[]): string {
  // Disjoint (merged) ranges → the summed between() terms are 0/1 (truthy),
  // so overlapping application cannot double-apply.
  return ranges
    .map((r) => `between(t,${r.start.toFixed(3)},${r.end.toFixed(3)})`)
    .join('+');
}

export class FfmpegMediaProcessor implements MediaProcessor {
  private readonly ffmpeg: string;
  private readonly ffprobe: string;
  private readonly logger?: Logger;
  private readonly encodeTimeoutMs: number;

  constructor(options: FfmpegMediaProcessorOptions = {}) {
    this.ffmpeg = options.ffmpegPath ?? 'ffmpeg';
    this.ffprobe = options.ffprobePath ?? 'ffprobe';
    this.logger = options.logger;
    this.encodeTimeoutMs = options.encodeTimeoutMs ?? 6 * 60 * 60 * 1000;
  }

  async available(): Promise<boolean> {
    try {
      await execFileAsync(this.ffmpeg, ['-version'], { timeout: 10_000 });
      await execFileAsync(this.ffprobe, ['-version'], { timeout: 10_000 });
      return true;
    } catch {
      return false;
    }
  }

  async probe(inputPath: string): Promise<MediaProbe> {
    const { stdout } = await execFileAsync(
      this.ffprobe,
      [
        '-v',
        'error',
        '-show_entries',
        'format=duration:stream=codec_type',
        '-of',
        'json',
        inputPath,
      ],
      { timeout: 60_000, maxBuffer: 4 * 1024 * 1024 }
    );
    const parsed = JSON.parse(stdout) as {
      format?: { duration?: string };
      streams?: Array<{ codec_type?: string }>;
    };
    const durationS = Number(parsed.format?.duration);
    if (!Number.isFinite(durationS) || durationS <= 0) {
      throw new Error(`ffprobe returned no usable duration for ${inputPath}`);
    }
    const streams = parsed.streams ?? [];
    return {
      durationS,
      hasAudio: streams.some((s) => s.codec_type === 'audio'),
      hasVideo: streams.some((s) => s.codec_type === 'video'),
    };
  }

  async copy(inputPath: string, outputPath: string): Promise<void> {
    await execFileAsync(
      this.ffmpeg,
      [
        '-nostdin',
        '-y',
        '-i',
        inputPath,
        '-c',
        'copy',
        '-movflags',
        '+faststart',
        outputPath,
      ],
      { timeout: this.encodeTimeoutMs, maxBuffer: 64 * 1024 * 1024 }
    );
  }

  async blank(
    inputPath: string,
    outputPath: string,
    hiddenRanges: TimeRange[],
    probe: MediaProbe
  ): Promise<void> {
    if (hiddenRanges.length === 0) {
      throw new Error('blank() called with no hidden ranges');
    }
    const expr = enableExpression(hiddenRanges);
    const filters: string[] = [];
    const maps: string[] = [];
    if (probe.hasVideo) {
      filters.push(
        `[0:v]setpts=PTS-STARTPTS,drawbox=x=0:y=0:w=iw:h=ih:color=black:t=fill:enable='${expr}'[v]`
      );
      maps.push('-map', '[v]');
    }
    if (probe.hasAudio) {
      filters.push(
        `[0:a]asetpts=PTS-STARTPTS,volume=enable='${expr}':volume=0[a]`
      );
      maps.push('-map', '[a]');
    }
    const args = [
      '-nostdin',
      '-y',
      '-i',
      inputPath,
      '-filter_complex',
      filters.join(';'),
      ...maps,
      ...(probe.hasVideo
        ? [
            '-c:v',
            'libx264',
            '-preset',
            'veryfast',
            '-crf',
            '20',
            '-pix_fmt',
            'yuv420p',
          ]
        : []),
      ...(probe.hasAudio ? ['-c:a', 'aac', '-b:a', '128k'] : []),
      '-movflags',
      '+faststart',
      outputPath,
    ];
    this.logger?.debug('redaction blank encode', {
      operation: 'broadcast-box:redaction:ffmpeg',
      inputPath,
      hiddenRanges: JSON.stringify(hiddenRanges),
    });
    await execFileAsync(this.ffmpeg, args, {
      timeout: this.encodeTimeoutMs,
      maxBuffer: 64 * 1024 * 1024,
    });
  }

  async frameMaxLuma(inputPath: string, atS: number): Promise<number> {
    // Decode exactly one frame at `atS` to raw 8-bit gray and take the max
    // byte. A drawbox-blacked frame decodes to ~16 everywhere (limited-range
    // black); any real content pushes the max far higher.
    const frame: Buffer = await new Promise((resolve, reject) => {
      const child = execFile(
        this.ffmpeg,
        [
          '-nostdin',
          '-ss',
          atS.toFixed(3),
          '-i',
          inputPath,
          '-frames:v',
          '1',
          '-pix_fmt',
          'gray',
          '-f',
          'rawvideo',
          'pipe:1',
        ],
        {
          timeout: 120_000,
          maxBuffer: 128 * 1024 * 1024,
          encoding: 'buffer',
        },
        (error, stdout) => {
          if (error) reject(error);
          else resolve(stdout as unknown as Buffer);
        }
      );
      void child;
    });
    if (frame.length === 0) {
      throw new Error(`no frame decoded at ${atS}s from ${inputPath}`);
    }
    let max = 0;
    for (const byte of frame) if (byte > max) max = byte;
    return max;
  }

  async meanVolumeDb(
    inputPath: string,
    atS: number,
    windowS: number
  ): Promise<number> {
    const start = Math.max(0, atS - windowS / 2);
    const { stderr } = await execFileAsync(
      this.ffmpeg,
      [
        '-nostdin',
        '-ss',
        start.toFixed(3),
        '-t',
        windowS.toFixed(3),
        '-i',
        inputPath,
        '-map',
        '0:a:0',
        '-af',
        'volumedetect',
        '-f',
        'null',
        '-',
      ],
      { timeout: 120_000, maxBuffer: 16 * 1024 * 1024 }
    );
    const match = /mean_volume:\s*(-?[\d.]+|-inf)\s*dB/.exec(stderr);
    if (!match) {
      throw new Error(`volumedetect produced no mean_volume for ${inputPath}`);
    }
    return match[1] === '-inf' ? Number.NEGATIVE_INFINITY : Number(match[1]);
  }
}
