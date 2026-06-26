/**
 * Session Controller Service
 *
 * Manages recording session lifecycle tied to CivicPress session records
 */

import type { Logger, RecordManager, DatabaseService } from '@civicpress/core';
import { coreInfo, coreWarn, coreError } from '@civicpress/core';
import { v4 as uuidv4 } from 'uuid';
import { BroadcastSessionModel } from '../models/broadcast-session.js';
import { DeviceEventModel } from '../models/device-event.js';
import type {
  BroadcastSession,
  SessionStatus,
  SessionMetadata,
  StartSessionRequest,
} from '../types/index.js';
import type { DeviceManager } from './device-manager.js';
import type { DeviceConnectionTracker } from './device-connection-tracker.js';
import type { RoomManager } from '@civicpress/realtime';
import type { ProtocolHandler } from '../websocket/protocol.js';

export class SessionController {
  private sessionModel: BroadcastSessionModel;
  private deviceEventModel: DeviceEventModel;

  constructor(
    private deviceManager: DeviceManager,
    private connectionTracker: DeviceConnectionTracker,
    private roomManager: RoomManager | null,
    private protocol: ProtocolHandler,
    private recordManager: RecordManager,
    private db: DatabaseService,
    private logger: Logger
  ) {
    this.sessionModel = new BroadcastSessionModel(db, logger);
    this.deviceEventModel = new DeviceEventModel(db, logger);
  }

  /**
   * Deliver a command to a device's room. Two things matter here, both of which
   * were silently broken before (the room only ever exists with a live device,
   * so unit tests with a mocked room never noticed):
   *  - the device room is keyed by the device UUID (the device connects to
   *    /realtime/devices/<uuid>), NOT the database id — keying by db id targets
   *    an empty room, so the command never arrives;
   *  - prefer the device-specific sendToDevice (resolves the device's own live
   *    socket via the server's clientToDevice map) over broadcast, which fans
   *    out to observers and depends on the room's client map.
   *
   * @param deviceId the device's DATABASE id (resolved to its UUID here).
   */
  private async deliverToDevice(
    deviceId: string,
    command: unknown
  ): Promise<void> {
    if (!this.roomManager) {
      throw new Error(
        'RoomManager not available - realtime module required for session control'
      );
    }
    const device = await this.deviceManager.getDevice(deviceId);
    const deviceUuid = device?.deviceUuid ?? deviceId;
    const roomId = `device:${deviceUuid}`;
    const room =
      this.roomManager.getRoom(roomId) ??
      this.roomManager.getOrCreateRoom(roomId, 'device', {});
    const deviceRoom = room as unknown as {
      sendToDevice?: (m: unknown) => boolean;
    };
    if (typeof deviceRoom.sendToDevice === 'function') {
      deviceRoom.sendToDevice(command);
    } else {
      room.broadcast(command);
    }
  }

  /**
   * Start a recording session
   */
  async startSession(request: StartSessionRequest): Promise<BroadcastSession> {
    // Verify device exists and is active
    const device = await this.deviceManager.getDevice(request.deviceId);
    if (!device) {
      throw new Error(`Device not found: ${request.deviceId}`);
    }

    if (device.status !== 'active') {
      throw new Error(
        `Device ${request.deviceId} is not active. Current status: ${device.status}`
      );
    }

    // Check if device is connected
    if (!this.connectionTracker.isConnected(request.deviceId)) {
      throw new Error(`Device ${request.deviceId} is not connected`);
    }

    // Check if device is already recording
    const connectionState = this.connectionTracker.getConnectionState(
      request.deviceId
    );
    if (connectionState?.state.status === 'recording') {
      throw new Error(
        `Device ${request.deviceId} is already recording session: ${connectionState.state.activeSessionId}`
      );
    }

    // Verify CivicPress session record exists (published record or draft)
    let sessionRecord = await this.recordManager.getRecord(
      request.civicpressSessionId
    );
    if (!sessionRecord) {
      // Record may exist only as a draft (not yet published)
      const draft = await this.db.getDraft(request.civicpressSessionId);
      if (draft && draft.type === 'session') {
        sessionRecord = { id: draft.id, type: draft.type } as any;
      }
    }
    if (!sessionRecord) {
      throw new Error(
        `CivicPress session record not found: ${request.civicpressSessionId}`
      );
    }

    if (sessionRecord.type !== 'session') {
      throw new Error(
        `Record ${request.civicpressSessionId} is not a session record (type: ${sessionRecord.type})`
      );
    }

    // Create broadcast session
    const sessionId = uuidv4();
    const session: Omit<BroadcastSession, 'createdAt' | 'updatedAt'> = {
      id: sessionId,
      deviceId: request.deviceId,
      civicpressSessionId: request.civicpressSessionId,
      status: 'pending',
      metadata: request.metadata || {},
    };

    const created = await this.sessionModel.create(session);

    // Send start_session command to device (sources are set via sources.set; only quality in config)
    const command = this.protocol.createCommand('start_session', {
      sessionId: created.id,
      civicpressSessionId: created.civicpressSessionId,
      config: {
        quality: request.metadata?.quality,
        pip: request.metadata?.pip,
      },
    });

    // Send start_session to the device (creates the room on demand if missing).
    await this.deliverToDevice(request.deviceId, command);

    // Update session status to recording
    const updated = await this.sessionModel.update(created.id, {
      status: 'recording',
      startedAt: new Date(),
    });

    // Update device state
    this.connectionTracker.updateDeviceState(request.deviceId, {
      status: 'recording',
      activeSessionId: created.id,
    });

    // Log event
    await this.deviceEventModel.create({
      id: uuidv4(),
      deviceId: request.deviceId,
      eventType: 'session.started',
      eventData: {
        sessionId: created.id,
        civicpressSessionId: created.civicpressSessionId,
      },
    });

    coreInfo('Session started', {
      operation: 'broadcast-box:session:started',
      sessionId: created.id,
      deviceId: request.deviceId,
      civicpressSessionId: request.civicpressSessionId,
    });

    return updated;
  }

