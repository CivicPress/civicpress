/**
 * FA-BB-002 redaction e2e — REAL ffmpeg, REAL CivicPress records + storage.
 *
 * The closure proof from the design doc (§Tests): seed a session whose real
 * MP4 has a known in-camera window, run the redaction worker, then assert on
 * the ACTUAL published bytes:
 *   (a) a decoded frame at the closed-window midpoint is BLACK and the audio
 *       there is silent;
 *   (b) a public-segment frame decodes with real (non-black) content;
 *   (c) the raw original stays only in the private `recordings_raw` folder and
 *       the published variant lives in the public `recordings` folder;
 *   (d) the record's capture block latches public_file + complete and the
 *       public attached_files entry points at the REDACTED file, never the raw.
 *
 * Skipped automatically when ffmpeg/ffprobe are not installed.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { execFileSync, execSync } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

import { CivicPress } from '@civicpress/core';
import { CentralConfigManager } from '../../core/dist/config/central-config.js';
import {
  RecordSchemaBuilder,
  setModuleResolver,
} from '../../core/dist/records/record-schema-builder.js';
import { ModuleResolver } from '../../core/dist/modules/module-resolver.js';
import {
  RedactionWorker,
  FfmpegMediaProcessor,
} from '../../modules/broadcast-box/dist/index.js';
import { initializeStorageService } from '../../modules/storage/dist/index.js';

const MODULES_ROOT = path.join(process.cwd(), 'modules');
const SYSTEM_USER = { id: 1, username: 'system', role: 'admin' };
const silentLogger = {
  info() {},
  warn() {},
  error() {},
  debug() {},
} as any;

function ffmpegInstalled(): boolean {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    execFileSync('ffprobe', ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}
const HAVE_FFMPEG = ffmpegInstalled();

/**
 * A 15s test recording with unmistakably non-black video (testsrc pattern)
 * and a constant 440Hz tone — so black/silence after redaction is provable.
 */
function makeTestMp4(outPath: string): void {
  execFileSync(
    'ffmpeg',
    [
      '-nostdin',
      '-y',
      '-f',
      'lavfi',
      '-i',
      'testsrc=size=320x240:rate=10:duration=15',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440:duration=15',
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-shortest',
      outPath,
    ],
    { stdio: 'ignore' }
  );
}

