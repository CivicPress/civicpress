/**
 * WebVTT rendering for the published transcript artifact.
 *
 * The worker writes the structured transcript to `media.transcript_data`; this
 * renders the same data to a WebVTT file stored as the `media.transcript`
 * artifact (a path/URL). In-camera segments are already excluded upstream, so
 * every cue here is public.
 */

import type { TranscriptResult } from './types.js';

/** Format a second offset as a WebVTT timestamp: `HH:MM:SS.mmm`. */
export function formatTimestamp(seconds: number): string {
  const totalMs = Math.round(Math.max(0, seconds) * 1000);
  const ms = totalMs % 1000;
  const s = Math.floor(totalMs / 1000) % 60;
  const m = Math.floor(totalMs / 60000) % 60;
  const h = Math.floor(totalMs / 3600000);
  const pad = (n: number, width = 2) => String(n).padStart(width, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(ms, 3)}`;
}

/**
 * Render a transcript to a WebVTT document — one cue per segment, in segment
 * order, with an optional speaker voice span.
 */
export function renderVtt(transcript: TranscriptResult): string {
  const cues = transcript.segments.map((seg, i) => {
    const range = `${formatTimestamp(seg.start)} --> ${formatTimestamp(seg.end)}`;
    const voice = seg.speaker ? `<v ${seg.speaker}>` : '';
    return `${i + 1}\n${range}\n${voice}${seg.text}`;
  });
  // Trailing newline keeps the file POSIX-friendly.
  return `WEBVTT\n\n${cues.join('\n\n')}\n`;
}
