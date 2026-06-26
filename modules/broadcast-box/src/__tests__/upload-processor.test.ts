/**
 * UploadProcessor Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { UploadProcessor } from '../services/upload-processor.js';
import type { Logger } from '@civicpress/core';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';

describe('UploadProcessor', () => {
  let processor: UploadProcessor;
  let mockDb: any;
  let mockStorageService: any;
  let testDir: string;
  let mockLogger: Logger;
  let mockHookSystem: any;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'broadcast-box-upload-test-')
    );
    await fs.mkdir(path.join(testDir, 'tmp', 'uploads'), { recursive: true });

    mockDb = {
      getAdapter: vi.fn().mockReturnValue({
        execute: vi.fn(),
        query: vi.fn(),
      }),
    };

    mockStorageService = {
      uploadFile: vi.fn().mockResolvedValue({
        success: true,
        file: {
          id: 'storage-file-id',
          original_name: 'test.mp4',
        },
      }),
    };

    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as any;

    mockHookSystem = { emit: vi.fn(), registerHook: vi.fn() };

    processor = new UploadProcessor(
      mockDb,
      mockStorageService,
      testDir,
      mockLogger,
      mockHookSystem
    );

    await processor.initialize();
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('createUpload', () => {
    it('should create a new upload job', async () => {
      const request = {
        sessionId: 'session-id',
        fileName: 'test.mp4',
        fileSize: 1000000,
        fileHash: 'test-hash',
        mimeType: 'video/mp4',
      };

      // Mock upload model with db property
      const mockSessionDb = {
        getAdapter: vi.fn().mockReturnValue({
          query: vi.fn().mockResolvedValue([{ device_id: 'device-id' }]),
        }),
      };

      const mockUploadModel = {
        db: mockSessionDb,
        create: vi.fn().mockResolvedValue({
          id: 'upload-id',
          sessionId: request.sessionId,
          deviceId: 'device-id',
          fileName: request.fileName,
          fileSize: request.fileSize,
          fileHash: request.fileHash,
          mimeType: request.mimeType,
          status: 'pending',
          progressPercent: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      };

      (processor as any).uploadModel = mockUploadModel;

      const result = await processor.createUpload(request);

      expect(result).toBeDefined();
      expect(result.fileName).toBe(request.fileName);
      expect(result.status).toBe('pending');
      expect(mockUploadModel.create).toHaveBeenCalled();
    });
  });

  describe('processChunk', () => {
    it('should process an upload chunk', async () => {
      const uploadId = 'upload-id';
      const chunk = Buffer.from('test chunk data');
      const chunkNumber = 0;

      // Ensure upload directory exists
      const uploadDir = path.join(testDir, 'tmp', 'uploads', uploadId);
      await fs.mkdir(uploadDir, { recursive: true });

      const mockUploadModel = {
        getById: vi
          .fn()
          .mockResolvedValueOnce({
            id: uploadId,
            status: 'pending',
            fileName: 'test.mp4',
          })
          .mockResolvedValueOnce({
            id: uploadId,
            status: 'uploading',
            fileName: 'test.mp4',
          }),
        update: vi.fn().mockResolvedValue({
          id: uploadId,
          status: 'uploading',
          progressPercent: 0,
        }),
      };

      (processor as any).uploadModel = mockUploadModel;

      await processor.processChunk(uploadId, chunk, chunkNumber);

      // Check that chunk file was written
      const chunkPath = path.join(uploadDir, `chunk-${chunkNumber}`);
      const chunkExists = await fs
        .access(chunkPath)
        .then(() => true)
        .catch(() => false);
      expect(chunkExists).toBe(true);

      expect(mockUploadModel.update).toHaveBeenCalled();
    });

    it('should throw error if upload not found', async () => {
      const mockUploadModel = {
        getById: vi.fn().mockResolvedValue(null),
      };

      (processor as any).uploadModel = mockUploadModel;

      await expect(
        processor.processChunk('unknown-id', Buffer.from('data'), 0)
      ).rejects.toThrow('Upload job not found');
    });

    it('should throw error if upload already complete', async () => {
      const mockUploadModel = {
        getById: vi.fn().mockResolvedValue({
          id: 'upload-id',
          status: 'complete',
        }),
      };

      (processor as any).uploadModel = mockUploadModel;

      await expect(
        processor.processChunk('upload-id', Buffer.from('data'), 0)
      ).rejects.toThrow('already complete');
    });
  });

  describe('finalizeUpload', () => {
    it('should finalize upload and store in storage', async () => {
      const uploadId = 'upload-id';
      const fileName = 'test.mp4';
      const fileData = Buffer.from('test file content');
      const fileHash = crypto
        .createHash('sha256')
        .update(fileData)
        .digest('hex');

      // Create chunks
      const uploadDir = path.join(testDir, 'tmp', 'uploads', uploadId);
      await fs.mkdir(uploadDir, { recursive: true });
      await fs.writeFile(path.join(uploadDir, 'chunk-0'), fileData);

      const mockUploadModel = {
        getById: vi
          .fn()
          .mockResolvedValueOnce({
            id: uploadId,
            sessionId: 'session-id',
            deviceId: 'device-id',
            fileName,
            filePath: path.join(uploadDir, fileName),
            fileSize: fileData.length,
            fileHash,
            mimeType: 'video/mp4',
            status: 'uploading',
          })
          .mockResolvedValueOnce({
            id: uploadId,
            status: 'complete',
            storageLocation: 'storage-file-id',
          }),
        update: vi.fn().mockResolvedValue({
          id: uploadId,
          status: 'complete',
          storageLocation: 'storage-file-id',
        }),
      };

      (processor as any).uploadModel = mockUploadModel;

      // Storage uploadFile returns { success, file: { id } } — the id IS the
      // stored file's UUID (there is no separate `uuid` field on the response).
      mockStorageService.uploadFile.mockResolvedValue({
        success: true,
        file: {
          id: 'storage-file-id',
          original_name: fileName,
        },
      });

      // finalizeUpload returns the stored file id.
      const storageUuid = await processor.finalizeUpload(uploadId);

      expect(storageUuid).toBe('storage-file-id');
      expect(mockStorageService.uploadFile).toHaveBeenCalled();
      expect(mockUploadModel.update).toHaveBeenCalled();
      // Announces completion (broadcast-session id + storage uuid + device) so
      // the workflow trigger links the A/V to its session record + writes capture.
      expect(mockHookSystem.emit).toHaveBeenCalledWith(
        'broadcast-box:recording:complete',
        {
          sessionId: 'session-id',
          storageFileId: 'storage-file-id',
          deviceId: 'device-id',
        }
      );
    });

    it('should throw error if hash mismatch', async () => {
      const uploadId = 'upload-id';
      const fileName = 'test.mp4';
      const fileData = Buffer.from('test file content');
      const wrongHash = 'wrong-hash';

      // Create chunks
      const uploadDir = path.join(testDir, 'tmp', 'uploads', uploadId);
      await fs.mkdir(uploadDir, { recursive: true });
      await fs.writeFile(path.join(uploadDir, 'chunk-0'), fileData);

      const mockUploadModel = {
        getById: vi.fn().mockResolvedValue({
          id: uploadId,
          sessionId: 'session-id',
          deviceId: 'device-id',
          fileName,
          fileSize: fileData.length,
          fileHash: wrongHash,
          mimeType: 'video/mp4',
          status: 'uploading',
        }),
        update: vi.fn(),
      };

      (processor as any).uploadModel = mockUploadModel;

      await expect(processor.finalizeUpload(uploadId)).rejects.toThrow(
        'Hash mismatch'
      );
    });
  });

  describe('getUpload', () => {
    it('should get upload by ID', async () => {
      const uploadId = 'upload-id';
      const mockUpload = {
        id: uploadId,
        sessionId: 'session-id',
        status: 'uploading',
      };

      const mockUploadModel = {
        getById: vi.fn().mockResolvedValue(mockUpload),
      };

      (processor as any).uploadModel = mockUploadModel;

      const result = await processor.getUpload(uploadId);

      expect(result).toEqual(mockUpload);
    });
  });

  describe('listUploads', () => {
    it('should list uploads with filters', async () => {
      const filters = { sessionId: 'session-id', status: 'uploading' };
      const mockUploads = [
        { id: 'upload-1', sessionId: 'session-id', status: 'uploading' },
        { id: 'upload-2', sessionId: 'session-id', status: 'uploading' },
      ];

      const mockUploadModel = {
        list: vi.fn().mockResolvedValue(mockUploads),
      };

      (processor as any).uploadModel = mockUploadModel;

      const result = await processor.listUploads(filters);

      expect(result).toEqual(mockUploads);
      expect(mockUploadModel.list).toHaveBeenCalledWith(filters);
    });
  });
});
