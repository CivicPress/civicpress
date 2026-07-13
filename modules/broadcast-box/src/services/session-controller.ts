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
   * Create-on-demand: draft a CivicPress `session` record, then start recording
   * against it — so an operator can "start recording this meeting" without
   * pre-creating the record. The record is created as a DRAFT (a clerk curates +
   * publishes later); the A/V is public regardless. Optionally links the session
   * to a `meeting` record (via `linked_records`) so a meeting owns its recordings.
   */
  async quickStartSession(request: {
    deviceId: string;
    title?: string;
    meetingId?: string;
    user?: { id: number; username: string; role: string };
  }): Promise<{ session: BroadcastSession; civicpressSessionId: string }> {
    // Pre-flight the device BEFORE creating the record so an offline/busy device
    // doesn't leave an orphan draft (startSession re-checks authoritatively).
    const device = await this.deviceManager.getDevice(request.deviceId);
    if (!device) {
      throw new Error(`Device not found: ${request.deviceId}`);
    }
    if (!this.connectionTracker.isConnected(request.deviceId)) {
      throw new Error(`Device ${request.deviceId} is not connected`);
    }
    const cs = this.connectionTracker.getConnectionState(request.deviceId);
    if (cs?.state?.status === 'recording') {
      throw new Error(`Device ${request.deviceId} is already recording`);
    }

    const user = request.user ?? {
      id: 1,
      username: 'broadcast-box',
      role: 'clerk',
    };
    const title =
      request.title?.trim() ||
      `Recording ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`;

    const record = await this.recordManager.createRecord(
      {
        title,
        type: 'session',
        status: 'draft', // a clerk reviews + publishes later; A/V is public regardless
        content: `# ${title}\n`,
        metadata: {},
        ...(request.meetingId
          ? {
              linkedRecords: [
                {
                  id: request.meetingId,
                  type: 'meeting',
                  description: 'Session recording for this meeting',
                },
              ],
            }
          : {}),
      } as any,
      user as any
    );

    coreInfo('Quick-start created a draft session record', {
      operation: 'broadcast-box:session:quick-start',
      civicpressSessionId: record.id,
      deviceId: request.deviceId,
      meetingId: request.meetingId,
    });

    const session = await this.startSession({
      deviceId: request.deviceId,
      civicpressSessionId: record.id,
      metadata: {},
    });
    return { session, civicpressSessionId: record.id };
  }

  /**
   * The session recordings that belong to a meeting — found by scanning the
   * broadcast_sessions rows and keeping those whose CivicPress `session` record
   * links to this meeting via `linked_records` (covers draft + published records).
   * Scaffold-grade (a small scan, no index); a dedicated meeting↔session index is
   * a follow-on.
   */
  async getSessionsForMeeting(meetingId: string): Promise<BroadcastSession[]> {
    const rows = await this.sessionModel.list({});
    const out: BroadcastSession[] = [];
    for (const row of rows) {
      const rec =
        (await this.recordManager
          .getRecord(row.civicpressSessionId)
          .catch(() => null)) ??
        (await this.db.getDraft(row.civicpressSessionId).catch(() => null));
      // Published records expose parsed `linkedRecords`; draft rows store
      // `linked_records` as a JSON string — handle both.
      let raw: unknown =
        (rec as any)?.linkedRecords ?? (rec as any)?.linked_records ?? [];
      if (typeof raw === 'string') {
        try {
          raw = JSON.parse(raw);
        } catch {
          raw = [];
        }
      }
      const links = Array.isArray(raw) ? (raw as Array<{ id?: string }>) : [];
      if (links.some((l) => l?.id === meetingId)) {
        out.push(row);
      }
    }
    return out;
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

    // Truthful FSM (audit broadcast-box-009): the device is still encoding +
    // uploading, so the session is `stopping`, NOT `complete`. It moves to
    // `complete` only when the upload finalizes (the
    // `broadcast-box:recording:complete` hook → handleSessionComplete). A recording
    // whose upload never lands stays `stopping`, which is honest — it never completed.
    const now = new Date();
    const updated = await this.sessionModel.update(sessionId, {
      status: 'stopping',
      stoppedAt: now,
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
   * Mark a recording session `complete` once its A/V upload has finalized. Wired to
   * the `broadcast-box:recording:complete` hook (via the workflow triggers), this is
   * what truthfully moves a session out of `stopping` (see stopSession + the
   * broadcast-box-009 FSM fix). Idempotent + tolerant of an unknown/cleaned-up session.
   */
  async handleSessionComplete(sessionId: string): Promise<void> {
    const session = await this.sessionModel.getById(sessionId);
    if (!session || session.status === 'complete') {
      return;
    }

    await this.sessionModel.update(sessionId, {
      status: 'complete',
      completedAt: new Date(),
    });

    this.connectionTracker.updateDeviceState(session.deviceId, {
      status: 'idle',
      activeSessionId: undefined,
    });

    coreInfo('Session completed', {
      operation: 'broadcast-box:session:completed',
      sessionId: session.id,
      deviceId: session.deviceId,
    });
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

    // FA-BB-002 fail-closed: the uploaded file is the RAW original (private
    // recordings_raw folder) and may contain in-camera content, so it is NOT
    // attached to the public record here. The redaction worker appends the
    // public 'Recording' attached_files entry at `capture.public_file` only
    // after post-encode verification. This write latches
    // `redaction_status: 'pending'` so the worker picks the session up.
    //
    // We MERGE onto any existing capture (the device's `session.manifest` may
    // have already written segments/timing — see applySessionManifest) because
    // the records write path shallow-merges `metadata` per key, so a bare
    // `{ capture: {...} }` would clobber it. The capture block is also what the
    // transcription service (W2) scans for — `capture.av_file` present and no
    // `transcript_status`.
    const existingCapture =
      ((sessionRecord.metadata as Record<string, any> | undefined)?.capture as
        | Record<string, unknown>
        | undefined) ?? {};

    // Idempotency: the raw is linked exactly once per file.
    if (existingCapture.av_file !== storageFileId) {
      await this.recordManager.updateRecord(
        session.civicpressSessionId,
        {
          metadata: {
            capture: {
              ...existingCapture,
              device: session.deviceId,
              av_file: storageFileId,
              redaction_status: 'pending',
            },
          },
        },
        {
          id: 1, // System user
          username: 'system',
          role: 'admin',
        } as any
      );

      // Update session metadata with media reference (the raw — private;
      // serving it requires storage:read_private)
      const metadata = {
        ...session.metadata,
        recording: {
          fileId: storageFileId,
          filePath: `/api/v1/storage/files/${storageFileId}`,
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
    // FA-BB-013: `capture.av_file` is deliberately NOT overlaid — it is written
    // only by upload-finalize (linkFileToSession), which binds it to the bytes
    // that were actually uploaded. A manifest that could repoint av_file would
    // let a device swap which file the transcription/redaction pipeline treats
    // as the session recording.
    const merged: Record<string, unknown> = { ...existing };
    if (capture.device !== undefined) merged.device = capture.device;
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
