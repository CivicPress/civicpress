/**
 * startInProcessTranscription — the launcher's gating decisions, with fakes.
 * (The full worker→gateway→engine pipeline is covered by the transcription
 * service suite + tests/transcription/transcription-e2e.test.ts.)
 */

import { describe, it, expect } from 'vitest';
import { startInProcessTranscription } from '../transcription-bootstrap.js';

const logger = {
  info() {},
  warn() {},
  error() {},
  debug() {},
} as any;

// A fake CivicPress: only the accessors the bootstrap touches. getService throws
// so a test that reaches it (without a storage override) fails loudly.
function fakeCivic(): any {
  return {
    getRecordManager: () => ({
      async listRecords() {
        return { records: [] };
      },
      async getRecord() {
        return null;
      },
      async updateRecord() {
        return null;
      },
    }),
    getService: () => {
      throw new Error('getService called despite a storage override');
    },
    getDataDir: () => '/tmp/none',
  };
}

const engineUp = {
  name: 'stub-up',
  async available() {
    return true;
  },
  async transcribe() {
    return { language: 'fr', text: '', segments: [] };
  },
} as any;

const engineDown = {
  name: 'stub-down',
  async available() {
    return false;
  },
  async transcribe() {
    throw new Error('unavailable');
  },
} as any;

const fakeStorage = {
  async getFileContent() {
    return null;
  },
};

describe('startInProcessTranscription gating', () => {
  it('skips when config.enabled is false', async () => {
    const result = await startInProcessTranscription(
      fakeCivic(),
      { enabled: false, engine: 'whisper-cpp' },
      logger
    );
    expect(result).toEqual({ worker: null, started: false });
  });

  it('skips on the env opt-out even when config.enabled is true', async () => {
    const result = await startInProcessTranscription(
      fakeCivic(),
      { enabled: true },
      logger,
      { enabled: false, engine: engineUp, storage: fakeStorage }
    );
    expect(result.started).toBe(false);
    expect(result.worker).toBeNull();
  });

  it('skips when the engine is unavailable (graceful degradation)', async () => {
    const result = await startInProcessTranscription(
      fakeCivic(),
      { enabled: true },
      logger,
      { engine: engineDown, storage: fakeStorage }
    );
    expect(result).toEqual({ worker: null, started: false });
  });

  it('starts the worker when enabled + engine available', async () => {
    const result = await startInProcessTranscription(
      fakeCivic(),
      { enabled: true },
      logger,
      { engine: engineUp, storage: fakeStorage }
    );
    expect(result.started).toBe(true);
    expect(result.worker).not.toBeNull();
    result.worker?.stop(); // halt the poll loop
  });
});
