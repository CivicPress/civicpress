/**
 * Heuristic "agenda is the scaffold" minutes structuring (BroadcastBox bb-002,
 * design §4). Aligns transcript segments to a meeting's agenda items → one draft
 * topic per item, carrying the discussion text under it. No AI vendor, nothing
 * leaves the box — pure string matching, monotonic in agenda order.
 *
 * Deliberately best-effort: `votes[]`/`decisions[]`/`attendees` are left for clerk
 * entry, and the written `minutes_status` stays `draft` until a clerk adopts it.
 * No agenda (or no transcript) → no topics; the transcript still stands alone.
 */

import type { AgendaItem, DraftTopic, TranscriptSegment } from './types.js';

// Minimal bilingual (en + fr pilot) stopword set + a length filter, so keyword
// matching works across the pilot's French content without an NLP dependency.
const STOPWORDS = new Set([
  'the', 'and', 'for', 'are', 'was', 'that', 'this', 'with', 'from', 'has',
  'les', 'des', 'une', 'que', 'qui', 'aux', 'pour', 'est', 'sont', 'dans',
  'sur', 'avec', 'cette', 'nous', 'vous',
]);

function keywordsOf(title: string): string[] {
  return title
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
}

function scoreSegment(text: string, keywords: string[]): number {
  if (keywords.length === 0) return 0;
  const hay = text.toLowerCase();
  let score = 0;
  for (const kw of keywords) if (hay.includes(kw)) score++;
  return score;
}

export function deriveTopics(
  segments: TranscriptSegment[],
  agenda: AgendaItem[]
): DraftTopic[] {
  if (agenda.length === 0 || segments.length === 0) return [];

  // For each agenda item (in order), find the segment where it is first mentioned
  // (most title-keyword hits), searching monotonically forward so the agenda order
  // is preserved. With no keyword signal, fall back to a proportional position so
  // segments still distribute across items rather than collapsing onto the last.
  const boundaries: number[] = [];
  let from = 0;
  for (let i = 0; i < agenda.length; i++) {
    const keywords = keywordsOf(agenda[i]?.title ?? '');
    let bestIdx = -1;
    let bestScore = 0;
    for (let j = from; j < segments.length; j++) {
      const score = scoreSegment(segments[j]?.text ?? '', keywords);
      if (score > bestScore) {
        bestScore = score;
        bestIdx = j;
      }
    }
    const proportional = Math.floor((i / agenda.length) * segments.length);
    const boundary = Math.max(from, bestScore > 0 ? bestIdx : proportional);
    boundaries.push(boundary);
    from = boundary;
  }

  const topics: DraftTopic[] = [];
  for (let i = 0; i < agenda.length; i++) {
    // Topic 0 starts at the very beginning so the opening (call to order, roll
    // call) is captured; later topics start at their boundary.
    const startSeg = i === 0 ? 0 : (boundaries[i] ?? 0);
    const endSeg =
      i + 1 < agenda.length ? (boundaries[i + 1] ?? segments.length) : segments.length;
    const discussion = segments
      .slice(startSeg, Math.max(startSeg, endSeg))
      .map((s) => s.text.trim())
      .filter(Boolean)
      .join(' ')
      .trim();
    topics.push({ title: agenda[i]?.title ?? '', description: discussion });
  }
  return topics;
}
