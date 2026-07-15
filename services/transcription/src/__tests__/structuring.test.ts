import { describe, it, expect } from 'vitest';
import { deriveTopics } from '../structuring.js';
import type { AgendaItem, TranscriptSegment } from '../types.js';

function seg(start: number, text: string): TranscriptSegment {
  return { start, end: start + 5, text };
}

describe('deriveTopics (heuristic agenda alignment)', () => {
  it('returns [] with no agenda or no transcript', () => {
    expect(deriveTopics([seg(0, 'hello')], [])).toEqual([]);
    expect(deriveTopics([], [{ title: 'Budget' }])).toEqual([]);
  });

  it('aligns segments to agenda items by keyword, carrying the discussion', () => {
    const segments = [
      seg(0, 'The meeting is called to order. Roll call.'),
      seg(5, 'First, the annual budget for parks.'),
      seg(10, 'We propose increasing the parks budget by ten percent.'),
      seg(15, 'Next, the new zoning bylaw for downtown.'),
      seg(20, 'The zoning change rezones the waterfront.'),
    ];
    const agenda: AgendaItem[] = [
      { title: 'Parks budget' },
      { title: 'Zoning bylaw' },
    ];
    const topics = deriveTopics(segments, agenda);
    expect(topics).toHaveLength(2);

    expect(topics[0]?.title).toBe('Parks budget');
    // topic 0 starts at the beginning (captures the opening) up to the zoning intro
    expect(topics[0]?.description).toContain('called to order');
    expect(topics[0]?.description).toContain('budget');
    expect(topics[0]?.description).not.toContain('rezones');

    expect(topics[1]?.title).toBe('Zoning bylaw');
    expect(topics[1]?.description).toContain('zoning');
    expect(topics[1]?.description).toContain('rezones');
  });

  it('preserves agenda order + titles + drops nothing when keywords do not match', () => {
    const segments = Array.from({ length: 6 }, (_, i) =>
      seg(i * 5, `segment ${i} content`)
    );
    const agenda: AgendaItem[] = [
      { title: 'Alpha' },
      { title: 'Beta' },
      { title: 'Gamma' },
    ];
    const topics = deriveTopics(segments, agenda);
    expect(topics.map((t) => t.title)).toEqual(['Alpha', 'Beta', 'Gamma']);
    // every segment lands in some topic (nothing dropped by the proportional split)
    const all = topics.map((t) => t.description).join(' ');
    for (let i = 0; i < 6; i++) expect(all).toContain(`segment ${i}`);
  });

  it('emits title + description only (votes/decisions left for the clerk)', () => {
    const topics = deriveTopics([seg(0, 'budget talk')], [{ title: 'Budget' }]);
    expect(Object.keys(topics[0] ?? {}).sort()).toEqual([
      'description',
      'title',
    ]);
  });
});
