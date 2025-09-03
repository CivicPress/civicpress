import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import fs from 'fs-extra';
import path from 'path';
import {
  createAPITestContext,
  cleanupAPITestContext,
  setupGlobalTestEnvironment,
} from '../fixtures/test-setup';

// Setup global test environment
await setupGlobalTestEnvironment();

describe('UUID Storage API', () => {
  let context: any;
  let adminToken: string;
  let testFilePath: string;

  beforeEach(async () => {
    context = await createAPITestContext();

    // Get authentication token for admin
    const adminResponse = await request(context.api.getApp())
      .post('/auth/simulated')
      .send({
        username: 'admin',
        role: 'admin',
      });
    adminToken = adminResponse.body.data.session.token;

    // Create a test file
    testFilePath = path.join(context.testDir, 'test-file.txt');
    await fs.writeFile(testFilePath, 'Test file content for UUID storage');
  });

  afterEach(async () => {
    await cleanupAPITestContext(context);
  });

  describe('POST /api/v1/storage/files - Upload File', () => {
    it('should upload file successfully with UUID', async () => {
      const response = await request(context.api.getApp())
        .post('/api/v1/storage/files')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', testFilePath)
        .field('folder', 'public')
        .field('description', 'Test file upload');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data).toHaveProperty(
        'original_name',
        'test-file.txt'
      );
      expect(response.body.data).toHaveProperty('path');
      expect(response.body.data).toHaveProperty('size');
      expect(response.body.data).toHaveProperty('mime_type');
      expect(response.body.data).toHaveProperty('url');

      // UUID format validation
      expect(response.body.data.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      );
    });

    it('should fail upload without authentication', async () => {
      const response = await request(context.api.getApp())
        .post('/api/v1/storage/files')
        .attach('file', testFilePath)
        .field('folder', 'public');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it('should validate required fields', async () => {
      const response = await request(context.api.getApp())
        .post('/api/v1/storage/files')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', testFilePath);
      // Missing folder field

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/v1/storage/files/:id - Download File', () => {
    let uploadedFileId: string;

    beforeEach(async () => {
      // Upload a file first
      const uploadResponse = await request(context.api.getApp())
        .post('/api/v1/storage/files')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', testFilePath)
        .field('folder', 'public')
        .field('description', 'Test file for download');

      // Debug upload response
      if (uploadResponse.status !== 200) {
        console.error(
          'Upload failed:',
          uploadResponse.status,
          uploadResponse.body
        );
        throw new Error(
          `Upload failed with status ${uploadResponse.status}: ${JSON.stringify(uploadResponse.body)}`
        );
      }

      if (!uploadResponse.body.data || !uploadResponse.body.data.id) {
        console.error('Upload response missing data:', uploadResponse.body);
        throw new Error(
          `Upload response missing data: ${JSON.stringify(uploadResponse.body)}`
        );
      }

      uploadedFileId = uploadResponse.body.data.id;
    });

    it('should download file by UUID', async () => {
      const response = await request(context.api.getApp())
        .get(`/api/v1/storage/files/${uploadedFileId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBeDefined();
      expect(response.headers['content-disposition']).toBeDefined();
    });

    it('should fail download without authentication', async () => {
      const response = await request(context.api.getApp()).get(
        `/api/v1/storage/files/${uploadedFileId}`
      );

      expect(response.status).toBe(401);
    });

    it('should return 404 for non-existent file', async () => {
      const fakeUuid = '123e4567-e89b-12d3-a456-426614174000';
      const response = await request(context.api.getApp())
        .get(`/api/v1/storage/files/${fakeUuid}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(404);
    });
  });

  describe('GET /api/v1/storage/files/:id/info - Get File Info', () => {
    let uploadedFileId: string;

    beforeEach(async () => {
      // Upload a file first
      const uploadResponse = await request(context.api.getApp())
        .post('/api/v1/storage/files')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', testFilePath)
        .field('folder', 'public')
        .field('description', 'Test file for info');

      // Debug upload response
      if (uploadResponse.status !== 200) {
        console.error(
          'Upload failed:',
          uploadResponse.status,
          uploadResponse.body
        );
        throw new Error(
          `Upload failed with status ${uploadResponse.status}: ${JSON.stringify(uploadResponse.body)}`
        );
      }

      if (!uploadResponse.body.data || !uploadResponse.body.data.id) {
        console.error('Upload response missing data:', uploadResponse.body);
        throw new Error(
          `Upload response missing data: ${JSON.stringify(uploadResponse.body)}`
        );
      }

      uploadedFileId = uploadResponse.body.data.id;
    });

    it('should get file info by UUID', async () => {
      const response = await request(context.api.getApp())
        .get(`/api/v1/storage/files/${uploadedFileId}/info`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.file).toHaveProperty('id', uploadedFileId);
      expect(response.body.data.file).toHaveProperty(
        'original_name',
        'test-file.txt'
      );
      expect(response.body.data.file).toHaveProperty('folder', 'public');
      expect(response.body.data.file).toHaveProperty(
        'description',
        'Test file for info'
      );
    });
  });

  describe('GET /api/v1/storage/folders/:folder/files - List Files', () => {
    beforeEach(async () => {
      // Upload a couple of test files
      await request(context.api.getApp())
        .post('/api/v1/storage/files')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', testFilePath)
        .field('folder', 'public')
        .field('description', 'Test file 1');

      await request(context.api.getApp())
        .post('/api/v1/storage/files')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', testFilePath)
        .field('folder', 'public')
        .field('description', 'Test file 2');
    });

    it('should list files in folder', async () => {
      const response = await request(context.api.getApp())
        .get('/api/v1/storage/folders/public/files')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.files).toBeDefined();
      expect(Array.isArray(response.body.data.files)).toBe(true);
      expect(response.body.data.files.length).toBeGreaterThanOrEqual(2);

      // Check file structure
      const file = response.body.data.files[0];
      expect(file).toHaveProperty('id');
      expect(file).toHaveProperty('original_name');
      expect(file).toHaveProperty('relative_path');
      expect(file).toHaveProperty('size');
      expect(file).toHaveProperty('mime_type');
    });
  });

  describe('DELETE /api/v1/storage/files/:id - Delete File', () => {
    let uploadedFileId: string;

    beforeEach(async () => {
      // Upload a file first
      const uploadResponse = await request(context.api.getApp())
        .post('/api/v1/storage/files')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', testFilePath)
        .field('folder', 'public')
        .field('description', 'Test file for deletion');

      // Debug upload response
      if (uploadResponse.status !== 200) {
        console.error(
          'Upload failed:',
          uploadResponse.status,
          uploadResponse.body
        );
        throw new Error(
          `Upload failed with status ${uploadResponse.status}: ${JSON.stringify(uploadResponse.body)}`
        );
      }

      if (!uploadResponse.body.data || !uploadResponse.body.data.id) {
        console.error('Upload response missing data:', uploadResponse.body);
        throw new Error(
          `Upload response missing data: ${JSON.stringify(uploadResponse.body)}`
        );
      }

      uploadedFileId = uploadResponse.body.data.id;
    });

    it('should delete file by UUID', async () => {
      const response = await request(context.api.getApp())
        .delete(`/api/v1/storage/files/${uploadedFileId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.message).toContain('deleted successfully');

      // Verify file is actually deleted
      const downloadResponse = await request(context.api.getApp())
        .get(`/api/v1/storage/files/${uploadedFileId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(downloadResponse.status).toBe(404);
    });

    it('should fail delete without authentication', async () => {
      const response = await request(context.api.getApp()).delete(
        `/api/v1/storage/files/${uploadedFileId}`
      );

      expect(response.status).toBe(401);
    });
  });
});
