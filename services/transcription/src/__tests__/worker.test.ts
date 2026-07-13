import { describe, it, expect, vi } from 'vitest';
import { TranscriptionWorker } from '../worker.js';
import { NoopEngine } from '../engines/noop.js';
import type {
  RecordsGateway,
  SessionForTranscription,
  TranscriptionEngine,
  TranscriptResult,
} from '../types.js';

const silentLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

const TRANSCRIPT: TranscriptResult = {
  language: 'fr-CA',
  text: 'bonjour le conseil',
  segments: [{ start: 0, end: 2, text: 'bonjour le conseil' }],
};

/** In-memory RecordsGateway whose write sets the latch (so the session leaves the scan). */
class FakeGateway implements RecordsGateway {
  readonly prepared: string[] = [];
  readonly writes: Array<{ id: string; status: string; transcript: TranscriptResult }> = [];

  constructor(public sessions: SessionForTranscription[]) {}

  async findNeedingTranscription(): Promise<SessionForTranscription[]> {
    return this.sessions.filter((s) => s.capture?.av_file && !s.transcript_status);
  }
  async getSession(id: string): Promise<SessionForTranscription | null> {
    return this.sessions.find((s) => s.id === id) ?? null;
  }
  async prepareAudio(session: SessionForTranscription) {
    this.prepared.push(session.id);
    return { path: `/tmp/${session.id}.wav` };
  }
  async writeTranscript(
    id: string,
    payload: { transcript: TranscriptResult; status: 'automated' }
  ): Promise<void> {
    this.writes.push({ id, status: payload.status, transcript: payload.transcript });
    const s = this.sessions.find((x) => x.id === id);
    if (s) s.transcript_status = payload.status; // the latch
  }
}

function mockEngine(
  opts: { available?: boolean; result?: TranscriptResult; throws?: boolean } = {}
): TranscriptionEngine {
  return {
    name: 'mock',
    available: vi.fn(async () => opts.available ?? true),
    transcribe: vi.fn(async () => {
      if (opts.throws) throw new Error('engine boom');
      return opts.result ?? TRANSCRIPT;
    }),
  };
}

// An attested all-public session (FA-BB-002: absent segments alone now HOLD,
// so the baseline "transcribe everything" case needs the positive attestation).
const needs = (extra: Partial<SessionForTranscription> = {}): SessionForTranscription => ({
  id: 'pv-2026-06-09',
  capture: { device: 'bb-001', av_file: 'uuid-av-1', all_public: true },
  ...extra,
});

function worker(records: RecordsGateway, engine: TranscriptionEngine) {
  return new TranscriptionWorker({ records, engine, logger: silentLogger });
}

