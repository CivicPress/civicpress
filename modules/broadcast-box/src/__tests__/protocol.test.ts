/**
 * ProtocolHandler Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProtocolHandler } from '../websocket/protocol.js';
import type { Logger } from '@civicpress/core';

describe('ProtocolHandler', () => {
  let protocol: ProtocolHandler;
  let mockLogger: Logger;

  beforeEach(() => {
    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as any;

    protocol = new ProtocolHandler(mockLogger);
  });

  describe('parseMessage', () => {
    it('should parse a valid command message', () => {
      const message = {
        type: 'command',
        id: 'cmd-123',
        timestamp: new Date().toISOString(),
        action: 'start_session',
        payload: { sessionId: 'session-123' },
      };

      const result = protocol.parseMessage(JSON.stringify(message));

      expect(result).toBeDefined();
      expect(result?.type).toBe('command');
      expect(result?.isValid).toBe(true);
    });

    it('should parse a valid event message', () => {
      const message = {
        type: 'event',
        id: 'event-123',
        timestamp: new Date().toISOString(),
        event: 'session.started',
        payload: { sessionId: 'session-123' },
      };

      const result = protocol.parseMessage(JSON.stringify(message));

      expect(result).toBeDefined();
      expect(result?.type).toBe('event');
      expect(result?.isValid).toBe(true);
    });

    it('should parse a valid ack message', () => {
      const message = {
        type: 'ack',
        id: 'ack-123',
        timestamp: new Date().toISOString(),
        commandId: 'cmd-123',
        success: true,
      };

      const result = protocol.parseMessage(JSON.stringify(message));

      expect(result).toBeDefined();
      expect(result?.type).toBe('ack');
      expect(result?.isValid).toBe(true);
    });

    it('should return null for invalid JSON', () => {
      const result = protocol.parseMessage('invalid json');

      expect(result).toBeNull();
    });

    it('should return invalid for message missing required fields', () => {
      const message = {
        type: 'command',
        // Missing id and timestamp
        action: 'start_session',
      };

      const result = protocol.parseMessage(JSON.stringify(message));

      expect(result).toBeDefined();
      expect(result?.isValid).toBe(false);
      expect(result?.error).toBeDefined();
    });
  });

  describe('createCommand', () => {
    it('should create a command message', () => {
      const action = 'start_session';
      const payload = { sessionId: 'session-123' };

      const command = protocol.createCommand(action, payload);

      expect(command.type).toBe('command');
      expect(command.action).toBe(action);
      expect(command.payload).toEqual(payload);
      expect(command.id).toBeDefined();
      expect(command.timestamp).toBeDefined();
    });
  });

  describe('createEvent', () => {
    it('should create an event message', () => {
      const event = 'session.started';
      const payload = { sessionId: 'session-123' };

      const eventMsg = protocol.createEvent(event, payload);

      expect(eventMsg.type).toBe('event');
      expect(eventMsg.event).toBe(event);
      expect(eventMsg.payload).toEqual(payload);
      expect(eventMsg.id).toBeDefined();
      expect(eventMsg.timestamp).toBeDefined();
    });
  });

  describe('createAck', () => {
    it('should create a success ack message', () => {
      const commandId = 'cmd-123';
      const payload = { sessionId: 'session-123' };

      const ack = protocol.createAck(commandId, true, undefined, payload);

      expect(ack.type).toBe('ack');
      expect(ack.commandId).toBe(commandId);
      expect(ack.success).toBe(true);
      expect(ack.payload).toEqual(payload);
    });

    it('should create an error ack message', () => {
      const commandId = 'cmd-123';
      const error = 'Invalid session ID';

      const ack = protocol.createAck(commandId, false, error);

      expect(ack.type).toBe('ack');
      expect(ack.commandId).toBe(commandId);
      expect(ack.success).toBe(false);
      expect(ack.error).toBe(error);
    });
  });

  describe('validateMessage', () => {
    it('should validate a valid message', () => {
      const message = {
        type: 'command',
        id: 'cmd-123',
        timestamp: new Date().toISOString(),
      };

      const result = protocol.validateMessage(message);

      expect(result.valid).toBe(true);
    });

    it('should reject message without type', () => {
      const message = {
        id: 'cmd-123',
        timestamp: new Date().toISOString(),
      };

      const result = protocol.validateMessage(message as any);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('type');
    });

    it('should reject message with invalid timestamp', () => {
      const message = {
        type: 'command',
        id: 'cmd-123',
        timestamp: 'invalid-date',
      };

      const result = protocol.validateMessage(message as any);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('timestamp');
    });
  });
});
