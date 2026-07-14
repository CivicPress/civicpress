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

/**
 * FA-BB-007: hard cap on a single upload's declared (and actual) size.
 * A long council meeting at a few Mbps is single-digit GB; 16 GiB leaves
 * generous headroom while stopping an authenticated-but-malicious device
 * from filling the disk. Override via BROADCAST_BOX_MAX_UPLOAD_BYTES.
 */
const DEFAULT_MAX_UPLOAD_BYTES = 16 * 1024 * 1024 * 1024;

function maxUploadBytes(): number {
  const raw = Number(process.env.BROADCAST_BOX_MAX_UPLOAD_BYTES);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_MAX_UPLOAD_BYTES;
}

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
   * FA-BB-003: `fileName` is device-controlled and becomes a DISK path
   * (`path.join(uploadDir, fileName)`) — chunk bytes are written there
   * BEFORE the hash check, so `../` meant an authenticated/compromised
   * device could write attacker-controlled bytes to an arbitrary path
   * (config/hook overwrite → plausible RCE). Only a plain basename is
   * accepted; anything else fails the upload up front.
   */
  private assertSafeFileName(fileName: string): void {
    if (
      typeof fileName !== 'string' ||
      fileName.length === 0 ||
      fileName.length > 255 ||
      fileName === '.' ||
      fileName === '..' ||
      /[/\\\0]/.test(fileName) ||
      fileName !== path.basename(fileName)
    ) {
      throw new Error('Invalid fileName: must be a plain file name');
    }
  }

  /**
   * Create a new upload job
   */
  async createUpload(
    request: CreateUploadRequest,
    expectedDeviceId?: string
  ): Promise<UploadJob> {
    this.assertSafeFileName(request.fileName);

    // FA-BB-007: the declared size is the budget every later chunk write is
    // checked against, so it must be a sane bounded integer up front.
    const declaredSize = Number(request.fileSize);
    if (
      !Number.isSafeInteger(declaredSize) ||
      declaredSize <= 0 ||
      declaredSize > maxUploadBytes()
    ) {
      throw new Error(
        `Invalid fileSize: must be a positive integer <= ${maxUploadBytes()} bytes`
      );
    }

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
      fileSize: declaredSize,
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

    // FA-BB-007: chunkNumber becomes part of a filename and drives ordering —
    // reject anything that isn't a plain non-negative integer.
    if (!Number.isSafeInteger(chunkNumber) || chunkNumber < 0) {
      throw new Error('Invalid chunkNumber: must be a non-negative integer');
    }

    // FA-BB-007: enforce the declared size as a hard budget. Sum what is
    // already on disk (excluding a chunk being re-sent under the same number,
    // which overwrites) and reject when this chunk would exceed it — without
    // this, a device could stream unlimited chunks regardless of fileSize.
    const uploadDir = path.join(this.uploadsDir, uploadId);
    const chunkName = `chunk-${chunkNumber}`;
    let bytesOnDisk = 0;
    for (const f of await fs.readdir(uploadDir)) {
      if (f.startsWith('chunk-') && f !== chunkName) {
        bytesOnDisk += (await fs.stat(path.join(uploadDir, f))).size;
      }
    }
    if (bytesOnDisk + chunk.length > upload.fileSize) {
      await this.uploadModel.update(uploadId, {
        status: 'failed',
        error: 'Upload exceeded declared fileSize',
      });
      await this.cleanupUpload(uploadId);
      throw new Error(
        `Upload ${uploadId} exceeded its declared fileSize (${upload.fileSize} bytes)`
      );
    }

    // Update status to uploading if first chunk
    if (upload.status === 'pending') {
      await this.uploadModel.update(uploadId, {
        status: 'uploading',
        startedAt: new Date(),
      });
    }

    // Write chunk to temporary file
    const chunkPath = path.join(uploadDir, chunkName);
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

      // FA-BB-007: the declared fileSize was never verified — enforce that
      // what actually arrived matches what was declared at createUpload.
      if (size !== upload.fileSize) {
        throw new Error(
          `Size mismatch. Declared: ${upload.fileSize}, Got: ${size}`
        );
      }
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
