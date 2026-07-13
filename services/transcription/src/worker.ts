/**
 * The transcription worker loop (BroadcastBox W2, transcript-only MVP).
 *
 * One cycle: if the engine is available, scan for sessions needing
 * transcription, and for each: exclude in-camera content, transcribe the public
 * audio, then atomically write `media.transcript` + `transcript_status:
 * automated` — guarded so re-runs are idempotent (design §10.4).
 */

import type {
  DraftTopic,
  Logger,
  RecordsGateway,
  RunSummary,
  SessionForTranscription,
  TimeRange,
  TranscriptionEngine,
} from './types.js';
import { deriveTopics } from './structuring.js';
import { resolveVisibility } from './visibility.js';

export interface WorkerOptions {
  records: RecordsGateway;
  engine: TranscriptionEngine;
  logger: Logger;
  /** Transcription language hint. Defaults to fr-CA (the pilot data). */
  language?: string;
  /** Clock-skew padding on hidden windows (seconds; defaults 3 lead / 5 trail). */
  leadPadS?: number;
  trailPadS?: number;
}

type Outcome = 'written' | 'skipped' | 'failed';

export class TranscriptionWorker {
  private running = false;

  constructor(private readonly opts: WorkerOptions) {}

  /** Run a single poll cycle. Returns a summary; never throws on a per-session error. */
  async runOnce(): Promise<RunSummary> {
    const { records, engine, logger } = this.opts;

    if (!(await engine.available())) {
      logger.debug(
        'transcription engine unavailable — idle this cycle (A/V stays public)',
        { engine: engine.name }
      );
      return { processed: 0, skipped: 0, failed: 0 };
    }

    const sessions = await records.findNeedingTranscription();
    const summary: RunSummary = { processed: 0, skipped: 0, failed: 0 };
    for (const session of sessions) {
      const outcome = await this.processSession(session);
      if (outcome === 'written') summary.processed++;
      else if (outcome === 'skipped') summary.skipped++;
      else summary.failed++;
    }
    if (sessions.length > 0) {
      logger.info('transcription cycle complete', { ...summary });
    }
    return summary;
  }

  private async processSession(
    session: SessionForTranscription
  ): Promise<Outcome> {
    const { records, engine, logger } = this.opts;
    const language = this.opts.language ?? 'fr-CA';

    // In-camera exclusion (civic-critical): a closed session is never transcribed.
    if (session.visibility === 'in_camera') {
      logger.warn('session is in-camera — not transcribing', { id: session.id });
      return 'skipped';
    }
    // Fail-closed visibility (FA-BB-002): UNKNOWN segments HOLD — a session
    // with no/empty/malformed segments and no all-public attestation is never
    // transcribed whole-file. Hidden windows are skew-padded, so the public
    // ranges handed to the engine shrink at every boundary touching them.
    const decision = resolveVisibility(session.capture, {
      leadPadS: this.opts.leadPadS,
      trailPadS: this.opts.trailPadS,
    });
    if (decision.kind === 'hold') {
      logger.warn('session visibility unknown — holding, not transcribing', {
        id: session.id,
        reason: decision.reason,
      });
      return 'skipped';
    }
    if (decision.kind === 'none_public') {
      logger.warn('session has no public segments — not transcribing', {
        id: session.id,
      });
      return 'skipped';
    }
    const publicRanges: TimeRange[] | null =
      decision.kind === 'all_public' ? null : decision.publicRanges;

    let transcript;
    try {
      const audio = await records.prepareAudio(session);
      transcript = await engine.transcribe({ audio, language, publicRanges });
    } catch (error) {
      // Transient/unexpected failure: leave transcript_status absent so the next
      // cycle retries. (A persistent failure would loop — a `failed` operational
      // state is deferred to the multi-worker increment.)
      logger.error('transcription failed — will retry next cycle', {
        id: session.id,
        error: error instanceof Error ? error.message : String(error),
      });
      return 'failed';
    }

    // Re-read-before-write idempotency guard (§10.4): if the session gained a
    // transcript_status while we were transcribing (another worker, a retry),
    // don't overwrite it.
    const current = await records.getSession(session.id);
    if (!current || current.transcript_status) {
      logger.info('transcript already present — skipping write', {
        id: session.id,
      });
      return 'skipped';
    }

    // Draft structured minutes (bb-002): align the transcript to the meeting's
    // agenda → draft topics[]. Best-effort — no agenda (or no getAgenda support)
    // means no topics, just the transcript. The A/V + transcript never block on it.
    let topics: DraftTopic[] = [];
    try {
      const agenda = (await records.getAgenda?.(session)) ?? [];
      topics = deriveTopics(transcript.segments, agenda);
    } catch (error) {
      logger.warn('agenda alignment failed — writing transcript without topics', {
        id: session.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    await records.writeTranscript(session.id, {
      transcript,
      status: 'automated',
      topics,
    });
    logger.info('transcript written', {
      id: session.id,
      language: transcript.language,
      topics: topics.length,
    });
    return 'written';
  }

  /** Run cycles forever, every `pollIntervalMs`, until `stop()`. */
  async start(pollIntervalMs: number): Promise<void> {
    this.running = true;
    while (this.running) {
      try {
        await this.runOnce();
      } catch (error) {
        this.opts.logger.error('transcription cycle errored', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
      if (!this.running) break;
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
  }

  stop(): void {
    this.running = false;
  }
}
