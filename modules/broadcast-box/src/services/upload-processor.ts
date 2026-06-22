/**
 * Upload Processor Service
 *
 * Handles chunked file uploads from Broadcast Box devices
 */

import type { Logger } from '@civicpress/core';
import { coreInfo, coreWarn, coreError } from '@civicpress/core';
import * as fs from 'fs/promises';
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
    private logger: Logger
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
  async createUpload(request: CreateUploadRequest): Promise<UploadJob> {
    const uploadId = uuidv4();

    // Create upload directory for chunks
    const uploadDir = path.join(this.uploadsDir, uploadId);
    await fs.mkdir(uploadDir, { recursive: true });

    const upload: Omit<UploadJob, 'createdAt' | 'updatedAt'> = {
      id: uploadId,
      sessionId: request.sessionId,
      deviceId: '', // Will be set from session
      filePath: path.join(uploadDir, request.fileName),
      fileName: request.fileName,
      fileSize: request.fileSize,
      fileHash: request.fileHash,
      mimeType: request.mimeType,
      status: 'pending',
      progressPercent: 0,
    };

    // Get device ID from session
    const sessionModel = (this.uploadModel as any).db;
    const sessionRows = await sessionModel
      .getAdapter()
      .query('SELECT device_id FROM broadcast_sessions WHERE id = ?', [
        request.sessionId,
      ]);

    if (sessionRows.length > 0) {
      upload.deviceId = sessionRows[0].device_id;
    }

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
    chunkNumber: number
  ): Promise<void> {
    const upload = await this.uploadModel.getById(uploadId);
    if (!upload) {
      throw new Error(`Upload job not found: ${uploadId}`);
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
  async finalizeUpload(uploadId: string): Promise<string> {
    const upload = await this.uploadModel.getById(uploadId);
    if (!upload) {
      throw new Error(`Upload job not found: ${uploadId}`);
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

      // Verify hash
      const fileData = await fs.readFile(combinedPath);
      const hash = crypto.createHash('sha256').update(fileData).digest('hex');

      if (hash !== upload.fileHash) {
        throw new Error(
          `Hash mismatch. Expected: ${upload.fileHash}, Got: ${hash}`
        );
      }

      // Store in Storage Manager
      // Read file and create MulterFile-like object
      const fileBuffer = await fs.readFile(combinedPath);
      const multerFile = {
        fieldname: 'file',
        originalname: upload.fileName,
        encoding: '7bit',
        mimetype: upload.mimeType,
        buffer: fileBuffer,
        size: fileBuffer.length,
      };

      const storageResult = await this.storageService.uploadFile({
        file: multerFile as any,
        folder: 'recordings', // Use recordings folder for broadcast box files
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
        storageLocation: storageResult.uuid,
      });

      return storageResult.uuid;
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
