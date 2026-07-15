/**
 * Unit Tests for PresenceManager
 *
 * Tests user presence tracking, cursor updates, and awareness synchronization
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PresenceManager } from '../presence/presence-manager.js';
import type { Logger } from '@civicpress/core';
import { PresenceEvent } from '../types/messages.js';

describe('PresenceManager', () => {
  let presenceManager: PresenceManager;
  let mockLogger: Logger;

  beforeEach(() => {
    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      isVerbose: () => false,
    } as any;

    presenceManager = new PresenceManager(mockLogger);
  });

  describe('addPresence', () => {
    it('should add user presence and assign color', () => {
      const presence = presenceManager.addPresence('user-1', 'User One');

      expect(presence.userId).toBe('user-1');
      expect(presence.username).toBe('User One');
      expect(presence.color).toBeDefined();
      expect(presence.color).toMatch(/^#[0-9a-f]{6}$/i); // Hex color format
    });

    it('should assign different colors to different users', () => {
      const presence1 = presenceManager.addPresence('user-1', 'User One');
      const presence2 = presenceManager.addPresence('user-2', 'User Two');
      const presence3 = presenceManager.addPresence('user-3', 'User Three');

      expect(presence1.color).not.toBe(presence2.color);
      expect(presence2.color).not.toBe(presence3.color);
    });

    it('should reuse color for same user', () => {
      const presence1 = presenceManager.addPresence('user-1', 'User One');
      presenceManager.removePresence('user-1');
      const presence2 = presenceManager.addPresence('user-1', 'User One');

      expect(presence1.color).toBe(presence2.color);
    });

    it('should track multiple users', () => {
      presenceManager.addPresence('user-1', 'User One');
      presenceManager.addPresence('user-2', 'User Two');
      presenceManager.addPresence('user-3', 'User Three');

      const allPresence = presenceManager.getAllPresence();
      expect(allPresence.length).toBe(3);
    });
  });

  describe('removePresence', () => {
    it('should remove user presence', () => {
      presenceManager.addPresence('user-1', 'User One');
      expect(presenceManager.getAllPresence().length).toBe(1);

      presenceManager.removePresence('user-1');
      expect(presenceManager.getAllPresence().length).toBe(0);
    });

    it('should not throw error when removing non-existent user', () => {
      expect(() => {
        presenceManager.removePresence('non-existent');
      }).not.toThrow();
    });

    it('should remove specific user without affecting others', () => {
      presenceManager.addPresence('user-1', 'User One');
      presenceManager.addPresence('user-2', 'User Two');
      presenceManager.addPresence('user-3', 'User Three');

      presenceManager.removePresence('user-2');

      const allPresence = presenceManager.getAllPresence();
      expect(allPresence.length).toBe(2);
      expect(allPresence.find((p) => p.userId === 'user-1')).toBeDefined();
      expect(allPresence.find((p) => p.userId === 'user-2')).toBeUndefined();
      expect(allPresence.find((p) => p.userId === 'user-3')).toBeDefined();
    });
  });

  describe('updateCursor', () => {
    it('should update cursor position for existing user', () => {
      presenceManager.addPresence('user-1', 'User One');
      presenceManager.updateCursor('user-1', 10);

      const presence = presenceManager.getPresence('user-1');
      expect(presence).toBeDefined();
      expect(presence?.cursor?.position).toBe(10);
    });

    it('should update cursor with selection range', () => {
      presenceManager.addPresence('user-1', 'User One');
      presenceManager.updateCursor('user-1', 5, { start: 3, end: 7 });

      const presence = presenceManager.getPresence('user-1');
      expect(presence?.cursor?.position).toBe(5);
      expect(presence?.cursor?.selection?.start).toBe(3);
      expect(presence?.cursor?.selection?.end).toBe(7);
    });

    it('should update lastActivity timestamp', () => {
      presenceManager.addPresence('user-1', 'User One');
      const before = Date.now();
      presenceManager.updateCursor('user-1', 10);
      const after = Date.now();

      // Access internal state to check lastActivity
      const presenceState = (presenceManager as any).presence.get('user-1');
      expect(presenceState).toBeDefined();
      expect(presenceState.lastActivity).toBeGreaterThanOrEqual(before);
      expect(presenceState.lastActivity).toBeLessThanOrEqual(after);
    });

    it('should not update cursor for non-existent user', () => {
      presenceManager.updateCursor('non-existent', 10);
      const presence = presenceManager.getPresence('non-existent');
      expect(presence).toBeNull();
    });
  });

  describe('getPresence', () => {
    it('should return presence for existing user', () => {
      presenceManager.addPresence('user-1', 'User One');
      const presence = presenceManager.getPresence('user-1');

      expect(presence).toBeDefined();
      expect(presence?.userId).toBe('user-1');
      expect(presence?.username).toBe('User One');
    });

    it('should return null for non-existent user', () => {
      const presence = presenceManager.getPresence('non-existent');
      expect(presence).toBeNull();
    });

    it('should return presence with cursor information', () => {
      presenceManager.addPresence('user-1', 'User One');
      presenceManager.updateCursor('user-1', 15, { start: 10, end: 20 });

      const presence = presenceManager.getPresence('user-1');
      expect(presence?.cursor).toBeDefined();
      expect(presence?.cursor?.position).toBe(15);
      expect(presence?.cursor?.selection?.start).toBe(10);
      expect(presence?.cursor?.selection?.end).toBe(20);
    });
  });

  describe('getAllPresence', () => {
    it('should return empty array when no users present', () => {
      const allPresence = presenceManager.getAllPresence();
      expect(allPresence).toEqual([]);
    });

    it('should return all active presences', () => {
      presenceManager.addPresence('user-1', 'User One');
      presenceManager.addPresence('user-2', 'User Two');
      presenceManager.addPresence('user-3', 'User Three');

      const allPresence = presenceManager.getAllPresence();
      expect(allPresence.length).toBe(3);
      expect(allPresence.map((p) => p.userId)).toContain('user-1');
      expect(allPresence.map((p) => p.userId)).toContain('user-2');
      expect(allPresence.map((p) => p.userId)).toContain('user-3');
    });

    it('should not return removed users', () => {
      presenceManager.addPresence('user-1', 'User One');
      presenceManager.addPresence('user-2', 'User Two');
      presenceManager.removePresence('user-1');

      const allPresence = presenceManager.getAllPresence();
      expect(allPresence.length).toBe(1);
      expect(allPresence[0].userId).toBe('user-2');
    });
  });

  describe('createPresenceMessage', () => {
    it('should create JOINED event message', () => {
      presenceManager.addPresence('user-1', 'User One');
      const message = presenceManager.createPresenceMessage(
        PresenceEvent.JOINED,
        'user-1',
        'User One',
        '#3b82f6'
      );

      expect(message.type).toBe('presence');
      expect(message.event).toBe(PresenceEvent.JOINED);
      expect(message.user.id).toBe('user-1');
      expect(message.user.name).toBe('User One');
      expect(message.user.color).toBe('#3b82f6');
    });

    it('should create LEFT event message', () => {
      const message = presenceManager.createPresenceMessage(
        PresenceEvent.LEFT,
        'user-1',
        'User One',
        '#3b82f6'
      );

      expect(message.type).toBe('presence');
      expect(message.event).toBe(PresenceEvent.LEFT);
      expect(message.user.id).toBe('user-1');
    });

    it('should create CURSOR event message with cursor data', () => {
      presenceManager.addPresence('user-1', 'User One');
      presenceManager.updateCursor('user-1', 10, { start: 5, end: 15 });

      const message = presenceManager.createPresenceMessage(
        PresenceEvent.CURSOR,
        'user-1',
        'User One',
        '#3b82f6',
        { position: 10, selection: { start: 5, end: 15 } }
      );

      expect(message.type).toBe('presence');
      expect(message.event).toBe(PresenceEvent.CURSOR);
      expect(message.cursor).toBeDefined();
      expect(message.cursor?.position).toBe(10);
      expect(message.cursor?.selection?.start).toBe(5);
      expect(message.cursor?.selection?.end).toBe(15);
    });

    it('should create AWARENESS event message', () => {
      // Note: createPresenceMessage doesn't support awareness parameter
      // This test verifies the method signature
      const message = presenceManager.createPresenceMessage(
        PresenceEvent.AWARENESS,
        'user-1',
        'User One',
        '#3b82f6'
      );

      expect(message.type).toBe('presence');
      expect(message.event).toBe(PresenceEvent.AWARENESS);
      expect(message.user.id).toBe('user-1');
    });
  });

  describe('updateIdle', () => {
    it('should mark user as idle', () => {
      presenceManager.addPresence('user-1', 'User One');
      presenceManager.updateIdle('user-1', true);

      const presence = presenceManager.getPresence('user-1');
      expect(presence?.idle).toBe(true);
    });

    it('should mark user as not idle', () => {
      presenceManager.addPresence('user-1', 'User One');
      presenceManager.updateIdle('user-1', true);
      presenceManager.updateIdle('user-1', false);

      const presence = presenceManager.getPresence('user-1');
      expect(presence?.idle).toBe(false);
    });

    it('should not throw error for non-existent user', () => {
      expect(() => {
        presenceManager.updateIdle('non-existent', true);
      }).not.toThrow();
    });
  });

  describe('cleanupIdle', () => {
    it('should remove users idle longer than threshold', () => {
      presenceManager.addPresence('user-1', 'User One');
      presenceManager.addPresence('user-2', 'User Two');
      presenceManager.addPresence('user-3', 'User Three');

      // Mark user-1 as idle and set old lastActivity (simulating idle user)
      presenceManager.updateIdle('user-1', true);
      // Access internal state to set old lastActivity
      const presenceState = (presenceManager as any).presence.get('user-1');
      if (presenceState) {
        presenceState.lastActivity = Date.now() - 60000; // 1 minute ago
      }

      presenceManager.cleanupIdle(30); // 30 second threshold (in seconds)

      const allPresence = presenceManager.getAllPresence();
      expect(allPresence.length).toBe(2);
      expect(allPresence.find((p) => p.userId === 'user-1')).toBeUndefined();
    });

    it('should not remove active users', () => {
      presenceManager.addPresence('user-1', 'User One');
      presenceManager.addPresence('user-2', 'User Two');

      // Update cursor to mark as active (updates lastActivity)
      presenceManager.updateCursor('user-1', 10);

      presenceManager.cleanupIdle(30); // 30 second threshold

      const allPresence = presenceManager.getAllPresence();
      expect(allPresence.length).toBe(2);
    });
  });
});
