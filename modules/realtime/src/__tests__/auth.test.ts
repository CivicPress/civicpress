/**
 * Unit Tests for WebSocket Authentication
 */

import { describe, it, expect } from 'vitest';
import { extractToken, parseRoomId } from '../auth.js';

describe('WebSocket Authentication', () => {
  describe('extractToken', () => {
    it('should extract token from Authorization header (Bearer)', () => {
      const url = 'ws://localhost:3001/realtime/records/test-123';
      const headers = {
        authorization: 'Bearer test-token-123',
      };
      const result = extractToken(url, headers);

      expect(result.token).toBe('test-token-123');
      expect(result.method).toBe('header');
    });

    it('should extract token from subprotocol', () => {
      const url = 'ws://localhost:3001/realtime/records/test-123';
      const headers = {};
      const protocols = ['auth.test-token-456'];
      const result = extractToken(url, headers, protocols);

      expect(result.token).toBe('test-token-456');
      expect(result.method).toBe('subprotocol');
    });

    it('should extract token from subprotocol without auth. prefix', () => {
      const url = 'ws://localhost:3001/realtime/records/test-123';
      const headers = {};
      const protocols = ['long-token-that-looks-like-a-jwt-token-string'];
      const result = extractToken(url, headers, protocols);

      expect(result.token).toBe(
        'long-token-that-looks-like-a-jwt-token-string'
      );
      expect(result.method).toBe('subprotocol');
    });

    it('should extract token from query string (deprecated)', () => {
      const url =
        'ws://localhost:3001/realtime/records/test-123?token=query-token-789';
      const headers = {};
      const result = extractToken(url, headers);

      expect(result.token).toBe('query-token-789');
      expect(result.method).toBe('query');
    });

    it('should prioritize Authorization header over query string', () => {
      const url =
        'ws://localhost:3001/realtime/records/test-123?token=query-token';
      const headers = {
        authorization: 'Bearer header-token',
      };
      const result = extractToken(url, headers);

      expect(result.token).toBe('header-token');
      expect(result.method).toBe('header');
    });

    it('should prioritize subprotocol over query string', () => {
      const url =
        'ws://localhost:3001/realtime/records/test-123?token=query-token';
      const headers = {};
      const protocols = ['auth.subprotocol-token'];
      const result = extractToken(url, headers, protocols);

      expect(result.token).toBe('subprotocol-token');
      expect(result.method).toBe('subprotocol');
    });

    it('should return null if no token found', () => {
      const url = 'ws://localhost:3001/realtime/records/test-123';
      const headers = {};
      const result = extractToken(url, headers);

      expect(result.token).toBeNull();
      expect(result.method).toBeNull();
    });
  });

  describe('parseRoomId', () => {
    it('should parse record room ID from URL', () => {
      const url = '/realtime/records/test-record-123';
      const result = parseRoomId(url);

      expect(result).toEqual({
        roomType: 'records',
        roomId: 'test-record-123',
      });
    });

    it('should parse record room ID (singular)', () => {
      const url = '/realtime/record/test-record-456';
      const result = parseRoomId(url);

      expect(result).toEqual({
        roomType: 'record',
        roomId: 'test-record-456',
      });
    });

    it('should parse device room ID', () => {
      const url = '/realtime/device/device-789';
      const result = parseRoomId(url);

      expect(result).toEqual({
        roomType: 'device',
        roomId: 'device-789',
      });
    });

    it('should handle URLs with query parameters', () => {
      const url = '/realtime/records/test-record-123?token=abc';
      const result = parseRoomId(url);

      expect(result).toEqual({
        roomType: 'records',
        roomId: 'test-record-123',
      });
    });

    it('should return null for invalid URL format', () => {
      const url = '/invalid/path';
      const result = parseRoomId(url);

      expect(result).toBeNull();
    });

    it('should return null for URL without /realtime prefix', () => {
      const url = '/api/records/test-123';
      const result = parseRoomId(url);

      expect(result).toBeNull();
    });
  });
});