describe('TranscriptionWorker.runOnce', () => {
  it('transcribes a needing session and writes media.transcript + automated', async () => {
    const gw = new FakeGateway([needs()]);
    const engine = mockEngine();
    const summary = await worker(gw, engine).runOnce();

    expect(summary).toEqual({ processed: 1, skipped: 0, failed: 0 });
    expect(engine.transcribe).toHaveBeenCalledOnce();
    expect(gw.writes).toEqual([
      { id: 'pv-2026-06-09', status: 'automated', transcript: TRANSCRIPT },
    ]);
  });

  it('passes only the public ranges to the engine, shrunk by the skew padding', async () => {
    const gw = new FakeGateway([
      needs({
        capture: {
          device: 'bb-001',
          av_file: 'uuid-av-1',
          segments: [
            { start: 0, end: 7000, visibility: 'public' },
            { start: 7000, end: 7440, visibility: 'in_camera' },
          ],
        },
      }),
    ]);
    const engine = mockEngine();
    await worker(gw, engine).runOnce();

    // The hidden window [7000,7440] is padded (default lead 3s) so the public
    // range shrinks to [0,6997] — content near the closed boundary never leaks.
    expect(engine.transcribe).toHaveBeenCalledWith(
      expect.objectContaining({ publicRanges: [{ start: 0, end: 6997 }] })
    );
  });

  it('HOLDS a session with no segments and no attestation (FA-BB-002 fail-closed)', async () => {
    const gw = new FakeGateway([
      needs({ capture: { device: 'bb-001', av_file: 'uuid-av-1' } }),
    ]);
    const engine = mockEngine();
    const summary = await worker(gw, engine).runOnce();

    expect(summary).toEqual({ processed: 0, skipped: 1, failed: 0 });
    expect(engine.transcribe).not.toHaveBeenCalled();
    expect(gw.writes).toEqual([]);
    // No latch was written — the session stays pollable for when the manifest lands.
    expect(await gw.findNeedingTranscription()).toHaveLength(1);
  });

  it('HOLDS a session with empty segments ([] is UNKNOWN, not all-public)', async () => {
    const gw = new FakeGateway([
      needs({
        capture: { device: 'bb-001', av_file: 'uuid-av-1', segments: [] },
      }),
    ]);
    const engine = mockEngine();
    const summary = await worker(gw, engine).runOnce();

    expect(summary).toEqual({ processed: 0, skipped: 1, failed: 0 });
    expect(engine.transcribe).not.toHaveBeenCalled();
    expect(gw.writes).toEqual([]);
  });

  it('skips an in-camera session entirely (no engine call, no write)', async () => {
    const gw = new FakeGateway([needs({ visibility: 'in_camera' })]);
    const engine = mockEngine();
    const summary = await worker(gw, engine).runOnce();

    expect(summary).toEqual({ processed: 0, skipped: 1, failed: 0 });
    expect(engine.transcribe).not.toHaveBeenCalled();
    expect(gw.writes).toEqual([]);
  });

  it('skips a session whose segments are all in-camera (no public content)', async () => {
    const gw = new FakeGateway([
      needs({
        capture: {
          device: 'bb-001',
          av_file: 'uuid-av-1',
          segments: [{ start: 0, end: 10, visibility: 'in_camera' }],
        },
      }),
    ]);
    const engine = mockEngine();
    await worker(gw, engine).runOnce();

    expect(engine.transcribe).not.toHaveBeenCalled();
    expect(gw.writes).toEqual([]);
  });

  it('is idempotent: a second cycle reprocesses nothing (the write is the latch)', async () => {
    const gw = new FakeGateway([needs()]);
    const engine = mockEngine();
    const w = worker(gw, engine);

    const first = await w.runOnce();
    const second = await w.runOnce();

    expect(first.processed).toBe(1);
    expect(second).toEqual({ processed: 0, skipped: 0, failed: 0 });
    expect(gw.writes).toHaveLength(1); // only the first cycle wrote
  });

  it('honours the re-read guard: no write if transcript_status appeared mid-flight', async () => {
    const session = needs();
    const gw = new FakeGateway([session]);
    // Simulate another worker finishing between transcribe and the guard re-read.
    vi.spyOn(gw, 'getSession').mockResolvedValue({
      ...session,
      transcript_status: 'automated',
    });
    const engine = mockEngine();
    const summary = await worker(gw, engine).runOnce();

    expect(engine.transcribe).toHaveBeenCalledOnce(); // work happened...
    expect(gw.writes).toEqual([]); // ...but the guard suppressed the write
    expect(summary.skipped).toBe(1);
  });

  it('stays idle when the engine is unavailable (A/V still public)', async () => {
    const gw = new FakeGateway([needs()]);
    const engine = mockEngine({ available: false });
    const findSpy = vi.spyOn(gw, 'findNeedingTranscription');
    const summary = await worker(gw, engine).runOnce();

    expect(summary).toEqual({ processed: 0, skipped: 0, failed: 0 });
    expect(findSpy).not.toHaveBeenCalled();
    expect(gw.writes).toEqual([]);
  });

  it('leaves the session re-pollable when transcription fails (no status write)', async () => {
    const gw = new FakeGateway([needs()]);
    const engine = mockEngine({ throws: true });
    const summary = await worker(gw, engine).runOnce();

    expect(summary).toEqual({ processed: 0, skipped: 0, failed: 1 });
    expect(gw.writes).toEqual([]);
    // Still needs transcription → next cycle will retry.
    expect(await gw.findNeedingTranscription()).toHaveLength(1);
  });
});

describe('NoopEngine', () => {
  it('is never available, so the worker degrades gracefully', async () => {
    expect(await new NoopEngine().available()).toBe(false);
  });
});
