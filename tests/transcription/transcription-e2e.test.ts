/**
 * W2 Step 3/4 — transcription write-back e2e against a REAL CivicPress.
 *
 * Closes the design-doc §10.5 open item: a structured transcript written through
 * the worker → CoreRecordsGateway → RecordManager.updateRecord (the published
 * saga + validator) lands as the EXPECTED top-level YAML on the `session` record:
 *   - `transcript_status: automated` TOP-LEVEL (broadcast-box extension field,
 *     lifted by the core serializer fix 41adfb1) — NOT nested under `metadata:`.
 *   - the structured transcript under `media.transcript_data` (since core
 *     `media.transcript` is string-typed; the validator rejects an object there).
 *
 * Two tiers:
 *   - a deterministic stub-engine test (always runs) — the write-path proof;
 *   - a real whisper.cpp pipeline test (env-gated WHISPER_CPP_BIN/MODEL/SAMPLE).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { execSync } from 'node:child_process';
import yaml from 'js-yaml';

import { CivicPress } from '@civicpress/core';
import { initializeStorageService } from '../../modules/storage/dist/index.js';
import { CentralConfigManager } from '../../core/dist/config/central-config.js';
import {
  RecordSchemaBuilder,
  setModuleResolver,
} from '../../core/dist/records/record-schema-builder.js';
import { ModuleResolver } from '../../core/dist/modules/module-resolver.js';
import {
  TranscriptionWorker,
  CoreRecordsGateway,
  WhisperCppEngine,
} from '../../services/transcription/src/index.js';

const MODULES_ROOT = path.join(process.cwd(), 'modules');
const SYSTEM_USER = { id: 1, username: 'system', role: 'admin' };
const silentLogger = {
  info() {},
  warn() {},
  error() {},
  debug() {},
};

// A canned engine so the write-path test is deterministic + env-free.
class StubEngine {
  readonly name = 'stub';
  constructor(private readonly result: any) {}
  async available() {
    return true;
  }
  async transcribe() {
    return this.result;
  }
}

// Like StubEngine, but records the transcribe() input so a test can assert which
// public ranges the worker passed (in-camera exclusion is computed there).
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

describe('transcription write-back e2e (real CivicPress)', () => {
  let testDir: string;
  let civic: any;
  let recordManager: any;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'transcription-e2e-'));
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

    // Enable broadcast-box so the serializer lifts transcript_status top-level
    // and the validator merges the extension (the real module fragment).
    // NOTE: must run AFTER initialize() — civic-core-services calls
    // setModuleResolver() at startup and would otherwise overwrite this.
    setModuleResolver(new ModuleResolver(MODULES_ROOT));
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
    await fs.rm(testDir, { recursive: true, force: true }).catch(() => {});
  });

  async function seedRecordedSession(
    segments?: Array<{ start: number; end: number; visibility: string }>,
    avFile = 'av-uuid-1'
  ): Promise<string> {
    await recordManager.createRecord(
      {
        title: 'Regular Council Meeting',
        type: 'session',
        content: '# Meeting',
        status: 'published',
        metadata: {
          media: { recording: 'rec-uuid' },
          capture: {
            device: 'bb-001',
            av_file: avFile,
            ...(segments ? { segments } : {}),
          },
        },
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

  it('seeded session is found by the derived scan (capture.av_file, no transcript_status)', async () => {
    const id = await seedRecordedSession();
    const gateway = new CoreRecordsGateway({
      records: recordManager,
      storage: {
        async getFileContent() {
          return Buffer.from('x');
        },
      },
    });
    const needing = await gateway.findNeedingTranscription();
    expect(needing.map((s: any) => s.id)).toContain(id);
  });

  it('writes transcript_status + media.transcript_data as TOP-LEVEL YAML via the real saga', async () => {
    const id = await seedRecordedSession();
    const transcript = {
      language: 'fr',
      text: 'Bonjour le conseil municipal.',
      segments: [{ start: 0, end: 1.8, text: 'Bonjour le conseil municipal.' }],
    };
    const gateway = new CoreRecordsGateway({
      records: recordManager,
      storage: {
        async getFileContent() {
          return Buffer.from('x');
        },
      },
    });
    const worker = new TranscriptionWorker({
      records: gateway,
      engine: new StubEngine(transcript) as any,
      logger: silentLogger,
      language: 'fr-CA',
    });

    const summary = await worker.runOnce();
    expect(summary).toEqual({ processed: 1, skipped: 0, failed: 0 });

    const fm = await readFrontmatter(id);
    // transcript_status lifted TOP-LEVEL, not nested under metadata:
    expect(fm.transcript_status).toBe('automated');
    expect(fm.metadata?.transcript_status).toBeUndefined();
    // structured transcript under media.transcript_data; existing media kept
    expect(fm.media.transcript_data).toMatchObject(transcript);
    expect(fm.media.recording).toBe('rec-uuid');
    // capture block still intact + top-level
    expect(fm.capture.av_file).toBe('av-uuid-1');
  });

  it('renders + stores a WebVTT artifact and sets media.transcript to its path', async () => {
    const id = await seedRecordedSession();
    const transcript = {
      language: 'fr',
      text: 'Bonjour le conseil.',
      segments: [{ start: 0, end: 1.8, text: 'Bonjour le conseil.' }],
    };
    // Storage that ALSO supports uploadFile (the real CloudUuidStorageService
    // does); capture what the gateway stores.
    const uploaded: {
      buffer: Buffer;
      folder: string;
      originalname: string;
      mimetype: string;
    } = {} as any;
    const storage = {
      async getFileContent() {
        return Buffer.from('x');
      },
      async uploadFile(req: any) {
        // The gateway now passes a multer-style file (not a raw Buffer).
        uploaded.buffer = req.file.buffer;
        uploaded.folder = req.folder;
        uploaded.originalname = req.file.originalname;
        uploaded.mimetype = req.file.mimetype;
        return { success: true, file: { id: 'vtt-uuid-1' } };
      },
    };
    const gateway = new CoreRecordsGateway({ records: recordManager, storage });
    const worker = new TranscriptionWorker({
      records: gateway,
      engine: new StubEngine(transcript) as any,
      logger: silentLogger,
      language: 'fr-CA',
    });

    expect((await worker.runOnce()).processed).toBe(1);

    const fm = await readFrontmatter(id);
    // The string artifact path is set alongside the structured data.
    expect(fm.media.transcript).toBe('/api/v1/storage/files/vtt-uuid-1');
    expect(fm.media.transcript_data).toMatchObject(transcript);
    // The stored bytes are valid WebVTT for this transcript.
    const vtt = uploaded.buffer.toString('utf-8');
    expect(vtt.startsWith('WEBVTT')).toBe(true);
    expect(vtt).toContain('00:00:00.000 --> 00:00:01.800');
    expect(vtt).toContain('Bonjour le conseil.');
    expect(uploaded.folder).toBe('transcripts');
    // a .vtt multer file the `transcripts` folder accepts (text/vtt)
    expect(uploaded.originalname).toMatch(/\.vtt$/);
    expect(uploaded.mimetype).toBe('text/vtt');
  });

  it('REAL STORAGE: stores the WebVTT artifact via CloudUuidStorageService and it is retrievable', async () => {
    // Exercise the REAL storage service (not a fake uploadFile) so the
    // raw-Buffer → multer-file → validate(.vtt) → store path is proven end to
    // end (CloudUuidStorageService rejects raw Buffers + validates by extension).
    const storage: any = civic.getService('storage');
    await initializeStorageService(storage);

    // Put a fake A/V in real storage so prepareAudio (getFileContent) succeeds.
    const av = Buffer.from('fake-av-bytes-for-transcript-artifact-e2e');
    const avRes = await storage.uploadFile({
      file: {
        fieldname: 'file',
        originalname: 'recording.mp4',
        encoding: '7bit',
        mimetype: 'video/mp4',
        size: av.length,
        destination: '',
        filename: '',
        path: '',
        buffer: av,
      },
      folder: 'recordings',
      uploaded_by: 'system',
    });
    expect(avRes.success).toBe(true);
    const avUuid = avRes.file.id;

    const id = await seedRecordedSession(undefined, avUuid);
    const transcript = {
      language: 'fr',
      text: 'Bonjour le conseil municipal.',
      segments: [{ start: 0, end: 1.8, text: 'Bonjour le conseil municipal.' }],
    };
    const gateway = new CoreRecordsGateway({
      records: recordManager,
      storage,
      logger: silentLogger,
    });
    const worker = new TranscriptionWorker({
      records: gateway,
      engine: new StubEngine(transcript) as any,
      logger: silentLogger,
      language: 'fr-CA',
    });

    expect((await worker.runOnce()).processed).toBe(1);

    const fm = await readFrontmatter(id);
    expect(fm.media.transcript).toMatch(/^\/api\/v1\/storage\/files\//);
    expect(fm.media.transcript_data).toMatchObject(transcript);

    // Fetch the stored artifact back from REAL storage and validate it.
    const vttUuid = String(fm.media.transcript).split('/').pop()!;
    const stored = await storage.getFileContent(vttUuid);
    const vtt = (Buffer.isBuffer(stored) ? stored : Buffer.from(stored)).toString(
      'utf-8'
    );
    expect(vtt.startsWith('WEBVTT')).toBe(true);
    expect(vtt).toContain('00:00:00.000 --> 00:00:01.800');
    expect(vtt).toContain('Bonjour le conseil municipal.');
  }, 20000);

  it('still writes transcript_data when storage cannot store the artifact (no media.transcript)', async () => {
    const id = await seedRecordedSession();
    const transcript = { language: 'fr', text: 'x', segments: [] };
    // uploadFile reports failure → graceful degradation.
    const storage = {
      async getFileContent() {
        return Buffer.from('x');
      },
      async uploadFile() {
        return { success: false, error: 'storage down' };
      },
    };
    const gateway = new CoreRecordsGateway({ records: recordManager, storage });
    const worker = new TranscriptionWorker({
      records: gateway,
      engine: new StubEngine(transcript) as any,
      logger: silentLogger,
    });

    expect((await worker.runOnce()).processed).toBe(1);

    const fm = await readFrontmatter(id);
    expect(fm.transcript_status).toBe('automated');
    expect(fm.media.transcript_data).toMatchObject(transcript);
    expect(fm.media.transcript).toBeUndefined();
  });

  it('excludes in-camera segments — the engine transcribes only the public ranges', async () => {
    // Mixed-visibility capture: the middle segment is in-camera (closed) and must
    // be excluded; the worker passes only the public windows to the engine.
    const id = await seedRecordedSession([
      { start: 0, end: 5, visibility: 'public' },
      { start: 5, end: 10, visibility: 'in_camera' },
      { start: 10, end: 15, visibility: 'public' },
    ]);
    const transcript = {
      language: 'fr',
      text: 'public only',
      segments: [{ start: 0, end: 5, text: 'public only' }],
    };
    const engine = new CapturingStubEngine(transcript);
    const gateway = new CoreRecordsGateway({
      records: recordManager,
      storage: {
        async getFileContent() {
          return Buffer.from('x');
        },
      },
    });
    const worker = new TranscriptionWorker({
      records: gateway,
      engine: engine as any,
      logger: silentLogger,
      language: 'fr-CA',
    });

    const summary = await worker.runOnce();
    expect(summary).toEqual({ processed: 1, skipped: 0, failed: 0 });

    // The civic-critical assertion: the in-camera window (5–10s) never reaches
    // the engine — only the two public ranges do.
    expect(engine.lastInput.publicRanges).toEqual([
      { start: 0, end: 5 },
      { start: 10, end: 15 },
    ]);

    const fm = await readFrontmatter(id);
    expect(fm.transcript_status).toBe('automated');
    expect(fm.media.transcript_data).toMatchObject(transcript);
  });

  it('a fully in-camera session is skipped — no transcript is written', async () => {
    const id = await seedRecordedSession([
      { start: 0, end: 8, visibility: 'in_camera' },
      { start: 8, end: 16, visibility: 'in_camera' },
    ]);
    const engine = new CapturingStubEngine({
      language: 'fr',
      text: 'should never run',
      segments: [],
    });
    const gateway = new CoreRecordsGateway({
      records: recordManager,
      storage: {
        async getFileContent() {
          return Buffer.from('x');
        },
      },
    });
    const worker = new TranscriptionWorker({
      records: gateway,
      engine: engine as any,
      logger: silentLogger,
    });

    const summary = await worker.runOnce();
    expect(summary).toEqual({ processed: 0, skipped: 1, failed: 0 });
    // The engine was never invoked, and the record stays untranscribed (so a
    // later segment correction could re-open it).
    expect(engine.lastInput).toBeNull();
    const fm = await readFrontmatter(id);
    expect(fm.transcript_status).toBeUndefined();
  });

  it('is idempotent — a second cycle re-picks nothing', async () => {
    await seedRecordedSession();
    const gateway = new CoreRecordsGateway({
      records: recordManager,
      storage: {
        async getFileContent() {
          return Buffer.from('x');
        },
      },
    });
    const worker = new TranscriptionWorker({
      records: gateway,
      engine: new StubEngine({
        language: 'fr',
        text: 'x',
        segments: [],
      }) as any,
      logger: silentLogger,
    });
    expect((await worker.runOnce()).processed).toBe(1);
    expect((await worker.runOnce()).processed).toBe(0);
  });

  const BIN = process.env.WHISPER_CPP_BIN;
  const MODEL = process.env.WHISPER_CPP_MODEL;
  const SAMPLE = process.env.WHISPER_CPP_SAMPLE;
  const haveWhisper = Boolean(BIN && MODEL && SAMPLE);

  it.skipIf(!haveWhisper)(
    'full pipeline with REAL whisper.cpp: A/V → transcript on the record',
    async () => {
      const id = await seedRecordedSession();
      const avBytes = readFileSync(SAMPLE!); // English JFK sample
      const gateway = new CoreRecordsGateway({
        records: recordManager,
        storage: {
          async getFileContent() {
            return avBytes;
          },
        },
      });
      const engine = new WhisperCppEngine({ binary: BIN!, model: MODEL! });
      const worker = new TranscriptionWorker({
        records: gateway,
        engine,
        logger: silentLogger,
        language: 'en', // the sample is English
      });

      const summary = await worker.runOnce();
      expect(summary.processed).toBe(1);

      const fm = await readFrontmatter(id);
      expect(fm.transcript_status).toBe('automated');
      const td = fm.media.transcript_data;
      expect(td.segments.length).toBeGreaterThan(0);
      expect(JSON.stringify(td).toLowerCase()).toContain('country');
    },
    120_000
  );

  it('LAUNCHER: startInProcessTranscription runs the worker against real CivicPress', async () => {
    const id = await seedRecordedSession();
    const transcript = {
      language: 'fr',
      text: 'Bonjour.',
      segments: [{ start: 0, end: 1, text: 'Bonjour.' }],
    };
    const { startInProcessTranscription } =
      await import('../../modules/api/src/transcription-bootstrap.js');
    // Large poll interval: start() runs runOnce() ONCE immediately, then sleeps —
    // so the test observes a single write with no overlapping-cycle DB churn.
    const { worker, started } = await startInProcessTranscription(
      civic,
      { enabled: true, poll_interval_ms: 60_000 },
      silentLogger,
      {
        engine: new StubEngine(transcript) as any,
        storage: {
          async getFileContent() {
            return Buffer.from('x');
          },
        },
      }
    );
    expect(started).toBe(true);
    try {
      const deadline = Date.now() + 4000;
      let done = false;
      while (Date.now() < deadline) {
        const fm = await readFrontmatter(id);
        if (fm.transcript_status === 'automated') {
          expect(fm.media.transcript_data).toMatchObject(transcript);
          done = true;
          break;
        }
        await new Promise((r) => setTimeout(r, 50));
      }
      expect(done).toBe(true);
    } finally {
      worker?.stop();
      // Let the write-back saga finish its bookkeeping before afterEach closes
      // the DB (avoids benign teardown-race log noise).
      await new Promise((r) => setTimeout(r, 300));
    }
  });
});
