/**
 * BroadcastBox Phase 5 — R3 + device-token auth: real HTTP chunked-upload.
 *
 * Drives the actual device upload endpoints against the mounted module with a
 * REAL storage service (no mocks):
 *   POST /uploads → POST /uploads/:id/chunks → POST /uploads/:id/finalize
 * On finalize the combined A/V is hashed, stored, and `recording:complete` is
 * emitted → linkFileToSession writes the `capture` block onto the CivicPress
 * session record. Proves the A/V upload half of the device↔CP integration.
 *
 * Auth: the uploads routes are a device surface, authenticated by the device's
 * own bearer token (the same credential as the device WebSocket) — NOT a user
 * session. The happy path mints a real device token (enroll → register →
 * generateToken) and sends `Authorization: Bearer <token>`; the suite also
 * proves an unauthenticated upload is rejected (401) and that a device cannot
 * touch another device's session/upload (403). Storage uses its default local
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
  let container: any;
  let app: any;
  let bbMount: { started: boolean; stop: () => void } | null = null;

  beforeEach(async () => {
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
    container = civic.getContainer();

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
    await new Promise((r) => setTimeout(r, 150));
    await fs.rm(testDir, { recursive: true, force: true }).catch(() => {});
  });

  /** Create a `session` core record and return its id. */
  async function createSessionRecord(
    title = 'Regular Council Meeting'
  ): Promise<string> {
    await recordManager.createRecord(
      {
        title,
        type: 'session',
        content: '# Meeting',
        status: 'published',
        metadata: {},
      },
      SYSTEM_USER
    );
    const { records } = await recordManager.listRecords({ type: 'session' });
    return records[0].id;
  }

  /** Run the real BB-HW-013 onboarding (enroll → register → token). */
  async function onboardDevice(
    name: string
  ): Promise<{ device: any; token: string }> {
    const deviceManager = container.resolve('broadcastBoxDeviceManager');
    const deviceAuth = container.resolve('broadcastBoxDeviceAuth');
    const enrollment = await deviceManager.enrollDevice({ name });
    const device = await deviceManager.registerDevice({
      deviceUuid: enrollment.deviceUuid,
      enrollmentCode: enrollment.enrollmentCode,
      name,
    });
    const { token } = await deviceAuth.generateToken({
      deviceId: device.id,
      deviceUuid: device.deviceUuid,
      organizationId: device.organizationId,
    });
    return { device, token };
  }

  /** Seed the broadcast_sessions row that links a device → a CivicPress record. */
  async function seedSession(
    deviceId: string,
    recordId: string
  ): Promise<string> {
    const sessionController: any = container.resolve(
      'broadcastBoxSessionController'
    );
    const bsId = crypto.randomUUID();
    await sessionController.sessionModel.create({
      id: bsId,
      deviceId,
      civicpressSessionId: recordId,
      status: 'recording',
      metadata: {},
    });
    return bsId;
  }

  async function readCapture(id: string): Promise<any> {
    const rec = await recordManager.getRecord(id);
    const md = readFileSync(path.join(dataDir, rec.path), 'utf-8');
    return frontmatter(md).capture;
  }

  it('uploads chunks + finalizes with a real device token → writes capture.av_file onto the session record, retrievable from storage', async () => {
    expect(bbMount!.started).toBe(true);

    const recordId = await createSessionRecord();
    const { device, token } = await onboardDevice('Cam');
    // The broadcast session links this device to the record (createUpload reads
    // device_id from it; linkFileToSession maps civicpress_session_id → record).
    const bsId = await seedSession(device.id, recordId);

    // The A/V payload (one chunk) + its sha256 (finalize verifies the combined file).
    const av = Buffer.from('fake-mp4-bytes-for-the-upload-e2e');
    const fileHash = crypto.createHash('sha256').update(av).digest('hex');

    // 1. Create the upload job (authenticated as the device).
    const create = await request(app)
      .post('/api/v1/broadcast-box/uploads')
      .set('Authorization', `Bearer ${token}`)
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
      .set('Authorization', `Bearer ${token}`)
      .field('chunkNumber', '0')
      .attach('chunk', av, 'chunk-0');
    expect(chunk.status).toBe(200);

    // 3. Finalize → hash check + store + recording:complete → linkFileToSession.
    const finalize = await request(app)
      .post(`/api/v1/broadcast-box/uploads/${uploadId}/finalize`)
      .set('Authorization', `Bearer ${token}`);
    expect(finalize.status).toBe(200);
    const storageFileId = finalize.body.storageLocation;
    expect(storageFileId).toBeTruthy();

    // The device can read back its own upload status.
    const status = await request(app)
      .get(`/api/v1/broadcast-box/uploads/${uploadId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(status.status).toBe(200);
    expect(status.body.upload.status).toBe('complete');

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
    // FA-BB-002 fail-closed: the raw is queued for redaction, not published.
    // finalize deterministically writes public_file: null (a field-merge must
    // actively CLEAR any prior published pointer on re-record), so assert null —
    // still falsy, so no unredacted bytes are ever served.
    expect(capture.redaction_status).toBe('pending');
    expect(capture.public_file).toBeNull();

    // The stored A/V is retrievable from storage (what the transcription worker
    // would fetch via capture.av_file)…
    const storage: any = civic.getService('storage');
    const stored = await storage.getFileContent(storageFileId);
    expect(Buffer.isBuffer(stored) ? stored : Buffer.from(stored)).toEqual(av);
    // …and it lives in the PRIVATE recordings_raw folder (FA-BB-002).
    const rawInfo = await storage.getFileById(storageFileId);
    expect(rawInfo?.folder).toBe('recordings_raw');
  }, 20000);

  it('FA-BB-003: rejects a traversal fileName over the wire (400)', async () => {
    const recordId = await createSessionRecord();
    const { device, token } = await onboardDevice('Cam Traversal');
    const bsId = await seedSession(device.id, recordId);

    for (const fileName of ['../../../.civic/hooks.yml', 'a/b.mp4', '..']) {
      const res = await request(app)
        .post('/api/v1/broadcast-box/uploads')
        .set('Authorization', `Bearer ${token}`)
        .send({
          sessionId: bsId,
          fileName,
          fileSize: 10,
          fileHash: 'abc',
          mimeType: 'video/mp4',
        });
      expect(res.status).toBe(400);
    }
  });

  it('rejects an upload with no device token (401)', async () => {
    const res = await request(app)
      .post('/api/v1/broadcast-box/uploads')
      .send({
        sessionId: crypto.randomUUID(),
        fileName: 'recording.mp4',
        fileSize: 10,
        fileHash: 'abc',
        mimeType: 'video/mp4',
      });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('rejects cross-device access (403 — a device cannot touch another device’s session or upload)', async () => {
    const recordId = await createSessionRecord();
    const { device: deviceA, token: tokenA } = await onboardDevice('Cam A');
    const { token: tokenB } = await onboardDevice('Cam B');
    const bsA = await seedSession(deviceA.id, recordId);

    const av = Buffer.from('device-a-only-bytes');
    const fileHash = crypto.createHash('sha256').update(av).digest('hex');

    // Device B may not create an upload for device A's session.
    const crossCreate = await request(app)
      .post('/api/v1/broadcast-box/uploads')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({
        sessionId: bsA,
        fileName: 'recording.mp4',
        fileSize: av.length,
        fileHash,
        mimeType: 'video/mp4',
      });
    expect(crossCreate.status).toBe(403);

    // Device A creates + chunks its own upload.
    const create = await request(app)
      .post('/api/v1/broadcast-box/uploads')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        sessionId: bsA,
        fileName: 'recording.mp4',
        fileSize: av.length,
        fileHash,
        mimeType: 'video/mp4',
      });
    expect(create.status).toBe(201);
    const uploadId = create.body.upload.id;

    const chunk = await request(app)
      .post(`/api/v1/broadcast-box/uploads/${uploadId}/chunks`)
      .set('Authorization', `Bearer ${tokenA}`)
      .field('chunkNumber', '0')
      .attach('chunk', av, 'chunk-0');
    expect(chunk.status).toBe(200);

    // Device B may neither finalize nor read device A's upload.
    const crossFinalize = await request(app)
      .post(`/api/v1/broadcast-box/uploads/${uploadId}/finalize`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(crossFinalize.status).toBe(403);

    const crossGet = await request(app)
      .get(`/api/v1/broadcast-box/uploads/${uploadId}`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(crossGet.status).toBe(403);
  }, 20000);
});
