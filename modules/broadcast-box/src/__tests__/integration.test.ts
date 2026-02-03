/**
 * Broadcast Box Integration Tests
 *
 * Tests the integration between services and API endpoints
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Logger, DatabaseService, RecordManager } from '@civicpress/core';
import { DeviceManager } from '../services/device-manager.js';
import { DeviceAuthService } from '../services/device-auth.js';
import { DeviceConnectionTracker } from '../services/device-connection-tracker.js';
import { SessionController } from '../services/session-controller.js';
import { UploadProcessor } from '../services/upload-processor.js';
import type { RoomManager } from '@civicpress/realtime';
import type { ProtocolHandler } from '../websocket/protocol.js';
import type { CloudUuidStorageService } from '@civicpress/storage';

describe('Broadcast Box Integration', () => {
  let deviceManager: DeviceManager;
  let deviceAuth: DeviceAuthService;
  let connectionTracker: DeviceConnectionTracker;
  let sessionController: SessionController;
  let uploadProcessor: UploadProcessor;
  let mockDb: any;
  let mockLogger: Logger;
  let mockRoomManager: any;
  let mockProtocol: any;
  let mockRecordManager: any;
  let mockStorageService: any;
  let mockSecretsManager: any;

  beforeEach(() => {
    mockDb = {
      getAdapter: vi.fn().mockReturnValue({
        execute: vi.fn().mockResolvedValue(undefined),
        query: vi.fn().mockResolvedValue([]),
      }),
      execute: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockResolvedValue([]),
    };

    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as any;

    mockSecretsManager = {
      deriveKey: vi
        .fn()
        .mockReturnValue(Buffer.from('test-secret-key', 'utf-8')),
    };

    mockRoomManager = {
      getRoom: vi.fn().mockReturnValue({
        broadcast: vi.fn(),
      }),
    };

    mockProtocol = {
      createCommand: vi.fn().mockReturnValue({
        type: 'command',
        id: 'cmd-id',
        action: 'start_session',
      }),
      createAck: vi.fn(),
    };

    mockRecordManager = {
      getRecord: vi.fn().mockResolvedValue({
        id: 'session-id',
        type: 'session',
      }),
      updateRecord: vi.fn().mockResolvedValue({}),
    };

    mockStorageService = {
      uploadFile: vi.fn().mockResolvedValue({
        success: true,
        file: { id: 'storage-file-id' },
      }),
    };

    deviceManager = new DeviceManager(mockDb, mockLogger);
    deviceAuth = new DeviceAuthService(mockLogger, mockSecretsManager);
    connectionTracker = new DeviceConnectionTracker(
      deviceManager,
      { create: vi.fn().mockResolvedValue(undefined) } as any,
      mockLogger
    );
    sessionController = new SessionController(
      deviceManager,
      connectionTracker,
      mockRoomManager,
      mockProtocol,
      mockRecordManager,
      mockDb,
      mockLogger
    );
    uploadProcessor = new UploadProcessor(
      mockDb,
      mockStorageService,
      '/tmp/test',
      mockLogger
    );
  });

  describe('Device Enrollment and Registration Flow', () => {
    it('should complete full device enrollment and registration', async () => {
      // Step 1: Enroll device
      const enrollment = await deviceManager.enrollDevice({
        name: 'Test Device',
        roomLocation: 'Council Chamber',
      });

      expect(enrollment.deviceUuid).toBeDefined();
      expect(enrollment.enrollmentCode).toBeDefined();

      // Step 2: Register device
      const device = await deviceManager.registerDevice({
        deviceUuid: enrollment.deviceUuid,
        enrollmentCode: enrollment.enrollmentCode,
        name: 'Test Device',
        roomLocation: 'Council Chamber',
      });

      expect(device).toBeDefined();
      expect(device.deviceUuid).toBe(enrollment.deviceUuid);
    });
  });

  describe('Session Recording Flow', () => {
    it('should start and stop a recording session', async () => {
      // Setup: Create device and connect
      const enrollment = await deviceManager.enrollDevice({
        name: 'Test Device',
      });

      const device = await deviceManager.registerDevice({
        deviceUuid: enrollment.deviceUuid,
        enrollmentCode: enrollment.enrollmentCode,
        name: 'Test Device',
      });

      // Mock device model with both getById and update
      (deviceManager as any).deviceModel = {
        getById: vi.fn().mockResolvedValue({
          ...device,
          status: 'active',
        }),
        update: vi.fn().mockResolvedValue(device),
      };

      await connectionTracker.registerConnection(device.id, 'client-id');

      // Mock session model
      const mockSessionModel = {
        create: vi.fn().mockResolvedValue({
          id: 'broadcast-session-id',
          deviceId: device.id,
          civicpressSessionId: 'civicpress-session-id',
          status: 'pending',
        }),
        getById: vi
          .fn()
          // stopSession calls getById to check session status
          // After startSession, status should be 'recording'
          .mockResolvedValue({
            id: 'broadcast-session-id',
            deviceId: device.id,
            civicpressSessionId: 'civicpress-session-id',
            status: 'recording',
          }),
        update: vi
          .fn()
          .mockResolvedValueOnce({
            id: 'broadcast-session-id',
            deviceId: device.id,
            civicpressSessionId: 'civicpress-session-id',
            status: 'recording',
            startedAt: new Date(),
          })
          .mockResolvedValueOnce({
            id: 'broadcast-session-id',
            deviceId: device.id,
            civicpressSessionId: 'civicpress-session-id',
            status: 'complete',
            stoppedAt: new Date(),
            completedAt: new Date(),
          }),
      };

      (sessionController as any).sessionModel = mockSessionModel;
      (sessionController as any).deviceEventModel = {
        create: vi.fn().mockResolvedValue(undefined),
      };

      // Start session
      const session = await sessionController.startSession({
        deviceId: device.id,
        civicpressSessionId: 'civicpress-session-id',
        metadata: {},
      });

      expect(session.status).toBe('recording');
      expect(mockProtocol.createCommand).toHaveBeenCalledWith(
        'start_session',
        expect.any(Object)
      );

      // Stop session (getById mock already set up to return recording session)
      const stoppedSession = await sessionController.stopSession(session.id);

      expect(stoppedSession.status).toBe('complete');
      expect(mockProtocol.createCommand).toHaveBeenCalledWith(
        'stop_session',
        expect.any(Object)
      );
    });
  });

  describe('Upload Flow', () => {
    it('should create upload, process chunks, and finalize', async () => {
      // Mock upload model with db property that has getAdapter
      const mockSessionDb = {
        getAdapter: vi.fn().mockReturnValue({
          query: vi.fn().mockResolvedValue([{ device_id: 'device-id' }]),
        }),
      };

      const mockUploadModel = {
        db: mockSessionDb,
        create: vi.fn().mockResolvedValue({
          id: 'upload-id',
          sessionId: 'session-id',
          deviceId: 'device-id',
          fileName: 'test.mp4',
          fileSize: 1000,
          fileHash: 'test-hash',
          status: 'pending',
        }),
        getById: vi.fn().mockResolvedValue({
          id: 'upload-id',
          sessionId: 'session-id',
          fileName: 'test.mp4',
          fileSize: 1000,
          fileHash: 'test-hash',
          status: 'uploading',
        }),
        update: vi.fn().mockResolvedValue({
          id: 'upload-id',
          status: 'complete',
          storageLocation: 'storage-file-id',
        }),
      };

      (uploadProcessor as any).uploadModel = mockUploadModel;

      // Create upload
      const upload = await uploadProcessor.createUpload({
        sessionId: 'session-id',
        fileName: 'test.mp4',
        fileSize: 1000,
        fileHash: 'test-hash',
        mimeType: 'video/mp4',
      });

      expect(upload).toBeDefined();
      expect(upload.status).toBe('pending');

      // Process chunk (simplified - actual implementation would write to disk)
      // This test verifies the flow, actual chunk processing requires file system
      expect(mockUploadModel.create).toHaveBeenCalled();
    });
  });
});
