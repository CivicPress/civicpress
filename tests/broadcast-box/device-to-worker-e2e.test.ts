/**
 * BroadcastBox Phase 5 — 4d: device → server → transcription worker, synthetic.
 *
 * Ties 4a–4c together against a REAL CivicPress, with no hardware and no WS
 * transport: the broadcast-box module is mounted (4b), its real SessionController
 * applies a device `session.manifest` carrying mixed-visibility segments (4c)
 * onto a session record, and the in-process transcription worker (the W2
 * launcher) then transcribes it — excluding the in-camera window (4a).
 *
 * What this proves end-to-end:
 *   manifest(capture.segments + av_file)
 *     → SessionController.applySessionManifest → session record
 *       → transcription worker → CoreRecordsGateway (real read of capture)
 *         → in-camera ranges excluded from the engine
 *           → transcript_status + media.transcript_data written back.
 *
 * The A/V engine is a capturing stub (deterministic, env-free); storage is faked
 * (the worker only needs bytes to hand the engine).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { execSync } from 'node:child_process';
import yaml from 'js-yaml';

import { CivicPress } from '@civicpress/core';
import { CentralConfigManager } from '../../core/dist/config/central-config.js';
import {
  RecordSchemaBuilder,
  setModuleResolver,
} from '../../core/dist/records/record-schema-builder.js';
import { ModuleResolver } from '../../core/dist/modules/module-resolver.js';
import { startInProcessBroadcastBox } from '../../modules/api/src/broadcast-box-bootstrap.js';
import { startInProcessTranscription } from '../../modules/api/src/transcription-bootstrap.js';

const MODULES_ROOT = path.join(process.cwd(), 'modules');
const SYSTEM_USER = { id: 1, username: 'system', role: 'admin' };
const silentLogger = {
  info() {},
  warn() {},
  error() {},
  debug() {},
} as any;

// Records the publicRanges the worker passes — the civic-critical assertion.
class CapturingStubEngine {
  readonly name = 'capturing-stub';
  lastInput: any = null;
  constructor(private readonly result: any) {}
  async available() {
    return true;
  }
  async transcribe(input: any) {
    this.lastInput = input;
    return this.result;
  }
}

function frontmatter(md: string): Record<string, any> {
  const m = md.match(/^---\n([\s\S]*?)\n---/);
  if (!m) throw new Error('no frontmatter found');
  return yaml.load(m[1]) as Record<string, any>;
}

describe('device → server → worker (synthetic, real CivicPress)', () => {
  let testDir: string;
  let civic: any;
  let recordManager: any;
  let bbMount: { started: boolean; stop: () => void } | null = null;
  let worker: any = null;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bb-d2w-e2e-'));
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

    // broadcast-box enabled: drives the mount gate AND lets the serializer lift
    // transcript_status / merge the capture extension.
    setModuleResolver(new ModuleResolver(MODULES_ROOT));
    vi.spyOn(CentralConfigManager, 'getModules').mockReturnValue([
      'broadcast-box',
    ]);
    RecordSchemaBuilder.clearCache();
  });

  afterEach(async () => {
    try {
      worker?.stop();
    } catch {
      /* ignore */
    }
    try {
      bbMount?.stop();
    } catch {
      /* ignore */
    }
    worker = null;
    bbMount = null;
    vi.restoreAllMocks();
    RecordSchemaBuilder.clearCache();
    try {
      await civic?.shutdown();
    } catch {
      /* ignore */
    }
    await new Promise((r) => setTimeout(r, 200));
    await fs.rm(testDir, { recursive: true, force: true }).catch(() => {});
  });

  async function seedSessionRecord(): Promise<string> {
    await recordManager.createRecord(
      {
        title: 'Regular Council Meeting',
        type: 'session',
        content: '# Meeting',
        status: 'published',
        metadata: { media: { recording: 'rec-uuid' } },
      },
      SYSTEM_USER
    );
    const { records } = await recordManager.listRecords({ type: 'session' });
    return records[0].id;
  }

  async function readFrontmatter(id: string): Promise<Record<string, any>> {
    const rec = await recordManager.getRecord(id);
    const md = readFileSync(path.join(testDir, rec.path), 'utf-8');
    return frontmatter(md);
  }

  it('manifest segments flow through the mounted module to the worker, which excludes in-camera', async () => {
    // 1. Mount broadcast-box and grab its REAL SessionController.
    const express = (await import('express')).default;
    const app = express();
    app.use(express.json());
    bbMount = await startInProcessBroadcastBox(civic, app, silentLogger, {
      enabled: true,
    });
    expect(bbMount.started).toBe(true);

    const sessionController = civic
      .getContainer()
      .resolve('broadcastBoxSessionController');

    // 2. A session record exists (no capture yet — needs the device manifest).
    const id = await seedSessionRecord();

    // 3. The device sends its session.manifest: declares segment-level
    //    visibility. The middle window is in-camera (closed). A manifest can no
    //    longer bind av_file (FA-BB-013) — that is upload-finalize's job, which
    //    we simulate below with the same read-merge write linkFileToSession
    //    performs (the records write path shallow-merges `metadata` per key).
    await sessionController.applySessionManifest(id, {
      device: 'bb-001',
      av_file: 'ignored-by-manifest',
      duration_s: 15,
      segments: [
        { start: 0, end: 5, visibility: 'public' },
        { start: 5, end: 10, visibility: 'in_camera' },
        { start: 10, end: 15, visibility: 'public' },
      ],
    });

    // Sanity: segments landed, and the manifest could NOT bind av_file.
    const afterManifest = await readFrontmatter(id);
    expect(afterManifest.capture.av_file).toBeUndefined();
    expect(afterManifest.capture.segments).toHaveLength(3);

    // Upload-finalize binds the raw A/V file (linkFileToSession's write shape).
    const recAfterManifest = await recordManager.getRecord(id);
    await recordManager.updateRecord(
      id,
      {
        metadata: {
          capture: {
            ...(recAfterManifest.metadata?.capture ?? {}),
            av_file: 'av-uuid-1',
            redaction_status: 'pending',
          },
        },
      },
      SYSTEM_USER
    );
    const afterFinalize = await readFrontmatter(id);
    expect(afterFinalize.capture.av_file).toBe('av-uuid-1');

    // 4. Start the in-process transcription worker (the W2 launcher) with a
    //    capturing stub engine + faked storage bytes.
    const transcript = {
      language: 'fr',
      text: 'public portions only',
      segments: [{ start: 0, end: 5, text: 'public portions only' }],
    };
    const engine = new CapturingStubEngine(transcript);
    const started = await startInProcessTranscription(
      civic,
      { enabled: true, poll_interval_ms: 60_000 },
      silentLogger,
      {
        engine: engine as any,
        storage: {
          async getFileContent() {
            return Buffer.from('fake-av-bytes');
          },
        },
      }
    );
    worker = started.worker;
    expect(started.started).toBe(true);

    // 5. Wait for the write-back, then assert in-camera exclusion end-to-end.
    const deadline = Date.now() + 4000;
    let fm: Record<string, any> | null = null;
    while (Date.now() < deadline) {
      const cur = await readFrontmatter(id);
      if (cur.transcript_status === 'automated') {
        fm = cur;
        break;
      }
      await new Promise((r) => setTimeout(r, 50));
    }

    expect(fm).not.toBeNull();
    expect(fm!.media.transcript_data).toMatchObject(transcript);
    // The civic-critical assertion: the in-camera window (5–10s) was never sent
    // to the engine — only the two public ranges, derived from the manifest the
    // mounted module persisted.
    expect(engine.lastInput.publicRanges).toEqual([
      { start: 0, end: 5 },
      { start: 10, end: 15 },
    ]);
  });
});
