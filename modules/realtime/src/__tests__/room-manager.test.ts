/**
 * Unit Tests for RoomManager
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RoomManager } from '../rooms/room-manager.js';
import { RoomNotFoundError } from '../errors/realtime-errors.js';
import type { Logger } from '@civicpress/core';

describe('RoomManager', () => {
  let roomManager: RoomManager;
  let mockLogger: Logger;
  let mockServer: any;

  beforeEach(() => {
    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      isVerbose: () => false,
    } as any;

    mockServer = {
      emitHook: vi.fn(),
    };

    roomManager = new RoomManager(mockLogger, mockServer);
  });

  describe('getOrCreateRoom', () => {
    it('should create a new room when it does not exist', () => {
      const room = roomManager.getOrCreateRoom('record:test-123', 'record', {});

      expect(room).toBeDefined();
      expect(room.roomId).toBe('record:test-123');
      expect(room.roomType).toBe('record');
      expect(mockServer.emitHook).toHaveBeenCalledWith(
        'realtime:room:created',
        expect.objectContaining({
          roomId: 'record:test-123',
          roomType: 'record',
        })
      );
    });

    it('should return existing room when it exists', () => {
      const room1 = roomManager.getOrCreateRoom(
        'record:test-123',
        'record',
        {}
      );
      const room2 = roomManager.getOrCreateRoom(
        'record:test-123',
        'record',
        {}
      );

      expect(room1).toBe(room2);
      expect(mockServer.emitHook).toHaveBeenCalledTimes(1); // Only called once
    });

    it('should support both record and records room types', () => {
      const room1 = roomManager.getOrCreateRoom(
        'record:test-123',
        'record',
        {}
      );
      const room2 = roomManager.getOrCreateRoom(
        'records:test-123',
        'records',
        {}
      );

      // Both should work (same factory)
      expect(room1).toBeDefined();
      expect(room2).toBeDefined();
    });

    it('should throw error for unsupported room type', () => {
      expect(() => {
        roomManager.getOrCreateRoom('unknown:test-123', 'unknown', {});
      }).toThrow(RoomNotFoundError);
    });
  });

  describe('getRoom', () => {
    it('should return room when it exists', () => {
      const created = roomManager.getOrCreateRoom(
        'record:test-123',
        'record',
        {}
      );
      const retrieved = roomManager.getRoom('record:test-123');

      expect(retrieved).toBe(created);
    });

    it('should return null when room does not exist', () => {
      const room = roomManager.getRoom('record:nonexistent');

      expect(room).toBeNull();
    });
  });

  describe('removeRoom', () => {
    it('should remove room and emit hook', async () => {
      const room = roomManager.getOrCreateRoom('record:test-123', 'record', {});

      // Mock destroy method
      vi.spyOn(room, 'destroy').mockResolvedValue(undefined);

      await roomManager.removeRoom('record:test-123');

      expect(room.destroy).toHaveBeenCalled();
      expect(mockServer.emitHook).toHaveBeenCalledWith(
        'realtime:room:destroyed',
        expect.objectContaining({
          roomId: 'record:test-123',
        })
      );

      const retrieved = roomManager.getRoom('record:test-123');
      expect(retrieved).toBeNull();
    });

    it('should not throw error when removing non-existent room', async () => {
      await expect(
        roomManager.removeRoom('record:nonexistent')
      ).resolves.not.toThrow();
    });
  });

  describe('getRoomCount', () => {
    it('should return 0 when no rooms exist', () => {
      expect(roomManager.getRoomCount()).toBe(0);
    });

    it('should return correct count after creating rooms', () => {
      roomManager.getOrCreateRoom('record:test-1', 'record', {});
      roomManager.getOrCreateRoom('record:test-2', 'record', {});
      roomManager.getOrCreateRoom('record:test-3', 'record', {});

      expect(roomManager.getRoomCount()).toBe(3);
    });

    it('should decrease count after removing rooms', async () => {
      roomManager.getOrCreateRoom('record:test-1', 'record', {});
      const room2 = roomManager.getOrCreateRoom('record:test-2', 'record', {});

      vi.spyOn(room2, 'destroy').mockResolvedValue(undefined);

      expect(roomManager.getRoomCount()).toBe(2);

      await roomManager.removeRoom('record:test-2');

      expect(roomManager.getRoomCount()).toBe(1);
    });
  });
});
