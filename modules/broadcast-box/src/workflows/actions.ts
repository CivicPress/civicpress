/**
 * Broadcast Box Workflow Actions
 *
 * Workflow actions for automated recording control
 */

import type { Logger } from '@civicpress/core';
import { coreInfo, coreWarn } from '@civicpress/core';
import type { SessionController } from '../services/session-controller.js';
import type { DeviceManager } from '../services/device-manager.js';
import type { UploadProcessor } from '../services/upload-processor.js';

export interface WorkflowActionContext {
  sessionId?: string;
  deviceId?: string;
  civicpressSessionId?: string;
  metadata?: Record<string, any>;
  [key: string]: any;
}

export class BroadcastBoxWorkflowActions {
  constructor(
    private sessionController: SessionController,
    private deviceManager: DeviceManager,
    private uploadProcessor: UploadProcessor,
    private logger: Logger
  ) {}

  /**
   * Register workflow actions as workflows
   */
  registerActions(workflowEngine: any): void {
    // Register broadcast_box.start_recording workflow
    workflowEngine.registerWorkflow(
      'broadcast_box.start_recording',
      async (data: WorkflowActionContext) => {
        const result = await this.startRecording(data);
        if (!result.success) {
          throw new Error(result.error || 'Failed to start recording');
        }
        return result;
      }
    );

    // Register broadcast_box.stop_recording workflow
    workflowEngine.registerWorkflow(
      'broadcast_box.stop_recording',
      async (data: WorkflowActionContext) => {
        const result = await this.stopRecording(data);
        if (!result.success) {
          throw new Error(result.error || 'Failed to stop recording');
        }
        return result;
      }
    );

    // Register broadcast_box.process_upload workflow
    workflowEngine.registerWorkflow(
      'broadcast_box.process_upload',
      async (data: WorkflowActionContext) => {
        const result = await this.processUpload(data);
        if (!result.success) {
          throw new Error(result.error || 'Failed to process upload');
        }
        return result;
      }
    );

    coreInfo('Broadcast Box workflow actions registered', {
      operation: 'broadcast-box:workflows:actions-registered',
    });
  }

  /**
   * Start recording action
   */
  private async startRecording(
    context: WorkflowActionContext
  ): Promise<{ success: boolean; sessionId?: string; error?: string }> {
    try {
      if (!context.deviceId) {
        return {
          success: false,
          error: 'deviceId is required',
        };
      }

      if (!context.civicpressSessionId) {
        return {
          success: false,
          error: 'civicpressSessionId is required',
        };
      }

      // Verify device exists and is active
      const device = await this.deviceManager.getDevice(context.deviceId);
      if (device.status !== 'active') {
        return {
          success: false,
          error: `Device ${context.deviceId} is not active`,
        };
      }

      // Start recording session
      const session = await this.sessionController.startSession({
        deviceId: context.deviceId,
        civicpressSessionId: context.civicpressSessionId,
        metadata: context.metadata || {},
      });

      coreInfo('Recording started via workflow action', {
        operation: 'broadcast-box:workflows:action:start-recording',
        sessionId: session.id,
        deviceId: context.deviceId,
        civicpressSessionId: context.civicpressSessionId,
      });

      return {
        success: true,
        sessionId: session.id,
      };
    } catch (error) {
      coreWarn('Failed to start recording via workflow action', {
        operation: 'broadcast-box:workflows:action:start-recording-error',
        deviceId: context.deviceId,
        civicpressSessionId: context.civicpressSessionId,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Stop recording action
   */
  private async stopRecording(
    context: WorkflowActionContext
  ): Promise<{ success: boolean; error?: string }> {
    try {
      if (!context.sessionId) {
        return {
          success: false,
          error: 'sessionId is required',
        };
      }

      // Stop recording session
      await this.sessionController.stopSession(context.sessionId);

      coreInfo('Recording stopped via workflow action', {
        operation: 'broadcast-box:workflows:action:stop-recording',
        sessionId: context.sessionId,
      });

      return {
        success: true,
      };
    } catch (error) {
      coreWarn('Failed to stop recording via workflow action', {
        operation: 'broadcast-box:workflows:action:stop-recording-error',
        sessionId: context.sessionId,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Process upload action
   */
  private async processUpload(
    context: WorkflowActionContext
  ): Promise<{ success: boolean; storageFileId?: string; error?: string }> {
    try {
      if (!context.sessionId) {
        return {
          success: false,
          error: 'sessionId is required',
        };
      }

      // Get upload for session
      const upload = await this.uploadProcessor.getUploadBySessionId(
        context.sessionId
      );

      if (!upload) {
        return {
          success: false,
          error: `No upload found for session ${context.sessionId}`,
        };
      }

      if (upload.status !== 'uploading') {
        return {
          success: false,
          error: `Upload ${upload.id} is not in uploading state`,
        };
      }

      // Finalize upload
      const storageFileId = await this.uploadProcessor.finalizeUpload(
        upload.id
      );

      coreInfo('Upload processed via workflow action', {
        operation: 'broadcast-box:workflows:action:process-upload',
        sessionId: context.sessionId,
        uploadId: upload.id,
        storageFileId,
      });

      return {
        success: true,
        storageFileId,
      };
    } catch (error) {
      coreWarn('Failed to process upload via workflow action', {
        operation: 'broadcast-box:workflows:action:process-upload-error',
        sessionId: context.sessionId,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
