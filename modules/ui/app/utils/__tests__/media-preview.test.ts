import { describe, it, expect } from 'vitest';
import { inferMediaMime, isPlayableMedia, parseWebVtt } from '../media-preview';

describe('inferMediaMime', () => {
  it('maps video extensions (case-insensitive)', () => {
    expect(inferMediaMime('meeting.mp4')).toBe('video/mp4');
    expect(inferMediaMime('CLIP.WEBM')).toBe('video/webm');
    expect(inferMediaMime('a.mov')).toBe('video/quicktime');
  });
  it('maps audio extensions', () => {
    expect(inferMediaMime('audio.mp3')).toBe('audio/mpeg');
    expect(inferMediaMime('x.m4a')).toBe('audio/mp4');
    expect(inferMediaMime('y.wav')).toBe('audio/wav');
  });
  it('returns empty for non-media / unknown / no extension', () => {
    expect(inferMediaMime('notes.pdf')).toBe('');
    expect(inferMediaMime('image.png')).toBe('');
    expect(inferMediaMime('noext')).toBe('');
  });
});

describe('isPlayableMedia', () => {
  it('is true for audio/video, false otherwise', () => {
    expect(isPlayableMedia('council.mp4')).toBe(true);
    expect(isPlayableMedia('speech.wav')).toBe(true);
    expect(isPlayableMedia('agenda.pdf')).toBe(false);
    expect(isPlayableMedia('image.png')).toBe(false);
  });
});

describe('parseWebVtt', () => {
  const vtt = `WEBVTT

1
00:00:00.000 --> 00:00:03.500
Good evening, the meeting is called to order.

2
00:00:03.500 --> 00:00:06.000
First item on the agenda.
`;

  it('parses cues (start time + text), skipping the header + numeric ids', () => {
    const cues = parseWebVtt(vtt);
    expect(cues).toHaveLength(2);
    expect(cues[0]).toEqual({
      start: '00:00:00.000',
      text: 'Good evening, the meeting is called to order.',
    });
    expect(cues[1]?.text).toBe('First item on the agenda.');
  });

  it('joins multi-line cue text', () => {
    const cues = parseWebVtt(
      'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nline one\nline two\n'
    );
    expect(cues[0]?.text).toBe('line one line two');
  });

  it('skips NOTE blocks', () => {
    const cues = parseWebVtt(
      'WEBVTT\n\nNOTE a comment\n\n00:00:01.000 --> 00:00:02.000\nhello\n'
    );
    expect(cues).toHaveLength(1);
    expect(cues[0]?.text).toBe('hello');
  });

  it('tolerates blank / header-only input and CRLF', () => {
    expect(parseWebVtt('')).toEqual([]);
    expect(parseWebVtt('WEBVTT\n')).toEqual([]);
    expect(
      parseWebVtt('WEBVTT\r\n\r\n00:00:01.000 --> 00:00:02.000\r\nhi\r\n')
    ).toEqual([{ start: '00:00:01.000', text: 'hi' }]);
  });
});
