/**
 * FA-BB-002 Commit F — backfill e2e against REAL CivicPress records + storage.
 *
 * Seeds the pre-redaction world: raw uploads sitting in the PUBLIC
 * `recordings` folder, attached to their session records; plus one
 * worker-published redacted variant and one orphan. Asserts the backfill:
 *   - moves every raw (referenced + orphan) into private `recordings_raw`
 *     with identical bytes and deletes the public object;
 *   - re-latches referencing sessions to redaction_status:'pending' with the
 *     new av_file, and strips the stale public attachment;
 *   - keeps worker-published redacted variants (capture.public_file) publicly
 *     served.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { execSync } from 'node:child_process';
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
import { backfillPublicRaws } from '../../modules/broadcast-box/dist/index.js';
import { initializeStorageService } from '../../modules/storage/dist/index.js';

const SYSTEM_USER = { id: 1, username: 'system', role: 'admin' } as any;
const silentLogger = {
  info() {},
  warn() {},
  error() {},
  debug() {},
} as any;

describe('recordings backfill e2e (real records + storage)', () => {
  let testDir: string;
  let civic: any;
  let recordManager: any;
  let storage: any;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bb-backfill-e2e-'));
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

    setModuleResolver(new ModuleResolver(path.join(process.cwd(), 'modules')));
    vi.spyOn(CentralConfigManager, 'getModules').mockReturnValue([
      'broadcast-box',
    ]);
    RecordSchemaBuilder.clearCache();

    storage = civic.getService('storage');
    await initializeStorageService(storage);
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

  async function uploadTo(folder: string, name: string, bytes: Buffer) {
    const res = await storage.uploadFile({
      file: {
        fieldname: 'file',
        originalname: name,
        encoding: '7bit',
        mimetype: 'video/mp4',
        size: bytes.length,
        destination: '',
        filename: '',
        path: '',
        buffer: bytes,
      },
      folder,
      uploaded_by: 'system',
    });
    expect(res.success).toBe(true);
    return res.file.id as string;
  }

  async function seedSession(
    title: string,
    capture: Record<string, unknown>,
    attachedFiles: any[] = []
  ): Promise<string> {
    await recordManager.createRecord(
      {
        title,
        type: 'session',
        content: '# Meeting',
        status: 'published',
        metadata: { capture },
        attachedFiles,
      },
      SYSTEM_USER
    );
    const { records } = await recordManager.listRecords({ type: 'session' });
    const rec = records.find((r: any) => r.title === title);
    expect(rec).toBeTruthy();
    return rec.id;
  }

  it('re-homes public raws (referenced + orphan), keeps redacted variants', async () => {
    // Pre-redaction world: a raw in the PUBLIC folder, attached to a session.
    const rawBytes = Buffer.from('raw-in-camera-bearing-recording-bytes');
    const rawId = await uploadTo('recordings', 'meeting-raw.mp4', rawBytes);
    const sessionId = await seedSession(
      'Pre-redaction meeting',
      { device: 'bb-001', av_file: rawId },
      [
        {
          id: rawId,
          path: `/api/v1/storage/files/${rawId}`,
          original_name: 'meeting-raw.mp4',
          description: 'Session recording',
          category: 'Recording',
        },
      ]
    );

    // A worker-published redacted variant (must be KEPT public).
    const redactedId = await uploadTo(
      'recordings',
      'meeting-redacted.mp4',
      Buffer.from('verified-redacted-bytes')
    );
    await seedSession('Redacted meeting', {
      device: 'bb-001',
      av_file: 'already-private-raw',
      public_file: redactedId,
      redaction_status: 'complete',
    });

    // An orphan raw in the public folder (no session references it).
    const orphanId = await uploadTo(
      'recordings',
      'orphan.mp4',
      Buffer.from('orphan-raw-bytes')
    );

    const summary = await backfillPublicRaws({
      records: recordManager,
      storage,
      logger: silentLogger,
    });

    expect(summary.errors).toBe(0);
    expect(summary.moved).toBe(2); // referenced raw + orphan
    expect(summary.keptRedacted).toBe(1);

    // The referenced raw: gone from public, re-homed privately, same bytes.
    expect(await storage.getFileById(rawId)).toBeNull();
    const record = await recordManager.getRecord(sessionId);
    const capture = record.metadata?.capture ?? record.capture;
    expect(capture.av_file).not.toBe(rawId);
    expect(capture.redaction_status).toBe('pending');
    const moved = await storage.getFileById(capture.av_file);
    expect(moved.folder).toBe('recordings_raw');
    const movedBytes = await storage.getFileContent(capture.av_file);
    expect(
      Buffer.compare(
        Buffer.isBuffer(movedBytes) ? movedBytes : Buffer.from(movedBytes),
        rawBytes
      )
    ).toBe(0);
    // The stale public attachment is stripped.
    expect(
      (record.attachedFiles ?? []).some((f: any) => f.id === rawId)
    ).toBe(false);

    // The orphan is also moved (fail-closed: unverified = raw).
    expect(await storage.getFileById(orphanId)).toBeNull();

    // The redacted variant stays put and publicly located.
    const kept = await storage.getFileById(redactedId);
    expect(kept.folder).toBe('recordings');

    // The public folder now holds ONLY the worker-published variant.
    const publicFiles = await storage.listFiles('recordings');
    expect(publicFiles.map((f: any) => f.id)).toEqual([redactedId]);
  }, 60_000);

  it('is idempotent — a second run moves nothing', async () => {
    const rawId = await uploadTo(
      'recordings',
      'raw.mp4',
      Buffer.from('raw-bytes')
    );
    await seedSession('Meeting', { device: 'bb-001', av_file: rawId });

    const first = await backfillPublicRaws({
      records: recordManager,
      storage,
      logger: silentLogger,
    });
    expect(first.moved).toBe(1);

    const second = await backfillPublicRaws({
      records: recordManager,
      storage,
      logger: silentLogger,
    });
    expect(second.moved).toBe(0);
    expect(second.errors).toBe(0);
  }, 60_000);
});
