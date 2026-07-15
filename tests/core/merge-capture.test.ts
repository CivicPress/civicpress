/**
 * RecordManager.mergeCapture (FA-BB-002 E) — concurrency-safe field-level
 * capture merge against a REAL CivicPress (real saga + DB lock).
 *
 * The hazard under test: independent capture writers (upload finalize, device
 * manifest, redaction worker) each read-merge-write. Two stale snapshots
 * racing a shallow merge silently drop the other writer's fields — including
 * the security-critical `public_file`/`redaction_status` latch. mergeCapture
 * serializes them on a `capture:<id>` resource lock.
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

const SYSTEM_USER = { id: 1, username: 'system', role: 'admin' } as any;

describe('RecordManager.mergeCapture (real CivicPress)', () => {
  let testDir: string;
  let civic: any;
  let recordManager: any;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'merge-capture-'));
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

    setModuleResolver(
      new ModuleResolver(path.join(process.cwd(), 'modules'))
    );
    vi.spyOn(CentralConfigManager, 'getModules').mockReturnValue([
      'broadcast-box',
    ]);
    RecordSchemaBuilder.clearCache();
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

  async function seedSession(
    capture: Record<string, unknown> = {}
  ): Promise<string> {
    await recordManager.createRecord(
      {
        title: 'Council Meeting',
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

  async function readCapture(id: string): Promise<Record<string, any>> {
    const rec = await recordManager.getRecord(id);
    return rec.metadata?.capture ?? rec.capture ?? {};
  }

  it('field-merges onto the existing capture and returns the merged block', async () => {
    const id = await seedSession({ device: 'bb-001', duration_s: 90 });

    const merged = await recordManager.mergeCapture(
      id,
      { av_file: 'raw-1', redaction_status: 'pending' },
      SYSTEM_USER
    );

    expect(merged).toMatchObject({
      device: 'bb-001',
      duration_s: 90,
      av_file: 'raw-1',
      redaction_status: 'pending',
    });
    expect(await readCapture(id)).toMatchObject({
      device: 'bb-001',
      av_file: 'raw-1',
      redaction_status: 'pending',
    });
  });

  it('a declined precondition writes nothing and returns null', async () => {
    const id = await seedSession({
      device: 'bb-001',
      redaction_status: 'complete',
      public_file: 'verified-public',
    });

    const result = await recordManager.mergeCapture(
      id,
      { public_file: 'clobber-attempt', redaction_status: 'complete' },
      SYSTEM_USER,
      { precondition: (c: any) => c.redaction_status !== 'complete' }
    );

    expect(result).toBeNull();
    expect((await readCapture(id)).public_file).toBe('verified-public');
  });

  it('appendAttachedFile lands atomically with the capture patch (once)', async () => {
    const id = await seedSession({ device: 'bb-001', av_file: 'raw-1' });
    const entry = {
      id: 'public-1',
      path: '/api/v1/storage/files/public-1',
      original_name: 'recording-public.mp4',
      category: 'Recording',
    };

    await recordManager.mergeCapture(
      id,
      { public_file: 'public-1', redaction_status: 'complete' },
      SYSTEM_USER,
      { appendAttachedFile: entry }
    );
    // Second call must not duplicate the attachment.
    await recordManager.mergeCapture(
      id,
      { redaction_status: 'complete' },
      SYSTEM_USER,
      { appendAttachedFile: entry }
    );

    const rec = await recordManager.getRecord(id);
    const attached = (rec.attachedFiles ?? []).filter(
      (f: any) => f.id === 'public-1'
    );
    expect(attached).toHaveLength(1);
    expect((await readCapture(id)).public_file).toBe('public-1');
  });

  it('CONCURRENCY: racing writers each keep their fields (no stale-snapshot clobber)', async () => {
    const id = await seedSession({ device: 'bb-001' });

    // The FA-BB-002 E scenario: the manifest write (segments) races the
    // redaction latch (public_file + complete). With naive read-merge-write,
    // whichever writer read the stale snapshot clobbers the other's fields.
    const results = await Promise.allSettled([
      recordManager.mergeCapture(
        id,
        {
          segments: [{ start: 0, end: 60, visibility: 'public' }],
          duration_s: 60,
        },
        SYSTEM_USER
      ),
      recordManager.mergeCapture(
        id,
        { public_file: 'public-1', redaction_status: 'complete' },
        SYSTEM_USER
      ),
      recordManager.mergeCapture(id, { av_file: 'raw-1' }, SYSTEM_USER),
    ]);

    for (const r of results) {
      expect(r.status).toBe('fulfilled');
    }

    const capture = await readCapture(id);
    // EVERY writer's fields survived.
    expect(capture.segments).toHaveLength(1);
    expect(capture.duration_s).toBe(60);
    expect(capture.public_file).toBe('public-1');
    expect(capture.redaction_status).toBe('complete');
    expect(capture.av_file).toBe('raw-1');
    expect(capture.device).toBe('bb-001');
  }, 30_000);

  it('throws for a missing record', async () => {
    await expect(
      recordManager.mergeCapture('does-not-exist', { a: 1 }, SYSTEM_USER)
    ).rejects.toThrow(/Record not found/);
  });
});
