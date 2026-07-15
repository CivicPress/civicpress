import { describe, it, expect } from 'vitest';
import { validateMessage, PROTOCOL_VERSION } from '../index.js';

const TS = '2026-06-20T19:00:00.000Z';

// One valid fixture per message type in the catalog.
const VALID: Record<string, unknown> = {
  command: { type: 'command', id: '1', timestamp: TS, action: 'start_session', payload: {} },
  ack: { type: 'ack', id: '1', timestamp: TS, commandId: 'c1', success: true },
  'ack(error)': { type: 'ack', id: '1', timestamp: TS, commandId: 'c1', success: false, error: 'boom', errorCode: 'E1' },
  event: { type: 'event', id: '1', timestamp: TS, event: 'device.connected', payload: {} },
  status: { type: 'status', id: '1', timestamp: TS, payload: { connected: true } },
  heartbeat: { type: 'heartbeat', id: '1', timestamp: TS },
  'schedule.push': {
    type: 'schedule.push',
    id: '1',
    timestamp: TS,
    payload: { sessions: [{ id: 'pv-2026-06-09', scheduled_start: TS, scheduled_end: TS, visibility: 'public', assigned_device: 'bb-001', agenda: ['Call to order'] }] },
  },
  'session.manifest': {
    type: 'session.manifest',
    id: '1',
    timestamp: TS,
    payload: { session_id: 'pv-2026-06-09', capture: { device: 'bb-001', av_file: 'uuid-1', duration_s: 7440, segments: [{ start: 0, end: 7000, visibility: 'public' }, { start: 7000, end: 7440, visibility: 'in_camera' }] } },
  },
  'command(stream.configure)': { type: 'command', id: '1', timestamp: TS, action: 'stream.configure', payload: { platform: 'youtube', rtmp_url: 'rtmp://a/live2', stream_key: 'secret' } },
  'command(record.start)': { type: 'command', id: '1', timestamp: TS, action: 'record.start', payload: {} },
  'preview.offer': { type: 'preview.offer', id: '1', timestamp: TS, payload: { sdp: '...' } },
  'preview.answer': { type: 'preview.answer', id: '1', timestamp: TS, payload: { sdp: '...' } },
  'preview.ice_candidate': { type: 'preview.ice_candidate', id: '1', timestamp: TS, payload: { candidate: '...' } },
  'preview.stopped': { type: 'preview.stopped', id: '1', timestamp: TS },
  'connection.ack': { type: 'connection.ack', id: '1', timestamp: TS },
  re_enrolled: { type: 're_enrolled', id: '1', timestamp: TS },
  auth_failed: { type: 'auth_failed', id: '1', timestamp: TS },
  error: { type: 'error', id: '1', timestamp: TS, error: 'boom', errorCode: 'E1' },
};

describe('broadcast-protocol', () => {
  it('exposes the protocol version', () => {
    expect(PROTOCOL_VERSION).toBe('1.0.0-draft');
  });

  for (const [name, msg] of Object.entries(VALID)) {
    it(`accepts a valid ${name}`, () => {
      const r = validateMessage(msg);
      expect(r.valid, r.errors.join('; ')).toBe(true);
    });
  }

  it('rejects an unknown message type', () => {
    expect(validateMessage({ type: 'nope', id: '1', timestamp: TS }).valid).toBe(false);
  });
  it('rejects a command missing action', () => {
    expect(validateMessage({ type: 'command', id: '1', timestamp: TS }).valid).toBe(false);
  });
  it('rejects an ack missing commandId/success', () => {
    expect(validateMessage({ type: 'ack', id: '1', timestamp: TS }).valid).toBe(false);
  });
  it('rejects unknown top-level fields (strict envelope)', () => {
    expect(validateMessage({ type: 'heartbeat', id: '1', timestamp: TS, rogue: 1 }).valid).toBe(false);
  });
  it('rejects a schedule item without an id', () => {
    expect(validateMessage({ type: 'schedule.push', id: '1', timestamp: TS, payload: { sessions: [{ scheduled_start: TS }] } }).valid).toBe(false);
  });
  it('rejects a segment with a bad visibility', () => {
    expect(
      validateMessage({ type: 'session.manifest', id: '1', timestamp: TS, payload: { session_id: 's', capture: { device: 'bb-001', segments: [{ start: 0, end: 1, visibility: 'secret' }] } } }).valid
    ).toBe(false);
  });
  it('rejects a malformed timestamp', () => {
    expect(validateMessage({ type: 'heartbeat', id: '1', timestamp: 'not-a-date' }).valid).toBe(false);
  });
});