describe.skipIf(!HAVE_FFMPEG)(
  'redaction worker e2e (real ffmpeg + real storage)',
  () => {
    let testDir: string;
    let civic: any;
    let recordManager: any;
    let storage: any;
    let media: FfmpegMediaProcessor;

    beforeEach(async () => {
      testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bb-redaction-e2e-'));
      await fs.mkdir(path.join(testDir, '.system-data'), { recursive: true });
      await fs.mkdir(path.join(testDir, '.civic'), { recursive: true });
      await fs.mkdir(path.join(testDir, 'records'), { recursive: true });
      execSync('git init', { cwd: testDir, stdio: 'ignore' });
      execSync('git config user.name "Test"', { cwd: testDir, stdio: 'ignore' });
      execSync('git config user.email "t@e.com"', {
        cwd: testDir,
        stdio: 'ignore',
      });

      civic = new CivicPress({
        dataDir: testDir,
        database: {
          type: 'sqlite',
          sqlite: { file: path.join(testDir, '.system-data', 'test.db') },
        },
      });
      await civic.initialize();
      recordManager = civic.getRecordManager();

      setModuleResolver(new ModuleResolver(MODULES_ROOT));
      vi.spyOn(CentralConfigManager, 'getModules').mockReturnValue([
        'broadcast-box',
      ]);
      RecordSchemaBuilder.clearCache();

      storage = civic.getService('storage');
      await initializeStorageService(storage);
      media = new FfmpegMediaProcessor({ logger: silentLogger });
    });

    afterEach(async () => {
      vi.restoreAllMocks();
      RecordSchemaBuilder.clearCache();
      try {
        await civic?.shutdown();
      } catch {
        /* ignore */
      }
      await new Promise((r) => setTimeout(r, 150));
      await fs.rm(testDir, { recursive: true, force: true }).catch(() => {});
    });

    async function seedSession(capture: Record<string, unknown>) {
      await recordManager.createRecord(
        {
          title: 'Council meeting with an in-camera window',
          type: 'session',
          content: '# Meeting',
          status: 'published',
          metadata: { capture },
        },
        SYSTEM_USER
      );
      const { records } = await recordManager.listRecords({ type: 'session' });
      return records[0].id;
    }

    async function uploadRaw(): Promise<string> {
      const rawLocal = path.join(testDir, 'raw.mp4');
      makeTestMp4(rawLocal);
      const buffer = await fs.readFile(rawLocal);
      const res = await storage.uploadFile({
        file: {
          fieldname: 'file',
          originalname: 'recording.mp4',
          encoding: '7bit',
          mimetype: 'video/mp4',
          size: buffer.length,
          destination: '',
          filename: '',
          path: '',
          buffer,
        },
        folder: 'recordings_raw',
        uploaded_by: 'system',
      });
      expect(res.success).toBe(true);
      return res.file.id;
    }

    it(
      'blanks the in-camera window, verifies it, and publishes only the redacted variant',
      async () => {
        const avUuid = await uploadRaw();
        // In-camera window [5,10] on a 15s recording. Small pads keep public
        // content on both sides at this test scale.
        const id = await seedSession({
          device: 'bb-001',
          av_file: avUuid,
          redaction_status: 'pending',
          duration_s: 15,
          segments: [
            { start: 0, end: 5, visibility: 'public' },
            { start: 5, end: 10, visibility: 'in_camera' },
            { start: 10, end: 15, visibility: 'public' },
          ],
        });

        const worker = new RedactionWorker({
          records: recordManager,
          storage,
          media,
          logger: silentLogger,
          leadPadS: 1,
          trailPadS: 1,
        });
        const summary = await worker.runOnce();
        expect(summary).toEqual({ published: 1, held: 0, failed: 0 });

        // The capture block latched: public_file + complete, raw preserved.
        const record = await recordManager.getRecord(id);
        const capture = record.metadata?.capture ?? (record as any).capture;
        expect(capture.redaction_status).toBe('complete');
        expect(capture.av_file).toBe(avUuid);
        const publicUuid = capture.public_file;
        expect(publicUuid).toBeTruthy();
        expect(publicUuid).not.toBe(avUuid);

        // (c) folder placement: raw private, published public.
        expect((await storage.getFileById(avUuid)).folder).toBe(
          'recordings_raw'
        );
        const publicFile = await storage.getFileById(publicUuid);
        expect(publicFile.folder).toBe('recordings');

        // (d) the public attachment points at the REDACTED file only.
        const attached = (record.attachedFiles ?? []).map((f: any) => f.id);
        expect(attached).toContain(publicUuid);
        expect(attached).not.toContain(avUuid);

        // (a) closed-window midpoint (t=7.5 inside padded [4,11]): black + silent.
        const outPath = publicFile.provider_path;
        expect(await media.frameMaxLuma(outPath, 7.5)).toBeLessThanOrEqual(48);
        expect(await media.meanVolumeDb(outPath, 7.5, 1)).toBeLessThanOrEqual(
          -70
        );

        // (b) a public frame (t=2) has real content and audible tone.
        expect(await media.frameMaxLuma(outPath, 2)).toBeGreaterThan(100);
        expect(await media.meanVolumeDb(outPath, 2, 1)).toBeGreaterThan(-40);

        // Timeline preserved.
        const rawProbe = await media.probe(
          (await storage.getFileById(avUuid)).provider_path
        );
        const outProbe = await media.probe(outPath);
        expect(Math.abs(outProbe.durationS - rawProbe.durationS)).toBeLessThan(
          1.5
        );
      },
      120_000
    );

    it(
      'a session with segments=[] publishes NOTHING (UNKNOWN holds)',
      async () => {
        const avUuid = await uploadRaw();
        await seedSession({
          device: 'bb-001',
          av_file: avUuid,
          redaction_status: 'pending',
          segments: [],
        });

        const worker = new RedactionWorker({
          records: recordManager,
          storage,
          media,
          logger: silentLogger,
        });
        const summary = await worker.runOnce();
        expect(summary).toEqual({ published: 0, held: 1, failed: 0 });

        const { records } = await recordManager.listRecords({ type: 'session' });
        const record = await recordManager.getRecord(records[0].id);
        const capture = record.metadata?.capture ?? (record as any).capture;
        expect(capture.public_file).toBeUndefined();
        expect(capture.redaction_status).toBe('pending');
        // Nothing landed in the public folder.
        expect(await storage.listFiles('recordings')).toHaveLength(0);
      },
      60_000
    );
  }
);
