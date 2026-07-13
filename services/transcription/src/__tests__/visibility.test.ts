/**
 * The FA-BB-002 fail-closed visibility matrix — shared by the transcription
 * worker and the broadcast-box redaction worker, so this suite is the spec.
 */

import { describe, it, expect } from 'vitest';
import {
  mergeRanges,
  padRanges,
  resolveVisibility,
  subtractRanges,
} from '../visibility.js';

describe('range math', () => {
  it('mergeRanges sorts, merges overlaps and touching ranges, drops empties', () => {
    expect(
      mergeRanges([
        { start: 10, end: 20 },
        { start: 0, end: 5 },
        { start: 4, end: 8 },
        { start: 8, end: 9 },
        { start: 30, end: 30 }, // empty → dropped
      ])
    ).toEqual([
      { start: 0, end: 9 },
      { start: 10, end: 20 },
    ]);
  });

  it('subtractRanges cuts holes and drops slivers', () => {
    expect(
      subtractRanges(
        [{ start: 0, end: 100 }],
        [
          { start: 10, end: 20 },
          { start: 50, end: 60 },
        ]
      )
    ).toEqual([
      { start: 0, end: 10 },
      { start: 20, end: 50 },
      { start: 60, end: 100 },
    ]);
    // Fully consumed → nothing left.
    expect(
      subtractRanges([{ start: 5, end: 10 }], [{ start: 0, end: 20 }])
    ).toEqual([]);
  });

  it('padRanges expands, clamps to [0, ceiling] and merges the result', () => {
    expect(
      padRanges(
        [
          { start: 2, end: 5 },
          { start: 12, end: 14 },
        ],
        3,
        5,
        15
      )
    ).toEqual([{ start: 0, end: 15 }]); // [−1→0,10] + [9,19→15] merge
  });
});

describe('resolveVisibility — fail-closed matrix', () => {
  const PADS = { leadPadS: 3, trailPadS: 5 };

  it('HOLDS on absent capture / absent segments / empty segments', () => {
    expect(resolveVisibility(undefined).kind).toBe('hold');
    expect(resolveVisibility({ av_file: 'x' }).kind).toBe('hold');
    expect(resolveVisibility({ av_file: 'x', segments: [] }).kind).toBe('hold');
  });

  it('HOLDS on malformed segments (untrustworthy manifest hides everything)', () => {
    expect(
      resolveVisibility({
        segments: [
          { start: 0, end: 10, visibility: 'public' },
          { start: 10, end: 5, visibility: 'public' }, // end <= start
        ],
      }).kind
    ).toBe('hold');
    expect(
      resolveVisibility({
        segments: [{ start: Number.NaN, end: 10, visibility: 'public' }],
      }).kind
    ).toBe('hold');
  });

  it('all_public via the explicit attestation flag (no segments needed)', () => {
    expect(resolveVisibility({ all_public: true }).kind).toBe('all_public');
    expect(
      resolveVisibility({ all_public: true, segments: [] }).kind
    ).toBe('all_public');
  });

  it('all_public via a full-timeline all-public segment cover', () => {
    expect(
      resolveVisibility({
        duration_s: 60,
        segments: [
          { start: 0, end: 30, visibility: 'public' },
          { start: 30, end: 60, visibility: 'public' },
        ],
      }).kind
    ).toBe('all_public');
  });

  it('a public cover with a gap is NOT all_public — the gap is hidden', () => {
    const d = resolveVisibility(
      {
        duration_s: 100,
        segments: [
          { start: 0, end: 40, visibility: 'public' },
          { start: 60, end: 100, visibility: 'public' }, // [40,60] undeclared
        ],
      },
      PADS
    );
    expect(d.kind).toBe('partial');
    if (d.kind !== 'partial') return;
    expect(d.hiddenRanges).toEqual([{ start: 37, end: 65 }]); // gap padded 3/5
    expect(d.publicRanges).toEqual([
      { start: 0, end: 37 },
      { start: 65, end: 100 },
    ]);
  });

  it('partial: hidden windows are padded and public ranges shrink accordingly', () => {
    const d = resolveVisibility(
      {
        duration_s: 15,
        segments: [
          { start: 0, end: 5, visibility: 'public' },
          { start: 5, end: 10, visibility: 'in_camera' },
          { start: 10, end: 15, visibility: 'public' },
        ],
      },
      PADS
    );
    expect(d.kind).toBe('partial');
    if (d.kind !== 'partial') return;
    expect(d.hiddenRanges).toEqual([{ start: 2, end: 15 }]);
    expect(d.publicRanges).toEqual([{ start: 0, end: 2 }]);
  });

  it('an unknown visibility label is hidden (fail-closed), never public', () => {
    const d = resolveVisibility(
      {
        duration_s: 30,
        segments: [
          { start: 0, end: 20, visibility: 'public' },
          { start: 20, end: 30, visibility: 'confidential' as any },
        ],
      },
      PADS
    );
    expect(d.kind).toBe('partial');
    if (d.kind !== 'partial') return;
    expect(d.hiddenRanges).toEqual([{ start: 17, end: 30 }]);
    expect(d.publicRanges).toEqual([{ start: 0, end: 17 }]);
  });

  it('none_public when everything is in-camera', () => {
    const d = resolveVisibility(
      {
        duration_s: 10,
        segments: [{ start: 0, end: 10, visibility: 'in_camera' }],
      },
      PADS
    );
    expect(d.kind).toBe('none_public');
  });

  it('none_public when padding consumes every public range', () => {
    const d = resolveVisibility(
      {
        duration_s: 12,
        segments: [
          { start: 0, end: 2, visibility: 'public' }, // eaten by the lead pad
          { start: 2, end: 12, visibility: 'in_camera' },
        ],
      },
      PADS
    );
    expect(d.kind).toBe('none_public');
  });

  it('clamps padded hidden windows to the actual media duration', () => {
    const d = resolveVisibility(
      {
        duration_s: 20,
        segments: [
          { start: 0, end: 10, visibility: 'public' },
          { start: 10, end: 20, visibility: 'in_camera' },
        ],
      },
      { ...PADS, mediaDurationS: 22.5 } // ffprobe says the MP4 is longer
    );
    expect(d.kind).toBe('partial');
    if (d.kind !== 'partial') return;
    // Trail pad extends into the real file tail: [10−3, 20+5 → clamp 22.5].
    expect(d.hiddenRanges).toEqual([{ start: 7, end: 22.5 }]);
    expect(d.publicRanges).toEqual([{ start: 0, end: 7 }]);
  });

  it('in-camera wins where segments contradict (overlap public ∩ in_camera)', () => {
    const d = resolveVisibility(
      {
        duration_s: 30,
        segments: [
          { start: 0, end: 20, visibility: 'public' },
          { start: 10, end: 30, visibility: 'in_camera' },
        ],
      },
      { leadPadS: 0, trailPadS: 0 }
    );
    expect(d.kind).toBe('partial');
    if (d.kind !== 'partial') return;
    expect(d.publicRanges).toEqual([{ start: 0, end: 10 }]);
  });
});
