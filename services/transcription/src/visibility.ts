/**
 * Segment-visibility resolution shared by the transcription worker AND the
 * broadcast-box redaction worker (FA-BB-002).
 *
 * The spine is the fail-closed invariant: absent/empty `capture.segments` are
 * UNKNOWN — they mean HOLD, never "all public". Publishing (or transcribing)
 * unredacted content requires a POSITIVE attestation: `capture.all_public ===
 * true`, or a full-timeline all-public segment cover.
 *
 * Clock-skew padding: the device's segment timeline t=0 is anchored ~1.5–2.5s
 * AFTER the MP4's first frame, so true in-camera content sits LATER in the
 * file than the raw segment says. Every hidden window is therefore padded
 * (default lead 3s / trail 5s) before it is blanked or excluded — over-hiding
 * public edges is acceptable; leaking closed-session content is not.
 *
 * Design: docs/specs/2026-07-07-fa-bb-002-redaction-design.md
 */

import type { CaptureSegment, SessionCapture, TimeRange } from './types.js';

/** Default skew padding (seconds) applied to each hidden window's edges. */
export const DEFAULT_LEAD_PAD_S = 3;
export const DEFAULT_TRAIL_PAD_S = 5;

/** Full-cover tolerance for the all-public attestation check (seconds). */
const FULL_COVER_EPSILON_S = 0.5;

/** Ranges shorter than this are dropped after subtraction (seconds). */
const MIN_RANGE_S = 0.05;

export interface VisibilityOptions {
  /** Lead padding on each hidden window (seconds; default 3). */
  leadPadS?: number;
  /** Trail padding on each hidden window (seconds; default 5). */
  trailPadS?: number;
  /**
   * Authoritative media duration (e.g. ffprobe of the actual file) used as the
   * clamp ceiling for padded hidden windows. Defaults to the declared timeline
   * (`capture.duration_s`, else the max segment end).
   */
  mediaDurationS?: number;
}

export type VisibilityDecision =
  /** UNKNOWN — fail closed: publish nothing, transcribe nothing, retry later. */
  | { kind: 'hold'; reason: string }
  /** Positively attested all-public: the whole recording may be published. */
  | { kind: 'all_public' }
  /** Nothing public (fully closed, or padding consumed every public range). */
  | { kind: 'none_public'; hiddenRanges: TimeRange[] }
  /** Mixed visibility: blank/exclude `hiddenRanges`; only `publicRanges` may surface. */
  | { kind: 'partial'; publicRanges: TimeRange[]; hiddenRanges: TimeRange[] };

/** Sort + merge overlapping/touching ranges into a disjoint ascending list. */
export function mergeRanges(ranges: TimeRange[]): TimeRange[] {
  const sorted = ranges
    .filter((r) => r.end > r.start)
    .slice()
    .sort((a, b) => a.start - b.start);
  const out: TimeRange[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r.start <= last.end) {
      last.end = Math.max(last.end, r.end);
    } else {
      out.push({ start: r.start, end: r.end });
    }
  }
  return out;
}

/** `a` minus `b` (both need not be merged); result is merged + ascending. */
export function subtractRanges(a: TimeRange[], b: TimeRange[]): TimeRange[] {
  const minuend = mergeRanges(a);
  const subtrahend = mergeRanges(b);
  const out: TimeRange[] = [];
  for (const r of minuend) {
    let cursor = r.start;
    for (const s of subtrahend) {
      if (s.end <= cursor) continue;
      if (s.start >= r.end) break;
      if (s.start > cursor) out.push({ start: cursor, end: s.start });
      cursor = Math.max(cursor, s.end);
      if (cursor >= r.end) break;
    }
    if (cursor < r.end) out.push({ start: cursor, end: r.end });
  }
  return out.filter((r) => r.end - r.start >= MIN_RANGE_S);
}

/** Expand each range by lead/trail, clamp to [0, ceilingS], and merge. */
export function padRanges(
  ranges: TimeRange[],
  leadPadS: number,
  trailPadS: number,
  ceilingS: number
): TimeRange[] {
  return mergeRanges(
    ranges.map((r) => ({
      start: Math.max(0, r.start - leadPadS),
      end: Math.min(ceilingS, r.end + trailPadS),
    }))
  );
}

