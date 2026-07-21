/**
 * Real-ffmpeg proof that multi-point probing catches a PARTIALLY blanked hidden
 * window (FA-BB-002 verification).
 *
 * The unit tests above fake the media processor; this one decodes actual bytes.
 * It builds a 20 s clip in which the hidden window [5,15] is blanked ONLY over
 * its middle [8,12] — exactly the shape a boundary-off-by-a-frame or a filter
 * re-init produces — and shows that:
 *
 *   - the window's MIDPOINT is genuinely black and silent, so the old
 *     single-sample verification would have passed it and PUBLISHED the leak;
 *   - the start/end probes hiddenWindowProbes() adds are not, so the verifier
 *     now rejects it.
 *
 * Skipped (not failed) where ffmpeg/ffprobe are unavailable — same contract as
 * the worker itself, which idles rather than reporting false failures.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { FfmpegMediaProcessor } from '../services/redaction-ffmpeg.js';
import { hiddenWindowProbes } from '../services/redaction-worker.js';

const execFileAsync = promisify(execFile);

/** Thresholds mirrored from redaction-worker (black ≈ 16, silence ≈ -91 dB). */
const MAX_BLACK_LUMA = 48;
const MAX_SILENT_DB = -70;

/** The nominal hidden window, and the sub-range actually blanked. */
const WINDOW = { start: 5, end: 15 };
const BLANKED = { start: 8, end: 12 };
const DURATION_S = 20;

const media = new FfmpegMediaProcessor();
let available = false;
let workDir = '';
let clipPath = '';

describe('redaction verification against real ffmpeg output', () => {
  beforeAll(async () => {
    available = await media.available();
    if (!available) return;
    workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'redaction-probe-'));
    clipPath = path.join(workDir, 'partially-blanked.mp4');
    const enable = `between(t,${BLANKED.start},${BLANKED.end})`;
    await execFileAsync(
      'ffmpeg',
      [
        '-nostdin',
        '-y',
        '-v',
        'error',
        '-f',
        'lavfi',
        '-i',
        `testsrc=size=320x240:rate=10:duration=${DURATION_S}`,
        '-f',
        'lavfi',
        '-i',
        `sine=frequency=440:duration=${DURATION_S}`,
        '-filter_complex',
        `[0:v]drawbox=x=0:y=0:w=iw:h=ih:color=black:t=fill:enable='${enable}'[v];` +
          `[1:a]volume=enable='${enable}':volume=0[a]`,
        '-map',
        '[v]',
        '-map',
        '[a]',
        '-c:v',
        'libx264',
        '-preset',
        'ultrafast',
        '-crf',
        '20',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-b:a',
        '128k',
        clipPath,
      ],
      { timeout: 120_000 }
    );
  }, 180_000);

  afterAll(async () => {
    if (workDir) await fs.rm(workDir, { recursive: true, force: true });
  });

  it(
    'a midpoint-only sample PASSES the partially blanked window (the old blind spot)',
    async () => {
      if (!available) return; // ffmpeg absent — nothing to prove here
      const mid = (WINDOW.start + WINDOW.end) / 2;
      expect(await media.frameMaxLuma(clipPath, mid)).toBeLessThanOrEqual(
        MAX_BLACK_LUMA
      );
      expect(await media.meanVolumeDb(clipPath, mid, 1)).toBeLessThanOrEqual(
        MAX_SILENT_DB
      );
    },
    120_000
  );

  it(
    'the multi-point probes CATCH it — content and audio survive at the window edges',
    async () => {
      if (!available) return;
      const probes = hiddenWindowProbes(WINDOW, DURATION_S);
      expect(probes.length).toBeGreaterThan(1);

      const lumas: number[] = [];
      const volumes: number[] = [];
      for (const at of probes) {
        lumas.push(await media.frameMaxLuma(clipPath, at));
        volumes.push(await media.meanVolumeDb(clipPath, at, 1));
      }
      // At least one probe sees real (non-black) video and audible audio, so
      // verifyOutput throws and the variant is never published.
      expect(lumas.some((l) => l > MAX_BLACK_LUMA)).toBe(true);
      expect(volumes.some((v) => v > MAX_SILENT_DB)).toBe(true);
    },
    120_000
  );

  it(
    'a FULLY blanked window passes every probe (no false failure)',
    async () => {
      if (!available) return;
      // Same clip, but check the window that really was blanked end-to-end.
      for (const at of hiddenWindowProbes(BLANKED, DURATION_S)) {
        expect(await media.frameMaxLuma(clipPath, at)).toBeLessThanOrEqual(
          MAX_BLACK_LUMA
        );
      }
    },
    120_000
  );
});
