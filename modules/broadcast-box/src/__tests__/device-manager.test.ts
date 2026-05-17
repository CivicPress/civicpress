/**
 * DeviceManager Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DeviceManager } from '../services/device-manager.js';
import { DeviceAuthService } from '../services/device-auth.js';
import type { DatabaseService, Logger } from '@civicpress/core';

describe('DeviceManager', () => {
  let deviceManager: DeviceManager;
  let mockDb: any;
  let mockLogger: Logger;
  let mockDeviceAuth: DeviceAuthService;

  beforeEach(() => {
    // Mock database with getAdapter
    mockDb = {
      getAdapter: vi.fn().mockReturnValue({
        execute: vi.fn(),
        query: vi.fn(),
      }),
      execute: vi.fn(),
      query: vi.fn(),
    };

    // Mock logger
    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as any;

    // Mock device auth
    mockDeviceAuth = {
      generateToken: vi
        .fn()
        .mockResolvedValue({ token: 'mock-token', expiresAt: new Date() }),
      validateToken: vi.fn(),
    } as any;

    deviceManager = new DeviceManager(mockDb, mockLogger);
    (deviceManager as any).deviceAuthService = mockDeviceAuth;
  });

  describe('enrollDevice', () => {
    it('should enroll a new device', async () => {
      const name = 'Test Device';
      const roomLocation = 'Council Chamber';

      const result = await deviceManager.enrollDevice({
        name,
        roomLocation,
      });

      expect(result.deviceUuid).toBeDefined();
      expect(result.enrollmentCode).toBeDefined();
      expect(typeof result.deviceUuid).toBe('string');
      expect(typeof result.enrollmentCode).toBe('string');
      expect(result.enrollmentCode.length).toBeGreaterThan(0);
    });
  });

  describe('registerDevice', () => {
    it('should register an enrolled device', async () => {
      const deviceUuid = 'test-device-uuid';
      const name = 'Test Device';

      const mockDeviceModel = {
        getByDeviceUuid: vi.fn().mockResolvedValue(null), // Device doesn't exist yet
        create: vi.fn().mockResolvedValue({
          id: 'device-id',
          deviceUuid,
          name,
          status: 'enrolled',
          capabilities: {},
          config: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      };

      const mockDeviceEventModel = {
        create: vi.fn().mockResolvedValue(undefined),
      };

      (deviceManager as any).deviceModel = mockDeviceModel;
      (deviceManager as any).deviceEventModel = mockDeviceEventModel;

      const result = await deviceManager.registerDevice({
        deviceUuid,
        enrollmentCode: 'ABC123',
        name,
      });

      expect(result).toBeDefined();
      expect(result.status).toBe('enrolled');
      expect(mockDeviceModel.create).toHaveBeenCalled();
    });

    it('should throw error if device already registered', async () => {
      const deviceUuid = 'test-device-uuid';
      const mockDeviceModel = {
        getByDeviceUuid: vi.fn().mockResolvedValue({
          id: 'device-id',
          deviceUuid,
          name: 'Existing Device',
          status: 'active',
        }),
      };

      (deviceManager as any).deviceModel = mockDeviceModel;

      await expect(
        deviceManager.registerDevice({
          deviceUuid,
          enrollmentCode: 'ABC123',
          name: 'Test Device',
        })
      ).rejects.toThrow('already registered');
    });
  });

  describe('updateDevice', () => {
    it('should update device configuration', async () => {
      const deviceId = 'device-id';
      const updates = {
        name: 'Updated Name',
        config: { quality: 'high' },
      };

      const mockDeviceModel = {
        getById: vi.fn().mockResolvedValue({
          id: deviceId,
          deviceUuid: 'test-uuid',
          name: 'Old Name',
          status: 'active',
          capabilities: {},
          config: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
        update: vi.fn().mockResolvedValue({
          id: deviceId,
          deviceUuid: 'test-uuid',
          name: updates.name,
          status: 'active',
          capabilities: {},
          config: updates.config,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      };

      (deviceManager as any).deviceModel = mockDeviceModel;

      const result = await deviceManager.updateDevice(deviceId, updates);

      expect(result.name).toBe(updates.name);
      expect(result.config).toEqual(updates.config);
      expect(mockDeviceModel.update).toHaveBeenCalled();
    });

    it('should throw error if device not found', async () => {
      const mockDeviceModel = {
        getById: vi.fn().mockResolvedValue(null),
      };

      (deviceManager as any).deviceModel = mockDeviceModel;

      await expect(
        deviceManager.updateDevice('unknown-id', { name: 'Test' })
      ).rejects.toThrow('Device not found');
    });
  });

  describe('revokeDevice', () => {
    it('should revoke a device', async () => {
      const deviceId = 'device-id';

      const mockDeviceModel = {
        getById: vi.fn().mockResolvedValue({
          id: deviceId,
          deviceUuid: 'test-uuid',
          name: 'Test Device',
          status: 'active',
          capabilities: {},
          config: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
        update: vi.fn().mockResolvedValue({
          id: deviceId,
          status: 'revoked',
        }),
      };

      (deviceManager as any).deviceModel = mockDeviceModel;

      await deviceManager.revokeDevice(deviceId);

      expect(mockDeviceModel.update).toHaveBeenCalledWith(deviceId, {
        status: 'revoked',
      });
    });
  });

  describe('listDevices', () => {
    it('should list devices with filters', async () => {
      const filters = { status: 'active' };

      const mockDeviceModel = {
        list: vi.fn().mockResolvedValue([
          {
            id: 'device-1',
            deviceUuid: 'uuid-1',
            name: 'Device 1',
            status: 'active',
            capabilities: {},
            config: {},
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          {
            id: 'device-2',
            deviceUuid: 'uuid-2',
            name: 'Device 2',
            status: 'active',
            capabilities: {},
            config: {},
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ]),
      };

      (deviceManager as any).deviceModel = mockDeviceModel;

      const result = await deviceManager.listDevices(filters);

      expect(result).toHaveLength(2);
      expect(mockDeviceModel.list).toHaveBeenCalledWith(filters);
    });
  });
});
