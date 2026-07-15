/**
 * The default engine when none is configured: always unavailable, so the worker
 * stays idle and the A/V remains public (graceful degradation, design §1).
 */

import type { TranscriptionEngine, TranscriptResult } from '../types.js';

export class NoopEngine implements TranscriptionEngine {
  readonly name = 'noop';

  async available(): Promise<boolean> {
    return false;
  }

  async transcribe(): Promise<TranscriptResult> {
    throw new Error('noop transcription engine cannot transcribe (none configured)');
  }
}
