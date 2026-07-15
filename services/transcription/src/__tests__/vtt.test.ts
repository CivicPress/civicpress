import { describe, it, expect } from 'vitest';
import { renderVtt, formatTimestamp } from '../vtt.js';

describe('formatTimestamp', () => {
  it('formats seconds as HH:MM:SS.mmm', () => {
    expect(formatTimestamp(0)).toBe('00:00:00.000');
    expect(formatTimestamp(5)).toBe('00:00:05.000');
    expect(formatTimestamp(65.5)).toBe('00:01:05.500');
    expect(formatTimestamp(3661.25)).toBe('01:01:01.250');
  });

  it('clamps negatives to zero and rounds milliseconds without carry bugs', () => {
    expect(formatTimestamp(-3)).toBe('00:00:00.000');
    // 59.9995s rounds to 60.000s → must roll into the minute, not show :60.
    expect(formatTimestamp(59.9995)).toBe('00:01:00.000');
  });
});

describe('renderVtt', () => {
  it('renders one cue per segment in order', () => {
    const vtt = renderVtt({
      language: 'fr',
      text: 'Bonjour. Au revoir.',
      segments: [
        { start: 0, end: 1.8, text: 'Bonjour.' },
        { start: 1.8, end: 3.2, text: 'Au revoir.' },
      ],
    });
    expect(vtt).toBe(
      [
        'WEBVTT',
        '',
        '1',
        '00:00:00.000 --> 00:00:01.800',
        'Bonjour.',
        '',
        '2',
        '00:00:01.800 --> 00:00:03.200',
        'Au revoir.',
        '',
      ].join('\n')
    );
  });

  it('adds a speaker voice span when present', () => {
    const vtt = renderVtt({
      language: 'en',
      text: 'Order.',
      segments: [{ start: 0, end: 1, text: 'Order.', speaker: 'Mayor' }],
    });
    expect(vtt).toContain('<v Mayor>Order.');
  });

  it('renders a header-only document for an empty transcript', () => {
    expect(renderVtt({ language: 'fr', text: '', segments: [] })).toBe(
      'WEBVTT\n\n\n'
    );
  });
});
