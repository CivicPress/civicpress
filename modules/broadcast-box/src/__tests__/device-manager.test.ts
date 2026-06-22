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

  // One-time, revocable enrollment (BB-HW-013): a code is consumed on first use
  // and a used/expired code can never register again. `findByCode` only returns
  // UNUSED codes (its SQL filters `used_at IS NULL`), so a consumed code stops
  // resolving — modelled below by returning null for the used case.
  describe('registerDevice', () => {
    const enrollmentCode = 'ABCD-EFGH-JKLM';

    /** A persisted code fixture whose hash matches `enrollmentCode`. */
    async function freshCode(deviceUuid: string) {
      const bcrypt = await import('bcrypt');
      return {
        id: 'enrollment-code-id',
        deviceUuid,
        enrollmentCodeHash: await bcrypt.hash(
          enrollmentCode.trim().toUpperCase(),
          4 // low cost: test-only fixture, real codes use 12
        ),
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        usedAt: null as Date | null,
      };
    }

    it('consumes a fresh code and registers a new device', async () => {
      const deviceUuid = 'test-device-uuid';
      const name = 'Test Device';
      const code = await freshCode(deviceUuid);

      const mockEnrollmentCodeModel = {
        findByCode: vi.fn().mockResolvedValue(code),
        isExpired: vi.fn().mockReturnValue(false),
        isUsed: vi.fn().mockReturnValue(false),
        markAsUsed: vi.fn().mockResolvedValue(undefined),
      };
      const mockDeviceModel = {
        getByDeviceUuid: vi.fn().mockResolvedValue(null), // new device
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

      (deviceManager as any).enrollmentCodeModel = mockEnrollmentCodeModel;
      (deviceManager as any).deviceModel = mockDeviceModel;
      (deviceManager as any).deviceEventModel = mockDeviceEventModel;

      const result = await deviceManager.registerDevice({
        deviceUuid,
        enrollmentCode,
        name,
      });

      expect(result.status).toBe('enrolled');
      expect(mockDeviceModel.create).toHaveBeenCalled();
      // The one-time guarantee: the code is consumed on success.
      expect(mockEnrollmentCodeModel.markAsUsed).toHaveBeenCalledWith(
        code.id,
        null
      );
    });

    it('rejects an expired enrollment code and does not register', async () => {
      const deviceUuid = 'test-device-uuid';
      const code = await freshCode(deviceUuid);
      code.expiresAt = new Date(Date.now() - 60 * 1000); // expired

      const mockEnrollmentCodeModel = {
        findByCode: vi.fn().mockResolvedValue(code),
        isExpired: vi.fn().mockReturnValue(true),
        isUsed: vi.fn().mockReturnValue(false),
        markAsUsed: vi.fn().mockResolvedValue(undefined),
      };
      const mockDeviceModel = {
        getByDeviceUuid: vi.fn().mockResolvedValue(null),
        create: vi.fn(),
      };

      (deviceManager as any).enrollmentCodeModel = mockEnrollmentCodeModel;
      (deviceManager as any).deviceModel = mockDeviceModel;

      await expect(
        deviceManager.registerDevice({ deviceUuid, enrollmentCode, name: 'X' })
      ).rejects.toThrow('expired');
      expect(mockDeviceModel.create).not.toHaveBeenCalled();
      expect(mockEnrollmentCodeModel.markAsUsed).not.toHaveBeenCalled();
    });

    it('rejects an already-used code (a consumed code no longer resolves)', async () => {
      const deviceUuid = 'test-device-uuid';
      // A used code is filtered out by findByCode's `used_at IS NULL` query.
      const mockEnrollmentCodeModel = {
        findByCode: vi.fn().mockResolvedValue(null),
      };
      const mockDeviceModel = {
        getByDeviceUuid: vi.fn().mockResolvedValue(null),
        create: vi.fn(),
      };

      (deviceManager as any).enrollmentCodeModel = mockEnrollmentCodeModel;
      (deviceManager as any).deviceModel = mockDeviceModel;

      await expect(
        deviceManager.registerDevice({ deviceUuid, enrollmentCode, name: 'X' })
      ).rejects.toThrow('Invalid enrollment code');
      expect(mockDeviceModel.create).not.toHaveBeenCalled();
    });

    it('re-registers an existing device only with a fresh code, consuming it', async () => {
      const deviceUuid = 'test-device-uuid';
      const code = await freshCode(deviceUuid);
      const existing = {
        id: 'device-id',
        deviceUuid,
        name: 'Existing Device',
        status: 'active',
        capabilities: {},
        config: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockEnrollmentCodeModel = {
        findByCode: vi.fn().mockResolvedValue(code),
        isExpired: vi.fn().mockReturnValue(false),
        isUsed: vi.fn().mockReturnValue(false),
        markAsUsed: vi.fn().mockResolvedValue(undefined),
      };
      const mockDeviceModel = {
        getByDeviceUuid: vi.fn().mockResolvedValue(existing),
        create: vi.fn(),
      };

      (deviceManager as any).enrollmentCodeModel = mockEnrollmentCodeModel;
      (deviceManager as any).deviceModel = mockDeviceModel;

      const result = await deviceManager.registerDevice({
        deviceUuid,
        enrollmentCode,
        name: 'Test Device',
      });

      expect(result.id).toBe(existing.id);
      expect(result.deviceUuid).toBe(deviceUuid);
      // Re-pairing consumes the fresh code; no duplicate device is created.
      expect(mockEnrollmentCodeModel.markAsUsed).toHaveBeenCalledWith(
        code.id,
        null
      );
      expect(mockDeviceModel.create).not.toHaveBeenCalled();
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
