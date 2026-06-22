/**
 * Phase 5 P5c — device ↔ server protocol contract.
 *
 * Proves the server speaks the SAME canonical wire protocol the device does:
 * - everything the server emits (ProtocolHandler.create*) validates against
 *   @civicpress/broadcast-protocol after a JSON round-trip (the wire form);
 * - canonical device→server frames are accepted by parseMessage;
 * - non-canonical frames (legacy shapes, missing fields, extras) are rejected.
 *
 * This is the payoff of the two-sided artifact: one schema, both ends.
 */

import { describe, it, expect, vi } from 'vitest';
import { validateMessage, PROTOCOL_VERSION } from '@civicpress/broadcast-protocol';
import { ProtocolHandler } from '../websocket/protocol.js';

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as any;
const protocol = new ProtocolHandler(logger);

// The wire form: JSON round-trip drops `undefined` keys, as the socket would.
const onWire = (m: unknown) => JSON.parse(JSON.stringify(m));

const TS = '2026-06-22T19:00:00.000Z';

describe('protocol contract — server ↔ @civicpress/broadcast-protocol', () => {
  it('shares the protocol version', () => {
    expect(PROTOCOL_VERSION).toBe('1.0.0-draft');
  });

  describe('server OUTBOUND messages validate against the canonical schema', () => {
    it('createCommand', () => {
      const r = validateMessage(onWire(protocol.createCommand('start_session', { sessionId: 's1' })));
      expect(r.valid, r.errors.join('; ')).toBe(true);
    });
    it('createEvent', () => {
      const r = validateMessage(onWire(protocol.createEvent('device.connected', { deviceUuid: 'd1' })));
      expect(r.valid, r.errors.join('; ')).toBe(true);
    });
    it('createAck (success)', () => {
      const r = validateMessage(onWire(protocol.createAck('c1', true, undefined, { state: 'recording' })));
      expect(r.valid, r.errors.join('; ')).toBe(true);
    });
    it('createAck (error)', () => {
      const r = validateMessage(onWire(protocol.createAck('c1', false, 'boom', undefined, 'E1')));
      expect(r.valid, r.errors.join('; ')).toBe(true);
    });
    it('createHeartbeat', () => {
      const r = validateMessage(onWire(protocol.createHeartbeat()));
      expect(r.valid, r.errors.join('; ')).toBe(true);
    });
  });

  describe('server ACCEPTS canonical device→server frames', () => {
    const frames: Record<string, unknown> = {
      ack: { type: 'ack', id: '1', timestamp: TS, commandId: 'c1', success: true },
      status: { type: 'status', id: '1', timestamp: TS, payload: { connected: true } },
      event: { type: 'event', id: '1', timestamp: TS, event: 'device.connected', payload: {} },
      'session.manifest': {
        type: 'session.manifest', id: '1', timestamp: TS,
        payload: { session_id: 'pv-1', capture: { device: 'bb-001' } },
      },
      'preview.offer': { type: 'preview.offer', id: '1', timestamp: TS, payload: { sdp: '...' } },
    };
    for (const [name, frame] of Object.entries(frames)) {
      it(`accepts ${name}`, () => {
        const parsed = protocol.parseMessage(JSON.stringify(frame));
        expect(parsed?.isValid, parsed?.error).toBe(true);
        expect(parsed?.type).toBe(name);
      });
    }
  });

  describe('server REJECTS non-canonical frames', () => {
    it('rejects a legacy control message', () => {
      const p = protocol.parseMessage(JSON.stringify({ type: 'control', id: '1', timestamp: TS, event: 'x' }));
      expect(p?.isValid).toBe(false);
    });
    it('rejects a command missing action', () => {
      const p = protocol.parseMessage(JSON.stringify({ type: 'command', id: '1', timestamp: TS }));
      expect(p?.isValid).toBe(false);
    });
    it('rejects an unknown top-level field (strict envelope)', () => {
      const p = protocol.parseMessage(JSON.stringify({ type: 'heartbeat', id: '1', timestamp: TS, rogue: 1 }));
      expect(p?.isValid).toBe(false);
    });
  });
});