  /**
   * Stop a recording session
   */
  async stopSession(sessionId: string): Promise<BroadcastSession> {
    const session = await this.sessionModel.getById(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    // Idempotent: if already stopping or complete, return current session (e.g. user clicked Stop again)
    if (session.status === 'stopping' || session.status === 'complete') {
      return session;
    }
    // Session was never recording or already failed: mark complete so UI can recover (no device command)
    if (session.status === 'pending' || session.status === 'failed') {
      const now = new Date();
      const updated = await this.sessionModel.update(sessionId, {
        status: 'complete',
        stoppedAt: now,
        completedAt: now,
      });
      this.connectionTracker.updateDeviceState(session.deviceId, {
        status: 'idle',
        activeSessionId: undefined,
      });
      return updated;
    }
    if (session.status !== 'recording') {
      throw new Error(
        `Session ${sessionId} is not recording. Current status: ${session.status}`
      );
    }

    // Send stop_session command to device
    const command = this.protocol.createCommand('stop_session', {
      sessionId: session.id,
    });

    // Send stop_session to the device.
    await this.deliverToDevice(session.deviceId, command);

    // Update session to complete so UI shows terminal state immediately (device may still encode/upload in background)
    const now = new Date();
    const updated = await this.sessionModel.update(sessionId, {
      status: 'complete',
      stoppedAt: now,
      completedAt: now,
    });

    // Update device state
    this.connectionTracker.updateDeviceState(session.deviceId, {
      status: 'idle',
      activeSessionId: undefined,
    });

    // Log event
    await this.deviceEventModel.create({
      id: uuidv4(),
      deviceId: session.deviceId,
      eventType: 'session.stopped',
      eventData: {
        sessionId: session.id,
      },
    });

    coreInfo('Session stopped', {
      operation: 'broadcast-box:session:stopped',
      sessionId: session.id,
      deviceId: session.deviceId,
    });

    return updated;
  }

  /**
   * Get session by ID
   */
  async getSession(sessionId: string): Promise<BroadcastSession | null> {
    return this.sessionModel.getById(sessionId);
  }

  /**
   * Get session by CivicPress session ID
   */
  async getSessionByCivicPressId(
    civicpressSessionId: string
  ): Promise<BroadcastSession | null> {
    return this.sessionModel.getByCivicPressSessionId(civicpressSessionId);
  }

  /**
   * List sessions with filters
   */
  async listSessions(filters?: {
    deviceId?: string;
    civicpressSessionId?: string;
    status?: SessionStatus;
    limit?: number;
    offset?: number;
  }): Promise<BroadcastSession[]> {
    return this.sessionModel.list(filters);
  }

  /**
   * Delete a broadcast session (removes from list; clears device state if it was this session)
   */
  async deleteSession(sessionId: string): Promise<void> {
    const session = await this.sessionModel.getById(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    const connectionState = this.connectionTracker.getConnectionState(
      session.deviceId
    );
    if (connectionState?.state?.activeSessionId === sessionId) {
      this.connectionTracker.updateDeviceState(session.deviceId, {
        status: 'idle',
        activeSessionId: undefined,
      });
    }
    await this.sessionModel.delete(sessionId);
  }

  /**
   * Handle session completion (called by event handler)
   */
  async handleSessionComplete(
    sessionId: string,
    filePath: string,
    fileSize: number,
    hash: string,
    durationSeconds: number
  ): Promise<void> {
    const session = await this.sessionModel.getById(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    // Update session status
    await this.sessionModel.update(sessionId, {
      status: 'complete',
      completedAt: new Date(),
    });

    // Update device state
    this.connectionTracker.updateDeviceState(session.deviceId, {
      status: 'idle',
      activeSessionId: undefined,
    });

    coreInfo('Session completed', {
      operation: 'broadcast-box:session:completed',
      sessionId: session.id,
      deviceId: session.deviceId,
    });

    // TODO: Link file to session record when upload is complete (Phase 5)
  }

  /**
   * Link uploaded file to session record
   */
  async linkFileToSession(
    sessionId: string,
    storageFileId: string
  ): Promise<void> {
    const session = await this.sessionModel.getById(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    // Get session record
    const sessionRecord = await this.recordManager.getRecord(
      session.civicpressSessionId
    );
    if (!sessionRecord) {
      throw new Error(
        `Session record not found: ${session.civicpressSessionId}`
      );
    }

    // Add file to attached_files
    const attachedFiles = sessionRecord.attachedFiles || [];
    const fileEntry = {
      id: storageFileId,
      path: `/api/v1/storage/files/${storageFileId}`,
      original_name: `recording-${sessionId}.mp4`, // TODO: Get actual filename
      description: 'Session recording',
      category: 'Recording',
    };

    // Check if file already attached
    if (!attachedFiles.some((f: any) => f.id === storageFileId)) {
      attachedFiles.push(fileEntry);

      // Update record: attach the A/V file AND write the `capture` block
      // (broadcast-box session extension). The capture block is what the
      // transcription service (W2) scans for — `capture.av_file` present and no
      // `transcript_status`. We MERGE onto any existing capture (the device's
      // `session.manifest` may have already written segments/timing — see
      // applySessionManifest) because the records write path shallow-merges
      // `metadata` per key, so a bare `{ capture: {...} }` would clobber it.
      const existingCapture =
        ((sessionRecord.metadata as Record<string, any> | undefined)
          ?.capture as Record<string, unknown> | undefined) ?? {};
      await this.recordManager.updateRecord(
        session.civicpressSessionId,
        {
          attachedFiles,
          metadata: {
            capture: {
              ...existingCapture,
              device: session.deviceId,
              av_file: storageFileId,
            },
          },
        },
        {
          id: 1, // System user
          username: 'system',
          role: 'admin',
        } as any
      );

      // Update session metadata with media reference
      const metadata = {
        ...session.metadata,
        recording: {
          fileId: storageFileId,
          filePath: fileEntry.path,
        },
      };

      await this.sessionModel.update(sessionId, {
        metadata,
      });

      coreInfo('File linked to session record', {
        operation: 'broadcast-box:session:file-linked',
        sessionId: session.id,
        civicpressSessionId: session.civicpressSessionId,
        storageFileId,
      });
    }
  }

  /**
   * Apply a device `session.manifest` to its CivicPress session record.
   *
   * The manifest binds the recording to the session and — crucially —
   * carries the segment-level visibility (`capture.segments`) the transcription
   * worker uses to exclude in-camera portions. `session_id` is the CivicPress
   * session record id (the same id pushed to the device via the schedule).
   *
   * We MERGE onto any existing capture block (the A/V upload finalize writes
   * `device` + `av_file` independently — see linkFileToSession) since the
   * records write path shallow-merges `metadata` per key.
   */
  async applySessionManifest(
    civicpressSessionId: string,
    capture: {
      device?: string;
      av_file?: string;
      started_at?: string;
      ended_at?: string;
      duration_s?: number;
      segments?: Array<{ start: number; end: number; visibility: string }>;
    }
  ): Promise<void> {
    const record = await this.recordManager.getRecord(civicpressSessionId);
    if (!record) {
      throw new Error(`Session record not found: ${civicpressSessionId}`);
    }

    const existing =
      ((record.metadata as Record<string, any> | undefined)?.capture as
        | Record<string, unknown>
        | undefined) ?? {};

    // Merge: keep prior capture fields (e.g. av_file from finalize), overlay the
    // manifest's. Only overlay keys the manifest actually provided.
    const merged: Record<string, unknown> = { ...existing };
    if (capture.device !== undefined) merged.device = capture.device;
    if (capture.av_file !== undefined) merged.av_file = capture.av_file;
    if (capture.started_at !== undefined)
      merged.started_at = capture.started_at;
    if (capture.ended_at !== undefined) merged.ended_at = capture.ended_at;
    if (capture.duration_s !== undefined)
      merged.duration_s = capture.duration_s;
    if (capture.segments !== undefined) merged.segments = capture.segments;

    await this.recordManager.updateRecord(
      civicpressSessionId,
      { metadata: { capture: merged } },
      { id: 1, username: 'system', role: 'admin' } as any
    );

    coreInfo('Session manifest applied to record', {
      operation: 'broadcast-box:session:manifest-applied',
      civicpressSessionId,
      segments: capture.segments?.length ?? 0,
    });
  }

  /**
   * Handle session failure (called by event handler)
   */
  async handleSessionFailed(sessionId: string, error: string): Promise<void> {
    const session = await this.sessionModel.getById(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    // Update session status
    await this.sessionModel.update(sessionId, {
      status: 'failed',
      error,
    });

    // Update device state
    this.connectionTracker.updateDeviceState(session.deviceId, {
      status: 'idle',
      activeSessionId: undefined,
    });

    coreWarn('Session failed', {
      operation: 'broadcast-box:session:failed',
      sessionId: session.id,
      deviceId: session.deviceId,
      error,
    });
  }
}
