/**
 * Upload Processor Service
 *
 * Handles chunked file uploads from Broadcast Box devices
 */

import type { Logger, HookSystem } from '@civicpress/core';
import { coreInfo, coreWarn, coreError } from '@civicpress/core';
import * as fs from 'fs/promises';
import { createReadStream } from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { UploadJobModel } from '../models/upload-job.js';
import type {
  UploadJob,
  UploadStatus,
  CreateUploadRequest,
} from '../types/index.js';
// @ts-ignore - @civicpress/storage may not be available in all environments
import type { CloudUuidStorageService } from '@civicpress/storage';

export class UploadProcessor {
  private uploadModel: UploadJobModel;
  private uploadsDir: string;

  constructor(
    private db: any, // DatabaseService
    private storageService: CloudUuidStorageService,
    private systemDataDir: string,
    private logger: Logger,
    // Optional: emits `broadcast-box:recording:complete` on finalize so the
    // recording is linked to its CivicPress session record (capture block).
    private hookSystem?: HookSystem
  ) {
    this.uploadModel = new UploadJobModel(db, logger);
    this.uploadsDir = path.join(systemDataDir, 'tmp', 'uploads');
  }

  /**
   * Initialize uploads directory
   */
  async initialize(): Promise<void> {
    try {
      await fs.mkdir(this.uploadsDir, { recursive: true });
    } catch (error) {
      coreError(
        'Failed to create uploads directory',
        'broadcast-box:upload:init-error',
        error instanceof Error ? error.message : String(error),
        {
          operation: 'broadcast-box:upload:init-error',
          error: error instanceof Error ? error.message : String(error),
        }
      );
      throw error;
    }
  }

  /**
   * Create a new upload job
   */
  async createUpload(
    request: CreateUploadRequest,
    expectedDeviceId?: string
  ): Promise<UploadJob> {
    const uploadId = uuidv4();

    // Resolve the owning device from the broadcast session up front, so an
    // ownership violation is rejected before any directory or row is created.
    const sessionModel = (this.uploadModel as any).db;
    const sessionRows = await sessionModel
      .getAdapter()
      .query('SELECT device_id FROM broadcast_sessions WHERE id = ?', [
        request.sessionId,
      ]);
    const sessionDeviceId: string =
      sessionRows.length > 0 ? sessionRows[0].device_id : '';

    // Authorization: when an authenticated device is supplied, it may only
    // create uploads for a session it owns. A missing session resolves to no
    // device and so also fails closed. We don't distinguish "not found" from
    // "not yours", to avoid leaking which sessions exist.
    if (expectedDeviceId !== undefined && sessionDeviceId !== expectedDeviceId) {
      throw new Error(
        `Forbidden: device does not own session ${request.sessionId}`
      );
    }

    // Create upload directory for chunks
    const uploadDir = path.join(this.uploadsDir, uploadId);
    await fs.mkdir(uploadDir, { recursive: true });

    const upload: Omit<UploadJob, 'createdAt' | 'updatedAt'> = {
      id: uploadId,
      sessionId: request.sessionId,
      deviceId: sessionDeviceId,
      filePath: path.join(uploadDir, request.fileName),
      fileName: request.fileName,
      fileSize: request.fileSize,
      fileHash: request.fileHash,
      mimeType: request.mimeType,
      status: 'pending',
      progressPercent: 0,
    };

    const created = await this.uploadModel.create(upload);

    coreInfo('Upload job created', {
      operation: 'broadcast-box:upload:created',
      uploadId: created.id,
      sessionId: request.sessionId,
      fileName: request.fileName,
    });

    return created;
  }

  /**
   * Process upload chunk
   */
  async processChunk(
    uploadId: string,
    chunk: Buffer,
    chunkNumber: number,
    expectedDeviceId?: string
  ): Promise<void> {
    const upload = await this.uploadModel.getById(uploadId);
    if (!upload) {
      throw new Error(`Upload job not found: ${uploadId}`);
    }

    // Authorization: a device may only upload chunks to its own upload job.
    if (expectedDeviceId !== undefined && upload.deviceId !== expectedDeviceId) {
      throw new Error(`Forbidden: device does not own upload ${uploadId}`);
    }

    if (upload.status === 'complete') {
      throw new Error(`Upload ${uploadId} is already complete`);
    }

    if (upload.status === 'failed') {
      throw new Error(`Upload ${uploadId} has failed`);
    }

    // Update status to uploading if first chunk
    if (upload.status === 'pending') {
      await this.uploadModel.update(uploadId, {
        status: 'uploading',
        startedAt: new Date(),
      });
    }

    // Write chunk to temporary file
    const chunkPath = path.join(
      this.uploadsDir,
      uploadId,
      `chunk-${chunkNumber}`
    );
    await fs.writeFile(chunkPath, chunk);

    // Calculate progress (approximate, based on chunks received)
    // This is a simplified calculation - in production, track bytes received
    const progressPercent = Math.min(Math.floor((chunkNumber * 10) % 100), 99); // Placeholder calculation

    await this.uploadModel.update(uploadId, {
      progressPercent,
    });

    coreInfo('Upload chunk processed', {
      operation: 'broadcast-box:upload:chunk',
      uploadId,
      chunkNumber,
      chunkSize: chunk.length,
    });
  }

