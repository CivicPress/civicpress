/**
 * DeviceConnectionTracker Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DeviceConnectionTracker } from '../services/device-connection-tracker.js';
import type {
  DeviceManager,
  DeviceEventModel,
  Logger,
} from '../types/index.js';

describe('DeviceConnectionTracker', () => {
  let tracker: DeviceConnectionTracker;
  let mockDeviceManager: any;
  let mockDeviceEventModel: any;
  let mockLogger: Logger;

  beforeEach(() => {
    mockDeviceManager = {
      updateLastSeen: vi.fn().mockResolvedValue(undefined),
    };

    mockDeviceEventModel = {
      create: vi.fn().mockResolvedValue(undefined),
    };

    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as any;

    tracker = new DeviceConnectionTracker(
      mockDeviceManager,
      mockDeviceEventModel,
      mockLogger
    );
  });

  describe('registerConnection', () => {
    it('should register a device connection', async () => {
      const deviceId = 'device-id';
      const clientId = 'client-id';

      await tracker.registerConnection(deviceId, clientId, 'cloud');

      const state = tracker.getConnectionState(deviceId);
      expect(state).toBeDefined();
      expect(state?.connected).toBe(true);
      expect(state?.clientId).toBe(clientId);
      expect(state?.endpoint).toBe('cloud');
      expect(mockDeviceManager.updateLastSeen).toHaveBeenCalledWith(deviceId);
      expect(mockDeviceEventModel.create).toHaveBeenCalled();
    });
  });

  describe('unregisterConnection', () => {
    it('should unregister a device connection', async () => {
      const deviceId = 'device-id';
      const clientId = 'client-id';

      await tracker.registerConnection(deviceId, clientId);
      await tracker.unregisterConnection(deviceId, clientId);

      const state = tracker.getConnectionState(deviceId);
      expect(state).toBeNull();
      expect(mockDeviceEventModel.create).toHaveBeenCalledTimes(2); // connect + disconnect
    });
  });

  describe('updateHeartbeat', () => {
    it('should update heartbeat timestamp', async () => {
      const deviceId = 'device-id';
      const clientId = 'client-id';

      await tracker.registerConnection(deviceId, clientId);
      const stateBefore = tracker.getConnectionState(deviceId);
      const lastHeartbeatBefore = stateBefore?.lastHeartbeat;

      // Wait a bit to ensure timestamp difference
      await new Promise((resolve) => setTimeout(resolve, 10));

      await tracker.updateHeartbeat(deviceId);

      const stateAfter = tracker.getConnectionState(deviceId);
      expect(stateAfter?.lastHeartbeat).toBeDefined();
      if (lastHeartbeatBefore && stateAfter?.lastHeartbeat) {
        expect(stateAfter.lastHeartbeat.getTime()).toBeGreaterThan(
          lastHeartbeatBefore.getTime()
        );
      }
      expect(mockDeviceManager.updateLastSeen).toHaveBeenCalledWith(deviceId);
    });

    it('should handle heartbeat for unregistered device', async () => {
      await tracker.updateHeartbeat('unknown-device');

      // Should not throw, just log warning (check via coreWarn which is used internally)
      // The warning is logged via coreWarn, not directly via logger
      expect(mockDeviceManager.updateLastSeen).not.toHaveBeenCalled();
    });
  });

  describe('updateDeviceState', () => {
    it('should update device state', async () => {
      const deviceId = 'device-id';
      const clientId = 'client-id';

      await tracker.registerConnection(deviceId, clientId);

      tracker.updateDeviceState(deviceId, {
        status: 'recording',
        activeSessionId: 'session-id',
      });

      const state = tracker.getConnectionState(deviceId);
      expect(state?.state.status).toBe('recording');
      expect(state?.state.activeSessionId).toBe('session-id');
    });
  });

  describe('isConnected', () => {
    it('should return true for connected device', async () => {
      const deviceId = 'device-id';
      await tracker.registerConnection(deviceId, 'client-id');

      expect(tracker.isConnected(deviceId)).toBe(true);
    });

    it('should return false for disconnected device', () => {
      expect(tracker.isConnected('unknown-device')).toBe(false);
    });
  });

  describe('getConnectedDevices', () => {
    it('should return list of connected device IDs', async () => {
      await tracker.registerConnection('device-1', 'client-1');
      await tracker.registerConnection('device-2', 'client-2');
      await tracker.unregisterConnection('device-2', 'client-2');

      const connected = tracker.getConnectedDevices();

      expect(connected).toContain('device-1');
      expect(connected).not.toContain('device-2');
    });
  });

  describe('cleanupStaleConnections', () => {
    it('should remove stale connections', async () => {
      const deviceId = 'device-id';
      await tracker.registerConnection(deviceId, 'client-id');

      // Manually set old heartbeat (simulating stale connection)
      const state = tracker.getConnectionState(deviceId);
      if (state) {
        state.lastHeartbeat = new Date(Date.now() - 10 * 60 * 1000); // 10 minutes ago
      }

      await tracker.cleanupStaleConnections(5 * 60 * 1000); // 5 minute timeout

      expect(tracker.isConnected(deviceId)).toBe(false);
    });

    it('should keep active connections', async () => {
      const deviceId = 'device-id';
      await tracker.registerConnection(deviceId, 'client-id');

      // Update heartbeat to recent time
      await tracker.updateHeartbeat(deviceId);

      await tracker.cleanupStaleConnections(5 * 60 * 1000); // 5 minute timeout

      expect(tracker.isConnected(deviceId)).toBe(true);
    });
  });

  describe('getStats', () => {
    it('should return connection statistics', async () => {
      await tracker.registerConnection('device-1', 'client-1');
      await tracker.registerConnection('device-2', 'client-2');
      await tracker.unregisterConnection('device-2', 'client-2');

      const stats = tracker.getStats();

      expect(stats.totalConnections).toBe(1); // Only device-1 remains
      expect(stats.connectedDevices).toBe(1);
      expect(stats.devices).toHaveLength(1);
    });
  });
});
