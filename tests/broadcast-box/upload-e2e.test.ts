/**
 * BroadcastBox Phase 5 — R3: real HTTP chunked-upload → capture block.
 *
 * Drives the actual device upload endpoints against the mounted module with a
 * REAL storage service (no mocks):
 *   POST /uploads → POST /uploads/:id/chunks → POST /uploads/:id/finalize
 * On finalize the combined A/V is hashed, stored, and `recording:complete` is
 * emitted → linkFileToSession writes the `capture` block onto the CivicPress
 * session record. Proves the A/V upload half of the device↔CP integration.
 *
 * Auth: the uploads routes sit behind the API auth middleware; the test uses the
 * BYPASS_AUTH + x-mock-user seam (real device-token auth for uploads is still a
 * TODO — see the integration-status note). Storage uses its default local
 * provider under the test's .system-data.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import yaml from 'js-yaml';
import request from 'supertest';

import { CivicPress } from '@civicpress/core';
import { CentralConfigManager } from '../../core/dist/config/central-config.js';
import {
  RecordSchemaBuilder,
  setModuleResolver,
} from '../../core/dist/records/record-schema-builder.js';
import { ModuleResolver } from '../../core/dist/modules/module-resolver.js';
import { startInProcessBroadcastBox } from '../../modules/api/src/broadcast-box-bootstrap.js';

const SYSTEM_USER = { id: 1, username: 'system', role: 'admin' };
const MOCK_ADMIN = JSON.stringify({ id: 1, username: 'admin', role: 'admin' });
const silentLogger = {
  info() {},
  warn() {},
  error() {},
  debug() {},
} as any;

function frontmatter(md: string): Record<string, any> {
  const m = md.match(/^---\n([\s\S]*?)\n---/);
  if (!m) throw new Error('no frontmatter found');
  return yaml.load(m[1]) as Record<string, any>;
}

describe('HTTP chunked upload → capture block (real storage, mounted module)', () => {
  let testDir: string;
  let dataDir: string;
  let civic: any;
  let recordManager: any;
  let app: any;
  let bbMount: { started: boolean; stop: () => void } | null = null;
  let prevBypass: string | undefined;

  beforeEach(async () => {
    prevBypass = process.env.BYPASS_AUTH;
    process.env.BYPASS_AUTH = 'true';

    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bb-upload-e2e-'));
    dataDir = path.join(testDir, 'data');
    await fs.mkdir(dataDir, { recursive: true });
    await fs.mkdir(path.join(dataDir, '.civic'), { recursive: true });
    await fs.mkdir(path.join(dataDir, 'records'), { recursive: true });
    await fs.mkdir(path.join(testDir, '.system-data'), { recursive: true });
    execSync('git init', { cwd: dataDir, stdio: 'ignore' });
    execSync('git config user.name "Test"', { cwd: dataDir, stdio: 'ignore' });
    execSync('git config user.email "t@e.com"', {
      cwd: dataDir,
      stdio: 'ignore',
    });

    civic = new CivicPress({
      dataDir,
      database: {
        type: 'sqlite',
        sqlite: { file: path.join(testDir, '.system-data', 'test.db') },
      },
    });
    await civic.initialize();
    recordManager = civic.getRecordManager();

    setModuleResolver(new ModuleResolver(path.join(process.cwd(), 'modules')));
    vi.spyOn(CentralConfigManager, 'getModules').mockReturnValue([
      'broadcast-box',
    ]);
    RecordSchemaBuilder.clearCache();

    const express = (await import('express')).default;
    app = express();
    app.use(express.json());
    bbMount = await startInProcessBroadcastBox(civic, app, silentLogger, {
      enabled: true,
    });
  });

  afterEach(async () => {
    try {
      bbMount?.stop();
    } catch {
      /* ignore */
    }
    bbMount = null;
    vi.restoreAllMocks();
    RecordSchemaBuilder.clearCache();
    try {
      await civic?.shutdown();
    } catch {
      /* ignore */
    }
    if (prevBypass === undefined) delete process.env.BYPASS_AUTH;
    else process.env.BYPASS_AUTH = prevBypass;
    await new Promise((r) => setTimeout(r, 150));
    await fs.rm(testDir, { recursive: true, force: true }).catch(() => {});
  });

  async function readCapture(id: string): Promise<any> {
    const rec = await recordManager.getRecord(id);
    const md = readFileSync(path.join(dataDir, rec.path), 'utf-8');
    return frontmatter(md).capture;
  }

  it('uploads chunks + finalizes → writes capture.av_file onto the session record, retrievable from storage', async () => {
    expect(bbMount!.started).toBe(true);
    const container = civic.getContainer();

    // A session record + a device + a broadcast session linking them (what the
    // upload create/finalize chain looks up).
    await recordManager.createRecord(
      {
        title: 'Regular Council Meeting',
        type: 'session',
        content: '# Meeting',
        status: 'published',
        metadata: {},
      },
      SYSTEM_USER
    );
    const { records } = await recordManager.listRecords({ type: 'session' });
    const recordId = records[0].id;

    const deviceManager = container.resolve('broadcastBoxDeviceManager');
    const enrollment = await deviceManager.enrollDevice({ name: 'Cam' });
    const device = await deviceManager.registerDevice({
      deviceUuid: enrollment.deviceUuid,
      enrollmentCode: enrollment.enrollmentCode,
      name: 'Cam',
    });

    // Seed the broadcast_sessions row (createUpload reads device_id from it;
    // linkFileToSession maps its civicpress_session_id → the record).
    const sessionController: any = container.resolve(
      'broadcastBoxSessionController'
    );
    const bsId = crypto.randomUUID();
    await sessionController.sessionModel.create({
      id: bsId,
      deviceId: device.id,
      civicpressSessionId: recordId,
      status: 'recording',
      metadata: {},
    });

    // The A/V payload (one chunk) + its sha256 (finalize verifies the combined file).
    const av = Buffer.from('fake-mp4-bytes-for-the-upload-e2e');
    const fileHash = crypto.createHash('sha256').update(av).digest('hex');

    // 1. Create the upload job.
    const create = await request(app)
      .post('/api/v1/broadcast-box/uploads')
      .set('x-mock-user', MOCK_ADMIN)
      .send({
        sessionId: bsId,
        fileName: 'recording.mp4',
        fileSize: av.length,
        fileHash,
        mimeType: 'video/mp4',
      });
    expect(create.status).toBe(201);
    const uploadId = create.body.upload.id;
    expect(uploadId).toBeTruthy();

    // 2. Upload the single chunk (multipart field 'chunk').
    const chunk = await request(app)
      .post(`/api/v1/broadcast-box/uploads/${uploadId}/chunks`)
      .set('x-mock-user', MOCK_ADMIN)
      .field('chunkNumber', '0')
      .attach('chunk', av, 'chunk-0');
    expect(chunk.status).toBe(200);

    // 3. Finalize → hash check + store + recording:complete → linkFileToSession.
    const finalize = await request(app)
      .post(`/api/v1/broadcast-box/uploads/${uploadId}/finalize`)
      .set('x-mock-user', MOCK_ADMIN);
    expect(finalize.status).toBe(200);
    const storageFileId = finalize.body.storageLocation;
    expect(storageFileId).toBeTruthy();

    // The capture block lands on the record (via the recording:complete hook).
    const deadline = Date.now() + 3000;
    let capture: any = null;
    while (Date.now() < deadline) {
      const c = await readCapture(recordId);
      if (c?.av_file) {
        capture = c;
        break;
      }
      await new Promise((r) => setTimeout(r, 75));
    }
    expect(capture).not.toBeNull();
    expect(capture.av_file).toBe(storageFileId);
    expect(capture.device).toBe(device.id);

    // The stored A/V is retrievable from storage (what the transcription worker
    // would fetch via capture.av_file).
    const storage: any = civic.getService('storage');
    const stored = await storage.getFileContent(storageFileId);
    expect(Buffer.isBuffer(stored) ? stored : Buffer.from(stored)).toEqual(av);
  }, 20000);
});
