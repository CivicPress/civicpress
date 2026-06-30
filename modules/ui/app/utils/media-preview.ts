/**
 * Helpers for previewing record media in the records UI — BroadcastBox session
 * recordings (A/V) and their WebVTT transcripts. Pure functions, unit-testable
 * without a Nuxt context.
 */

const VIDEO_EXT: Record<string, string> = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  mkv: 'video/x-matroska',
  ogv: 'video/ogg',
};

const AUDIO_EXT: Record<string, string> = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  flac: 'audio/flac',
};

/**
 * Best-effort MIME type from a filename extension. `attached_files[]` entries
 * carry no `mime_type`, so the records UI infers it to decide playability.
 */
export function inferMediaMime(name: string): string {
  const ext = (name.split('.').pop() || '').toLowerCase();
  return VIDEO_EXT[ext] || AUDIO_EXT[ext] || '';
}

/** True if a filename is an inline-playable A/V recording (video or audio). */
export function isPlayableMedia(name: string): boolean {
  const mime = inferMediaMime(name);
  return mime.startsWith('video/') || mime.startsWith('audio/');
}

export interface TranscriptCue {
  /** Cue start time, as written in the VTT (e.g. `00:01:23.000`). */
  start: string;
  /** The cue's text (joined lines), styling/positioning stripped. */
  text: string;
}

/**
 * Minimal WebVTT → ordered cues. Ignores styling/positioning cue settings and
 * keeps the start time (for display) + the joined text lines. Tolerates the
 * `WEBVTT` header, `NOTE` blocks, numeric/string cue identifiers, and CRLF.
 */
export function parseWebVtt(vtt: string): TranscriptCue[] {
  const cues: TranscriptCue[] = [];
  const blocks = vtt.replace(/\r\n/g, '\n').split(/\n\n+/);
  for (const block of blocks) {
    const lines = block.split('\n').filter((l) => l.trim() !== '');
    const timingIdx = lines.findIndex((l) => l.includes('-->'));
    if (timingIdx === -1) continue; // header / NOTE / non-cue block
    const timing = lines[timingIdx] ?? '';
    const start = ((timing.split('-->')[0] ?? '').trim().split(/\s+/)[0] ?? '')
      // drop a leading cue-id that some writers put on the same logical block
      .trim();
    const text = lines
      .slice(timingIdx + 1)
      .join(' ')
      .trim();
    if (text) cues.push({ start, text });
  }
  return cues;
}
