/**
 * SessionController Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SessionController } from '../services/session-controller.js';
import type { Logger, RecordManager } from '@civicpress/core';
import type { DeviceManager } from '../services/device-manager.js';
import type { DeviceConnectionTracker } from '../services/device-connection-tracker.js';
import type { RoomManager } from '@civicpress/realtime';
import type { ProtocolHandler } from '../websocket/protocol.js';

describe('SessionController', () => {
  let sessionController: SessionController;
  let mockDeviceManager: any;
  let mockConnectionTracker: any;
  let mockRoomManager: any;
  let mockProtocol: any;
  let mockRecordManager: any;
  let mockLogger: Logger;

  beforeEach(() => {
    mockDeviceManager = {
      getDevice: vi.fn(),
    };

    mockConnectionTracker = {
      isConnected: vi.fn(),
      getConnectionState: vi.fn(),
      updateDeviceState: vi.fn(),
    };

    mockRoomManager = {
      getRoom: vi.fn(),
    };

    mockProtocol = {
      createCommand: vi.fn(),
    };

    mockRecordManager = {
      getRecord: vi.fn(),
    };

    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as any;

    // Mock database (includes getDraft for draft record resolution)
    const mockDb = {
      getAdapter: vi.fn().mockReturnValue({
        execute: vi.fn(),
        query: vi.fn(),
      }),
      getDraft: vi.fn().mockResolvedValue(null),
    };

    // Mock session model
    const mockSessionModel = {
      create: vi.fn(),
      getById: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      getByCivicPressSessionId: vi.fn(),
      list: vi.fn(),
    };

    // Mock device event model
    const mockDeviceEventModel = {
      create: vi.fn(),
    };

    sessionController = new SessionController(
      mockDeviceManager,
      mockConnectionTracker,
      mockRoomManager,
      mockProtocol,
      mockRecordManager,
      mockDb as any,
      mockLogger
    );

    // Inject mocks
    (sessionController as any).sessionModel = mockSessionModel;
    (sessionController as any).deviceEventModel = mockDeviceEventModel;
  });

  describe('startSession', () => {
    it('should start a recording session', async () => {
      const deviceId = 'device-id';
      const civicpressSessionId = 'session-id';
      const request = {
        deviceId,
        civicpressSessionId,
        metadata: {},
      };

      mockDeviceManager.getDevice.mockResolvedValue({
        id: deviceId,
        status: 'active',
      });

      mockConnectionTracker.isConnected.mockReturnValue(true);
      mockConnectionTracker.getConnectionState.mockReturnValue({
        state: { status: 'idle' },
      });

      mockRecordManager.getRecord.mockResolvedValue({
        id: civicpressSessionId,
        type: 'session',
      });

      const mockRoom = {
        broadcast: vi.fn(),
      };
      mockRoomManager.getRoom.mockReturnValue(mockRoom);

      const mockSessionModel = (sessionController as any).sessionModel;
      const sessionId = 'broadcast-session-id';
      mockSessionModel.create.mockResolvedValue({
        id: sessionId,
        deviceId,
        civicpressSessionId,
        status: 'pending',
      });

      mockSessionModel.update.mockResolvedValue({
        id: sessionId,
        deviceId,
        civicpressSessionId,
        status: 'recording',
        startedAt: new Date(),
      });

      // Mock getById for the update call
      mockSessionModel.getById.mockResolvedValue({
        id: sessionId,
        deviceId,
        civicpressSessionId,
        status: 'pending',
      });

      const result = await sessionController.startSession(request);

      expect(result).toBeDefined();
      expect(result.status).toBe('recording');
      expect(mockProtocol.createCommand).toHaveBeenCalledWith(
        'start_session',
        expect.objectContaining({
          sessionId: 'broadcast-session-id',
          civicpressSessionId,
        })
      );
      expect(mockRoom.broadcast).toHaveBeenCalled();
    });

    it('should throw error if device not found', async () => {
      mockDeviceManager.getDevice.mockResolvedValue(null);

      await expect(
        sessionController.startSession({
          deviceId: 'unknown',
          civicpressSessionId: 'session-id',
        })
      ).rejects.toThrow('Device not found');
    });

    it('should throw error if device not active', async () => {
      mockDeviceManager.getDevice.mockResolvedValue({
        id: 'device-id',
        status: 'suspended',
      });

      await expect(
        sessionController.startSession({
          deviceId: 'device-id',
          civicpressSessionId: 'session-id',
        })
      ).rejects.toThrow('not active');
    });

    it('should throw error if device not connected', async () => {
      mockDeviceManager.getDevice.mockResolvedValue({
        id: 'device-id',
        status: 'active',
      });

      mockConnectionTracker.isConnected.mockReturnValue(false);

      await expect(
        sessionController.startSession({
          deviceId: 'device-id',
          civicpressSessionId: 'session-id',
        })
      ).rejects.toThrow('not connected');
    });

    it('should throw error if device already recording', async () => {
      mockDeviceManager.getDevice.mockResolvedValue({
        id: 'device-id',
        status: 'active',
      });

      mockConnectionTracker.isConnected.mockReturnValue(true);
      mockConnectionTracker.getConnectionState.mockReturnValue({
        state: { status: 'recording', activeSessionId: 'existing-session' },
      });

      await expect(
        sessionController.startSession({
          deviceId: 'device-id',
          civicpressSessionId: 'session-id',
        })
      ).rejects.toThrow('already recording');
    });

    it('should accept session record that exists only as draft', async () => {
      const deviceId = 'device-id';
      const civicpressSessionId = 'record-123';
      const request = {
        deviceId,
        civicpressSessionId,
        metadata: {},
      };

      mockDeviceManager.getDevice.mockResolvedValue({
        id: deviceId,
        status: 'active',
      });
      mockConnectionTracker.isConnected.mockReturnValue(true);
      mockConnectionTracker.getConnectionState.mockReturnValue({
        state: { status: 'idle' },
      });

      // Published record not found; draft exists
      mockRecordManager.getRecord.mockResolvedValue(null);
      const mockDb = (sessionController as any).db;
      mockDb.getDraft.mockResolvedValue({
        id: civicpressSessionId,
        type: 'session',
      });

      const mockRoom = { broadcast: vi.fn() };
      mockRoomManager.getRoom.mockReturnValue(mockRoom);

      const mockSessionModel = (sessionController as any).sessionModel;
      mockSessionModel.create.mockResolvedValue({
        id: 'broadcast-session-id',
        deviceId,
        civicpressSessionId,
        status: 'pending',
      });
      mockSessionModel.update.mockResolvedValue({
        id: 'broadcast-session-id',
        deviceId,
        civicpressSessionId,
        status: 'recording',
      });

      const result = await sessionController.startSession(request);

      expect(mockRecordManager.getRecord).toHaveBeenCalledWith(
        civicpressSessionId
      );
      expect(mockDb.getDraft).toHaveBeenCalledWith(civicpressSessionId);
      expect(result.civicpressSessionId).toBe(civicpressSessionId);
    });
  });

  describe('stopSession', () => {
    it('should stop a recording session', async () => {
      const sessionId = 'session-id';
      const deviceId = 'device-id';

      const mockSessionModel = (sessionController as any).sessionModel;
      mockSessionModel.getById.mockResolvedValue({
        id: sessionId,
        deviceId,
        status: 'recording',
      });

      const now = new Date();
      mockSessionModel.update.mockResolvedValue({
        id: sessionId,
        deviceId,
        status: 'stopping',
        stoppedAt: now,
      });

      const mockRoom = {
        broadcast: vi.fn(),
      };
      mockRoomManager.getRoom.mockReturnValue(mockRoom);

      const result = await sessionController.stopSession(sessionId);

      // Truthful FSM: stop leaves the session `stopping` (device still encoding +
      // uploading); the upload-finalize hook moves it to `complete` (bb-009).
      expect(result.status).toBe('stopping');
      expect(mockProtocol.createCommand).toHaveBeenCalledWith(
        'stop_session',
        expect.objectContaining({ sessionId })
      );
      expect(mockRoom.broadcast).toHaveBeenCalled();
    });

    it('should throw error if session not found', async () => {
      const mockSessionModel = (sessionController as any).sessionModel;
      mockSessionModel.getById.mockResolvedValue(null);

      await expect(
        sessionController.stopSession('unknown-session')
      ).rejects.toThrow('Session not found');
    });

    it('should return session idempotently when already stopping or complete', async () => {
      const mockSessionModel = (sessionController as any).sessionModel;
      const stoppingSession = {
        id: 'session-id',
        deviceId: 'device-id',
        status: 'stopping',
      };
      mockSessionModel.getById.mockResolvedValue(stoppingSession);

      const result = await sessionController.stopSession('session-id');

      expect(result).toEqual(stoppingSession);
      expect(result.status).toBe('stopping');
      expect(mockProtocol.createCommand).not.toHaveBeenCalled();
    });

    it('should mark pending session complete and return (no device command)', async () => {
      const sessionId = 'session-id';
      const deviceId = 'device-id';
      const mockSessionModel = (sessionController as any).sessionModel;
      mockSessionModel.getById.mockResolvedValue({
        id: sessionId,
        deviceId,
        status: 'pending',
      });
      const completedSession = {
        id: sessionId,
        deviceId,
        status: 'complete',
        stoppedAt: new Date(),
        completedAt: new Date(),
      };
      mockSessionModel.update.mockResolvedValue(completedSession);

      const result = await sessionController.stopSession(sessionId);

      expect(result.status).toBe('complete');
      expect(mockSessionModel.update).toHaveBeenCalledWith(
        sessionId,
        expect.objectContaining({ status: 'complete' })
      );
      expect(mockProtocol.createCommand).not.toHaveBeenCalled();
    });

    it('should mark failed session complete and return (no device command)', async () => {
      const sessionId = 'session-id';
      const deviceId = 'device-id';
      const mockSessionModel = (sessionController as any).sessionModel;
      mockSessionModel.getById.mockResolvedValue({
        id: sessionId,
        deviceId,
        status: 'failed',
      });
      const completedSession = {
        id: sessionId,
        deviceId,
        status: 'complete',
        stoppedAt: new Date(),
        completedAt: new Date(),
      };
      mockSessionModel.update.mockResolvedValue(completedSession);

      const result = await sessionController.stopSession(sessionId);

      expect(result.status).toBe('complete');
      expect(mockProtocol.createCommand).not.toHaveBeenCalled();
    });

    it('should throw error if session not recording (e.g. encoding)', async () => {
      const mockSessionModel = (sessionController as any).sessionModel;
      mockSessionModel.getById.mockResolvedValue({
        id: 'session-id',
        status: 'encoding',
      });

      await expect(sessionController.stopSession('session-id')).rejects.toThrow(
        'not recording'
      );
    });
  });

  describe('getSession', () => {
    it('should get session by ID', async () => {
      const sessionId = 'session-id';
      const mockSession = {
        id: sessionId,
        deviceId: 'device-id',
        status: 'recording',
      };

      const mockSessionModel = (sessionController as any).sessionModel;
      mockSessionModel.getById.mockResolvedValue(mockSession);

      const result = await sessionController.getSession(sessionId);

      expect(result).toEqual(mockSession);
    });

    it('should return null if session not found', async () => {
      const mockSessionModel = (sessionController as any).sessionModel;
      mockSessionModel.getById.mockResolvedValue(null);

      const result = await sessionController.getSession('unknown');

      expect(result).toBeNull();
    });
  });

  describe('listSessions', () => {
    it('should list sessions with filters', async () => {
      const filters = { deviceId: 'device-id', status: 'recording' };
      const mockSessions = [
        { id: 'session-1', deviceId: 'device-id', status: 'recording' },
        { id: 'session-2', deviceId: 'device-id', status: 'recording' },
      ];

      const mockSessionModel = (sessionController as any).sessionModel;
      mockSessionModel.list.mockResolvedValue(mockSessions);

      const result = await sessionController.listSessions(filters);

      expect(result).toEqual(mockSessions);
      expect(mockSessionModel.list).toHaveBeenCalledWith(filters);
    });
  });

  describe('deleteSession', () => {
    it('should delete session and clear device state when session was active', async () => {
      const sessionId = 'session-id';
      const deviceId = 'device-id';
      const mockSessionModel = (sessionController as any).sessionModel;
      mockSessionModel.getById.mockResolvedValue({
        id: sessionId,
        deviceId,
        status: 'complete',
      });
      mockSessionModel.delete.mockResolvedValue(undefined);

      mockConnectionTracker.getConnectionState.mockReturnValue({
        connected: true,
        state: { activeSessionId: sessionId },
      });

      await sessionController.deleteSession(sessionId);

      expect(mockSessionModel.delete).toHaveBeenCalledWith(sessionId);
      expect(mockConnectionTracker.updateDeviceState).toHaveBeenCalledWith(
        deviceId,
        { status: 'idle', activeSessionId: undefined }
      );
    });

    it('should delete session without clearing device state when different session active', async () => {
      const sessionId = 'session-id';
      const deviceId = 'device-id';
      const mockSessionModel = (sessionController as any).sessionModel;
      mockSessionModel.getById.mockResolvedValue({
        id: sessionId,
        deviceId,
        status: 'complete',
      });
      mockSessionModel.delete.mockResolvedValue(undefined);

      mockConnectionTracker.getConnectionState.mockReturnValue({
        connected: true,
        state: { activeSessionId: 'other-session-id' },
      });

      await sessionController.deleteSession(sessionId);

      expect(mockSessionModel.delete).toHaveBeenCalledWith(sessionId);
      expect(mockConnectionTracker.updateDeviceState).not.toHaveBeenCalled();
    });

    it('should throw if session not found', async () => {
      const mockSessionModel = (sessionController as any).sessionModel;
      mockSessionModel.getById.mockResolvedValue(null);

      await expect(
        sessionController.deleteSession('unknown-session')
      ).rejects.toThrow('Session not found');
      expect(mockSessionModel.delete).not.toHaveBeenCalled();
    });
  });

  describe('linkFileToSession', () => {
    it('writes the capture block (device + av_file) so the transcription service finds the session', async () => {
      const mockSessionModel = (sessionController as any).sessionModel;
      mockSessionModel.getById.mockResolvedValue({
        id: 'bs-1',
        deviceId: 'bb-001',
        civicpressSessionId: 'pv-2026-06-09',
        metadata: {},
      });
      mockSessionModel.update.mockResolvedValue({});
      mockRecordManager.getRecord.mockResolvedValue({
        id: 'pv-2026-06-09',
        type: 'session',
        attachedFiles: [],
      });
      mockRecordManager.updateRecord = vi.fn().mockResolvedValue({});

      await sessionController.linkFileToSession('bs-1', 'storage-uuid-1');

      expect(mockRecordManager.updateRecord).toHaveBeenCalledWith(
        'pv-2026-06-09',
        expect.objectContaining({
          metadata: expect.objectContaining({
            capture: { device: 'bb-001', av_file: 'storage-uuid-1' },
          }),
        }),
        expect.objectContaining({ username: 'system' })
      );
      // ...and still attaches the A/V file
      const request = mockRecordManager.updateRecord.mock.calls[0][1];
      expect(
        request.attachedFiles.some((f: any) => f.id === 'storage-uuid-1')
      ).toBe(true);
    });

    it('is idempotent — skips the write if the file is already attached', async () => {
      const mockSessionModel = (sessionController as any).sessionModel;
      mockSessionModel.getById.mockResolvedValue({
        id: 'bs-1',
        deviceId: 'bb-001',
        civicpressSessionId: 'pv-x',
        metadata: {},
      });
      mockRecordManager.getRecord.mockResolvedValue({
        id: 'pv-x',
        type: 'session',
        attachedFiles: [{ id: 'storage-uuid-1' }],
      });
      mockRecordManager.updateRecord = vi.fn();

      await sessionController.linkFileToSession('bs-1', 'storage-uuid-1');

      expect(mockRecordManager.updateRecord).not.toHaveBeenCalled();
    });

    it('preserves manifest segments already on the record when the A/V file is linked', async () => {
      const mockSessionModel = (sessionController as any).sessionModel;
      mockSessionModel.getById.mockResolvedValue({
        id: 'bs-1',
        deviceId: 'bb-001',
        civicpressSessionId: 'pv-x',
        metadata: {},
      });
      mockSessionModel.update.mockResolvedValue({});
      // The manifest arrived first and wrote segments + timing.
      mockRecordManager.getRecord.mockResolvedValue({
        id: 'pv-x',
        type: 'session',
        attachedFiles: [],
        metadata: {
          capture: {
            device: 'bb-001',
            duration_s: 120,
            segments: [{ start: 0, end: 60, visibility: 'public' }],
          },
        },
      });
      mockRecordManager.updateRecord = vi.fn().mockResolvedValue({});

      await sessionController.linkFileToSession('bs-1', 'storage-uuid-1');

      const written =
        mockRecordManager.updateRecord.mock.calls[0][1].metadata.capture;
      expect(written.av_file).toBe('storage-uuid-1');
      // segments + timing from the manifest survive the finalize write.
      expect(written.segments).toEqual([
        { start: 0, end: 60, visibility: 'public' },
      ]);
      expect(written.duration_s).toBe(120);
    });
  });

  describe('applySessionManifest', () => {
    it('writes capture.segments + timing onto the session record', async () => {
      mockRecordManager.getRecord.mockResolvedValue({
        id: 'pv-1',
        type: 'session',
        metadata: {},
      });
      mockRecordManager.updateRecord = vi.fn().mockResolvedValue({});

      const segments = [
        { start: 0, end: 60, visibility: 'public' },
        { start: 60, end: 90, visibility: 'in_camera' },
      ];
      await sessionController.applySessionManifest('pv-1', {
        device: 'bb-001',
        duration_s: 90,
        segments,
      });

      expect(mockRecordManager.updateRecord).toHaveBeenCalledWith(
        'pv-1',
        {
          metadata: {
            capture: { device: 'bb-001', duration_s: 90, segments },
          },
        },
        expect.objectContaining({ username: 'system' })
      );
    });

    it('merges onto an existing capture block (keeps the av_file from finalize)', async () => {
      // The A/V upload finalized first and wrote device + av_file.
      mockRecordManager.getRecord.mockResolvedValue({
        id: 'pv-2',
        type: 'session',
        metadata: { capture: { device: 'bb-001', av_file: 'av-uuid-9' } },
      });
      mockRecordManager.updateRecord = vi.fn().mockResolvedValue({});

      await sessionController.applySessionManifest('pv-2', {
        segments: [{ start: 0, end: 30, visibility: 'public' }],
      });

      const written =
        mockRecordManager.updateRecord.mock.calls[0][1].metadata.capture;
      expect(written.av_file).toBe('av-uuid-9'); // not clobbered
      expect(written.device).toBe('bb-001');
      expect(written.segments).toEqual([
        { start: 0, end: 30, visibility: 'public' },
      ]);
    });

    it('throws when the session record does not exist', async () => {
      mockRecordManager.getRecord.mockResolvedValue(null);
      await expect(
        sessionController.applySessionManifest('missing', { segments: [] })
      ).rejects.toThrow(/Session record not found/);
    });
  });
});
