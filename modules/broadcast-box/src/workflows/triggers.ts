/**
 * Broadcast Box Workflow Triggers
 *
 * Hook handlers for workflow integration
 */

import type { Logger, HookSystem } from '@civicpress/core';
import { coreInfo } from '@civicpress/core';
import type { SessionController } from '../services/session-controller.js';
import type { DeviceManager } from '../services/device-manager.js';
import type { UploadProcessor } from '../services/upload-processor.js';

export class BroadcastBoxWorkflowTriggers {
  constructor(
    private hookSystem: HookSystem,
    private sessionController: SessionController,
    private deviceManager: DeviceManager,
    private uploadProcessor: UploadProcessor,
    private logger: Logger
  ) {}

  /**
   * Register all workflow triggers
   */
  registerTriggers(): void {
    // Register onSessionCreated trigger
    this.hookSystem.registerHook(
      'session:created',
      async (data: any, context: any) => {
        await this.onSessionCreated(data);
      }
    );

    // Register onSessionStart trigger
    this.hookSystem.registerHook(
      'session:started',
      async (data: any, context: any) => {
        await this.onSessionStart(data);
      }
    );

    // Register onSessionEnd trigger
    this.hookSystem.registerHook(
      'session:ended',
      async (data: any, context: any) => {
        await this.onSessionEnd(data);
      }
    );

    // Register onRecordingComplete trigger
    this.hookSystem.registerHook(
      'broadcast-box:recording:complete',
      async (data: any, context: any) => {
        await this.onRecordingComplete(data);
      }
    );

    coreInfo('Broadcast Box workflow triggers registered', {
      operation: 'broadcast-box:workflows:triggers-registered',
    });
  }

  /**
   * Handle session:created hook
   */
  private async onSessionCreated(data: {
    record: any;
    user: any;
    action: string;
  }): Promise<void> {
    // Check if this is a session record
    if (data.record.type !== 'session') {
      return;
    }

    // Check if auto-recording is enabled in metadata
    const autoRecord = data.record.metadata?.broadcastBox?.autoRecord;
    if (!autoRecord) {
      return;
    }

    // Get device ID from metadata
    const deviceId = data.record.metadata?.broadcastBox?.deviceId;
    if (!deviceId) {
      this.logger.warn('Auto-record enabled but no device ID specified', {
        operation: 'broadcast-box:workflows:auto-record-no-device',
        sessionId: data.record.id,
      });
      return;
    }

    // Verify device exists and is active
    try {
      const device = await this.deviceManager.getDevice(deviceId);
      if (!device) {
        this.logger.warn('Auto-record device not found', {
          operation: 'broadcast-box:workflows:auto-record-device-not-found',
          sessionId: data.record.id,
          deviceId,
        });
        return;
      }
      if (device.status !== 'active') {
        this.logger.warn('Auto-record device is not active', {
          operation: 'broadcast-box:workflows:auto-record-device-inactive',
          sessionId: data.record.id,
          deviceId,
        });
        return;
      }

      // Start recording session
      await this.sessionController.startSession({
        deviceId,
        civicpressSessionId: data.record.id,
        metadata: {
          videoSource: data.record.metadata?.broadcastBox?.videoSource,
          audioSource: data.record.metadata?.broadcastBox?.audioSource,
          quality: data.record.metadata?.broadcastBox?.quality || 'standard',
          pip: data.record.metadata?.broadcastBox?.pip,
        },
      });

      coreInfo('Auto-recording started for session', {
        operation: 'broadcast-box:workflows:auto-record-started',
        sessionId: data.record.id,
        deviceId,
      });
    } catch (error) {
      this.logger.error('Failed to start auto-recording', {
        operation: 'broadcast-box:workflows:auto-record-error',
        sessionId: data.record.id,
        deviceId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Handle session:started hook
   */
  private async onSessionStart(data: {
    record: any;
    user: any;
    action: string;
  }): Promise<void> {
    // Check if this is a session record
    if (data.record.type !== 'session') {
      return;
    }

    // Emit broadcast-box specific hook
    await this.hookSystem.emit('broadcast-box:session:started', {
      sessionId: data.record.id,
      record: data.record,
      user: data.user,
    });
  }

  /**
   * Handle session:ended hook
   */
  private async onSessionEnd(data: {
    record: any;
    user: any;
    action: string;
  }): Promise<void> {
    // Check if this is a session record
    if (data.record.type !== 'session') {
      return;
    }

    // Find active broadcast session for this CivicPress session
    const broadcastSession =
      await this.sessionController.getSessionByCivicPressId(data.record.id);

    if (broadcastSession && broadcastSession.status === 'recording') {
      // Stop recording
      try {
        await this.sessionController.stopSession(broadcastSession.id);
        coreInfo('Recording stopped on session end', {
          operation: 'broadcast-box:workflows:auto-stop',
          sessionId: data.record.id,
          broadcastSessionId: broadcastSession.id,
        });
      } catch (error) {
        this.logger.error('Failed to stop recording on session end', {
          operation: 'broadcast-box:workflows:auto-stop-error',
          sessionId: data.record.id,
          broadcastSessionId: broadcastSession.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Emit broadcast-box specific hook
    await this.hookSystem.emit('broadcast-box:session:ended', {
      sessionId: data.record.id,
      record: data.record,
      user: data.user,
    });
  }

  /**
   * Handle broadcast-box:recording:complete hook
   */
  private async onRecordingComplete(data: {
    sessionId: string;
    storageFileId: string;
    deviceId: string;
  }): Promise<void> {
    // Link file to session record
    try {
      await this.sessionController.linkFileToSession(
        data.sessionId,
        data.storageFileId
      );

      coreInfo('Recording file linked to session record', {
        operation: 'broadcast-box:workflows:file-linked',
        sessionId: data.sessionId,
        storageFileId: data.storageFileId,
      });
    } catch (error) {
      this.logger.error('Failed to link recording file to session', {
        operation: 'broadcast-box:workflows:file-link-error',
        sessionId: data.sessionId,
        storageFileId: data.storageFileId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