function isMalformed(s: CaptureSegment): boolean {
  return (
    typeof s.start !== 'number' ||
    typeof s.end !== 'number' ||
    !Number.isFinite(s.start) ||
    !Number.isFinite(s.end) ||
    s.start < 0 ||
    s.end <= s.start
  );
}

/**
 * Resolve what may surface publicly from a capture block.
 *
 * - No/empty `segments` and no `all_public: true` → `hold` (the manifest may
 *   not have arrived, or was lost — UNKNOWN is never "all public").
 * - Any malformed segment → `hold` (a manifest we cannot fully trust hides
 *   everything).
 * - All segments public + full-timeline cover (or `all_public: true`) →
 *   `all_public` (the positive attestation).
 * - Otherwise every non-`public` segment is a hidden window: padded for clock
 *   skew, clamped to the media duration. `publicRanges` are the declared
 *   public segments minus the padded hidden windows (i.e. shrunk at every
 *   boundary that touches hidden content).
 */
export function resolveVisibility(
  capture: SessionCapture | undefined,
  options: VisibilityOptions = {}
): VisibilityDecision {
  const leadPadS = options.leadPadS ?? DEFAULT_LEAD_PAD_S;
  const trailPadS = options.trailPadS ?? DEFAULT_TRAIL_PAD_S;
  const attested = capture?.all_public === true;
  const segments = capture?.segments;

  if (!segments || segments.length === 0) {
    if (attested) return { kind: 'all_public' };
    return {
      kind: 'hold',
      reason: 'no capture.segments declared and no all-public attestation',
    };
  }

  if (segments.some(isMalformed)) {
    return { kind: 'hold', reason: 'malformed capture.segments' };
  }

  const declaredDurationS = Math.max(
    typeof capture?.duration_s === 'number' && Number.isFinite(capture.duration_s)
      ? capture.duration_s
      : 0,
    ...segments.map((s) => s.end)
  );
  const mediaDurationS = Math.max(
    options.mediaDurationS ?? declaredDurationS,
    declaredDurationS
  );

  // Any visibility label other than the literal 'public' hides the window —
  // an unknown label ('confidential', a typo, …) must fail closed.
  const publicMerged = mergeRanges(
    segments
      .filter((s) => s.visibility === 'public')
      .map((s) => ({ start: s.start, end: s.end }))
  );
  const hiddenDeclared = segments
    .filter((s) => s.visibility !== 'public')
    .map((s) => ({ start: s.start, end: s.end }));

  if (hiddenDeclared.length === 0) {
    const fullCover =
      publicMerged.length === 1 &&
      publicMerged[0].start <= FULL_COVER_EPSILON_S &&
      publicMerged[0].end >= declaredDurationS - FULL_COVER_EPSILON_S;
    if (attested || fullCover) return { kind: 'all_public' };
    // Public segments with uncovered timeline and no attestation: the gaps are
    // UNKNOWN. Only the declared public ranges may surface; hide the gaps.
    const gaps = subtractRanges(
      [{ start: 0, end: mediaDurationS }],
      publicMerged
    );
    return partialFrom(publicMerged, gaps, leadPadS, trailPadS, mediaDurationS);
  }

  return partialFrom(
    publicMerged,
    hiddenDeclared,
    leadPadS,
    trailPadS,
    mediaDurationS
  );
}

function partialFrom(
  publicMerged: TimeRange[],
  hidden: TimeRange[],
  leadPadS: number,
  trailPadS: number,
  mediaDurationS: number
): VisibilityDecision {
  const hiddenRanges = padRanges(hidden, leadPadS, trailPadS, mediaDurationS);
  const publicRanges = subtractRanges(publicMerged, hiddenRanges);
  if (publicRanges.length === 0) return { kind: 'none_public', hiddenRanges };
  return { kind: 'partial', publicRanges, hiddenRanges };
}
