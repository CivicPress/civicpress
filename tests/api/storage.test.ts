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

describe('API Storage Integration', () => {
  let context: any;
  let adminToken: string;
  let clerkToken: string;
  let publicToken: string;
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

    // Get authentication token for clerk
    const clerkResponse = await request(context.api.getApp())
      .post('/auth/simulated')
      .send({
        username: 'clerk',
        role: 'clerk',
      });
    clerkToken = clerkResponse.body.data.session.token;

    // Get authentication token for public user
    const publicResponse = await request(context.api.getApp())
      .post('/auth/simulated')
      .send({
        username: 'public',
        role: 'public',
      });
    publicToken = publicResponse.body.data.session.token;

    // Create a test file for upload tests
    testFilePath = path.join(context.testDir, 'test-file.txt');
    await fs.writeFile(testFilePath, 'Test file content for storage API tests');
  });

  afterEach(async () => {
    await cleanupAPITestContext(context);
    // Clean up test file
    if (await fs.pathExists(testFilePath)) {
      await fs.remove(testFilePath);
    }
  });

  describe('GET /api/v1/storage/config - Get Storage Configuration', () => {
    it('should fail to get storage config without authentication', async () => {
      const response = await request(context.api.getApp()).get(
        '/api/v1/storage/config'
      );

      expect(response.status).toBe(401);
    });

    it('should get storage config successfully with admin role', async () => {
      const response = await request(context.api.getApp())
        .get('/api/v1/storage/config')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.config).toBeDefined();
      expect(response.body.data.config.backend).toBeDefined();
      expect(response.body.data.config.folders).toBeDefined();
    });

    it('should get storage config with clerk role', async () => {
      const response = await request(context.api.getApp())
        .get('/api/v1/storage/config')
        .set('Authorization', `Bearer ${clerkToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should reject public user access to storage config', async () => {
      const response = await request(context.api.getApp())
        .get('/api/v1/storage/config')
        .set('Authorization', `Bearer ${publicToken}`);

      expect(response.status).toBe(403);
    });
  });

  describe('PUT /api/v1/storage/config - Update Storage Configuration', () => {
    it('should fail to update storage config without authentication', async () => {
      const response = await request(context.api.getApp())
        .put('/api/v1/storage/config')
        .send({
          metadata: {
            auto_generate_thumbnails: true,
          },
        });

      expect(response.status).toBe(401);
    });

    it('should update storage config successfully with admin role', async () => {
      const response = await request(context.api.getApp())
        .put('/api/v1/storage/config')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          metadata: {
            auto_generate_thumbnails: true,
            store_exif: true,
          },
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.config.metadata.auto_generate_thumbnails).toBe(
        true
      );
      expect(response.body.data.config.metadata.store_exif).toBe(true);
    });

    it('should reject non-admin users from updating storage config', async () => {
      const response = await request(context.api.getApp())
        .put('/api/v1/storage/config')
        .set('Authorization', `Bearer ${clerkToken}`)
        .send({
          metadata: {
            auto_generate_thumbnails: true,
          },
        });

      expect(response.status).toBe(403);
    });
  });

  describe('POST /api/v1/storage/upload/:folder - Upload File', () => {
    it('should fail to upload file without authentication', async () => {
      const response = await request(context.api.getApp())
        .post('/api/v1/storage/upload/public')
        .attach('file', testFilePath);

      expect(response.status).toBe(401);
    });

    it('should upload file successfully with upload permission', async () => {
      const response = await request(context.api.getApp())
        .post('/api/v1/storage/upload/public')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', testFilePath);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.file).toBeDefined();
      expect(response.body.data.url).toBeDefined();
      expect(response.body.data.path).toBeDefined();
    });

    it('should reject upload to non-existent folder', async () => {
      const response = await request(context.api.getApp())
        .post('/api/v1/storage/upload/nonexistent')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', testFilePath);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });

    it('should reject invalid file types', async () => {
      // Create an invalid file
      const invalidFile = path.join(context.testDir, 'test.exe');
      await fs.writeFile(invalidFile, 'Invalid file content');

      const response = await request(context.api.getApp())
        .post('/api/v1/storage/upload/public')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', invalidFile);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);

      // Clean up
      await fs.remove(invalidFile);
    });
  });

  describe('GET /api/v1/storage/files/:folder - List Files', () => {
    it('should fail to list files without authentication', async () => {
      const response = await request(context.api.getApp()).get(
        '/api/v1/storage/files/public'
      );

      expect(response.status).toBe(401);
    });

    it('should list files successfully with download permission', async () => {
      const response = await request(context.api.getApp())
        .get('/api/v1/storage/files/public')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.files).toBeDefined();
      expect(Array.isArray(response.body.data.files)).toBe(true);
      expect(response.body.data.pagination).toBeDefined();
    });

    it('should support pagination parameters', async () => {
      const response = await request(context.api.getApp())
        .get('/api/v1/storage/files/public?page=1&limit=10')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.pagination.page).toBe(1);
      expect(response.body.data.pagination.limit).toBe(10);
    });

    it('should support search parameter', async () => {
      const response = await request(context.api.getApp())
        .get('/api/v1/storage/files/public?search=test')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should reject access to non-existent folder', async () => {
      const response = await request(context.api.getApp())
        .get('/api/v1/storage/files/nonexistent')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/v1/storage/download/:folder/:filename - Download File', () => {
    it('should fail to download file without authentication', async () => {
      const response = await request(context.api.getApp()).get(
        '/api/v1/storage/download/public/test-file.txt'
      );

      expect(response.status).toBe(401);
    });

    it('should download file successfully with download permission', async () => {
      // First upload a file
      await request(context.api.getApp())
        .post('/api/v1/storage/upload/public')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', testFilePath);

      // Then download it
      const response = await request(context.api.getApp())
        .get('/api/v1/storage/download/public/test-file.txt')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBeDefined();
      expect(response.headers['content-disposition']).toBeDefined();
      expect(response.headers['content-length']).toBeDefined();
    });

    it('should reject download of non-existent file', async () => {
      const response = await request(context.api.getApp())
        .get('/api/v1/storage/download/public/nonexistent.txt')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });
  });

  describe('DELETE /api/v1/storage/files/:folder/:filename - Delete File', () => {
    it('should fail to delete file without authentication', async () => {
      const response = await request(context.api.getApp()).delete(
        '/api/v1/storage/files/public/test-file.txt'
      );

      expect(response.status).toBe(401);
    });

    it('should delete file successfully with delete permission', async () => {
      // First upload a file
      await request(context.api.getApp())
        .post('/api/v1/storage/upload/public')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', testFilePath);

      // Then delete it
      const response = await request(context.api.getApp())
        .delete('/api/v1/storage/files/public/test-file.txt')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.message).toContain('deleted successfully');
    });

    it('should reject deletion of non-existent file', async () => {
      const response = await request(context.api.getApp())
        .delete('/api/v1/storage/files/public/nonexistent.txt')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/v1/storage/files/:folder/:filename/info - Get File Info', () => {
    it('should fail to get file info without authentication', async () => {
      const response = await request(context.api.getApp()).get(
        '/api/v1/storage/files/public/test-file.txt/info'
      );

      expect(response.status).toBe(401);
    });

    it('should get file info successfully with download permission', async () => {
      // First upload a file
      await request(context.api.getApp())
        .post('/api/v1/storage/upload/public')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', testFilePath);

      // Then get its info
      const response = await request(context.api.getApp())
        .get('/api/v1/storage/files/public/test-file.txt/info')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.file).toBeDefined();
      expect(response.body.data.file.name).toBeDefined();
      expect(response.body.data.file.size).toBeDefined();
      expect(response.body.data.file.mime_type).toBeDefined();
    });
  });

  describe('POST /api/v1/storage/folders - Add Folder', () => {
    it('should fail to add folder without authentication', async () => {
      const response = await request(context.api.getApp())
        .post('/api/v1/storage/folders')
        .send({
          name: 'test-folder',
          config: {
            path: 'test-folder',
            access: 'public',
            allowed_types: ['txt', 'md'],
            max_size: '1MB',
            description: 'Test folder',
          },
        });

      expect(response.status).toBe(401);
    });

    it('should add folder successfully with admin permission', async () => {
      const response = await request(context.api.getApp())
        .post('/api/v1/storage/folders')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'test-folder',
          config: {
            path: 'test-folder',
            access: 'public',
            allowed_types: ['txt', 'md'],
            max_size: '1MB',
            description: 'Test folder',
          },
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.config.folders['test-folder']).toBeDefined();
    });

    it('should reject non-admin users from adding folders', async () => {
      const response = await request(context.api.getApp())
        .post('/api/v1/storage/folders')
        .set('Authorization', `Bearer ${clerkToken}`)
        .send({
          name: 'test-folder',
          config: {
            path: 'test-folder',
            access: 'public',
            allowed_types: ['txt', 'md'],
            max_size: '1MB',
            description: 'Test folder',
          },
        });

      expect(response.status).toBe(403);
    });

    it('should validate required fields', async () => {
      const response = await request(context.api.getApp())
        .post('/api/v1/storage/folders')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'test-folder',
          config: {
            // Missing required fields
          },
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('PUT /api/v1/storage/folders/:name - Update Folder', () => {
    it('should fail to update folder without authentication', async () => {
      const response = await request(context.api.getApp())
        .put('/api/v1/storage/folders/test-folder')
        .send({
          config: {
            max_size: '2MB',
            description: 'Updated test folder',
          },
        });

      expect(response.status).toBe(401);
    });

    it('should update folder successfully with admin permission', async () => {
      // First add a folder
      await request(context.api.getApp())
        .post('/api/v1/storage/folders')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'test-folder',
          config: {
            path: 'test-folder',
            access: 'public',
            allowed_types: ['txt', 'md'],
            max_size: '1MB',
            description: 'Test folder',
          },
        });

      // Then update it
      const response = await request(context.api.getApp())
        .put('/api/v1/storage/folders/test-folder')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          config: {
            max_size: '2MB',
            description: 'Updated test folder',
          },
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.config.folders['test-folder'].max_size).toBe(
        '2MB'
      );
      expect(response.body.data.config.folders['test-folder'].description).toBe(
        'Updated test folder'
      );
    });
  });

  describe('DELETE /api/v1/storage/folders/:name - Remove Folder', () => {
    it('should fail to remove folder without authentication', async () => {
      const response = await request(context.api.getApp()).delete(
        '/api/v1/storage/folders/test-folder'
      );

      expect(response.status).toBe(401);
    });

    it('should remove folder successfully with admin permission', async () => {
      // First add a folder
      await request(context.api.getApp())
        .post('/api/v1/storage/folders')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'test-folder',
          config: {
            path: 'test-folder',
            access: 'public',
            allowed_types: ['txt', 'md'],
            max_size: '1MB',
            description: 'Test folder',
          },
        });

      // Then remove it
      const response = await request(context.api.getApp())
        .delete('/api/v1/storage/folders/test-folder')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.message).toContain('removed successfully');
    });

    it('should prevent removal of system folders', async () => {
      const response = await request(context.api.getApp())
        .delete('/api/v1/storage/folders/public')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });
});