  /**
   * Finalize upload (combine chunks and store in Storage Manager)
   */
  async finalizeUpload(
    uploadId: string,
    expectedDeviceId?: string
  ): Promise<string> {
    const upload = await this.uploadModel.getById(uploadId);
    if (!upload) {
      throw new Error(`Upload job not found: ${uploadId}`);
    }

    // Authorization: a device may only finalize its own upload job.
    if (expectedDeviceId !== undefined && upload.deviceId !== expectedDeviceId) {
      throw new Error(`Forbidden: device does not own upload ${uploadId}`);
    }

    if (upload.status !== 'uploading') {
      throw new Error(
        `Upload ${uploadId} is not in uploading state. Current status: ${upload.status}`
      );
    }

    // Update status to processing
    await this.uploadModel.update(uploadId, {
      status: 'processing',
    });

    try {
      // Combine chunks
      const uploadDir = path.join(this.uploadsDir, uploadId);
      const chunkFiles = await fs.readdir(uploadDir);
      const chunkPaths = chunkFiles
        .filter((f) => f.startsWith('chunk-'))
        .sort((a, b) => {
          const numA = parseInt(a.replace('chunk-', ''));
          const numB = parseInt(b.replace('chunk-', ''));
          return numA - numB;
        });

      const combinedPath = path.join(uploadDir, upload.fileName);
      const writeStream = await fs.open(combinedPath, 'w');

      for (const chunkFile of chunkPaths) {
        const chunkPath = path.join(uploadDir, chunkFile);
        const chunkData = await fs.readFile(chunkPath);
        await fs.appendFile(combinedPath, chunkData);
      }

      // Verify hash by STREAMING the combined file — never load the whole
      // recording into memory (a long meeting can exceed Node's ~2GB Buffer
      // limit, and even when it fits, two full reads doubled the footprint).
      const hash = await new Promise<string>((resolve, reject) => {
        const h = crypto.createHash('sha256');
        const rs = createReadStream(combinedPath);
        rs.on('error', reject);
        rs.on('data', (chunk) => h.update(chunk));
        rs.on('end', () => resolve(h.digest('hex')));
      });

      if (hash !== upload.fileHash) {
        throw new Error(
          `Hash mismatch. Expected: ${upload.fileHash}, Got: ${hash}`
        );
      }

      // Store in the storage service by streaming the file (no full-file buffer).
      const { size } = await fs.stat(combinedPath);
      const storageResult = await this.storageService.uploadFileStream({
        stream: createReadStream(combinedPath),
        filename: upload.fileName,
        // FA-BB-002: raw originals may contain in-camera (closed-session) A/V,
        // so they land in the PRIVATE recordings_raw folder. Only the redaction
        // worker publishes a verified redacted variant into the public
        // 'recordings' folder.
        folder: 'recordings_raw',
        size,
        contentType: upload.mimeType,
        description: `Recording from session ${upload.sessionId}`,
        uploaded_by: 'system', // System upload
      });

      if (!storageResult.success || !storageResult.file) {
        throw new Error(
          storageResult.error || 'Failed to store file in storage service'
        );
      }

      // Update upload status
      await this.uploadModel.update(uploadId, {
        status: 'complete',
        storageLocation: storageResult.file.id, // Use file UUID from storage service
        completedAt: new Date(),
        progressPercent: 100,
      });

      // Cleanup temporary files
      await this.cleanupUpload(uploadId);

      coreInfo('Upload finalized', {
        operation: 'broadcast-box:upload:finalized',
        uploadId,
        storageLocation: storageResult.file.id,
      });

      // Announce completion so the workflow trigger links the A/V to its
      // CivicPress session record and writes the `capture` block (W2). The hook
      // is best-effort: the recording is already stored, so a link failure must
      // not fail the upload. `upload.sessionId`/`deviceId` are the broadcast
      // session id + device (set in createUpload), which is what the trigger
      // (onRecordingComplete → linkFileToSession) expects.
      if (this.hookSystem && upload.sessionId) {
        try {
          await this.hookSystem.emit('broadcast-box:recording:complete', {
            sessionId: upload.sessionId,
            storageFileId: storageResult.file.id,
            deviceId: upload.deviceId,
          });
        } catch (hookError) {
          this.logger.error('Failed to emit recording:complete hook', {
            operation: 'broadcast-box:upload:recording-complete-hook-error',
            uploadId,
            error:
              hookError instanceof Error
                ? hookError.message
                : String(hookError),
          });
        }
      }

      return storageResult.file.id;
    } catch (error) {
      // Mark upload as failed
      await this.uploadModel.update(uploadId, {
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  }

  /**
   * Get upload job by ID
   */
  async getUpload(uploadId: string): Promise<UploadJob | null> {
    return this.uploadModel.getById(uploadId);
  }

  /**
   * Get upload by session ID
   */
  async getUploadBySessionId(sessionId: string): Promise<UploadJob | null> {
    return this.uploadModel.getBySessionId(sessionId);
  }

  /**
   * List uploads with filters
   */
  async listUploads(filters?: {
    sessionId?: string;
    deviceId?: string;
    status?: UploadStatus;
    limit?: number;
    offset?: number;
  }): Promise<UploadJob[]> {
    return this.uploadModel.list(filters);
  }

  /**
   * Cleanup temporary upload files
   */
  private async cleanupUpload(uploadId: string): Promise<void> {
    try {
      const uploadDir = path.join(this.uploadsDir, uploadId);
      await fs.rm(uploadDir, { recursive: true, force: true });
    } catch (error) {
      coreWarn('Failed to cleanup upload directory', {
        operation: 'broadcast-box:upload:cleanup-error',
        uploadId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
