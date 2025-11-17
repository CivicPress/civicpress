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

describe('Geography API Endpoints', () => {
  let context: any;
  let adminToken: string;
  let testGeoJson: string;

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

    // Sample GeoJSON for testing
    testGeoJson = JSON.stringify({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [-73.5673, 45.5017],
          },
          properties: {
            name: 'Test Point',
            type: 'facility',
          },
        },
        {
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [-73.6, 45.5],
                [-73.5, 45.5],
                [-73.5, 45.6],
                [-73.6, 45.6],
                [-73.6, 45.5],
              ],
            ],
          },
          properties: {
            name: 'Test Zone',
            zone: 'R1',
          },
        },
      ],
    });
  });

  afterEach(async () => {
    await cleanupAPITestContext(context);
  });

  describe('POST /api/v1/geography/validate', () => {
    it('should validate valid GeoJSON content', async () => {
      const response = await request(context.api.getApp())
        .post('/api/v1/geography/validate')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          content: testGeoJson,
          type: 'geojson',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.valid).toBe(true);
      expect(response.body.data.metadata).toBeDefined();
      expect(response.body.data.metadata.featureCount).toBe(2);
    });

    it('should reject invalid GeoJSON content', async () => {
      const response = await request(context.api.getApp())
        .post('/api/v1/geography/validate')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          content: '{ invalid json }',
          type: 'geojson',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.valid).toBe(false);
      expect(response.body.data.errors.length).toBeGreaterThan(0);
    });

    it('should be publicly accessible (no auth required)', async () => {
      const response = await request(context.api.getApp())
        .post('/api/v1/geography/validate')
        .send({
          content: testGeoJson,
          type: 'geojson',
        });

      // Validate endpoint is public and doesn't require authentication
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe('POST /api/v1/geography - Create Geography File', () => {
    it('should create geography file successfully', async () => {
      const response = await request(context.api.getApp())
        .post('/api/v1/geography')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Test Geography',
          type: 'geojson',
          category: 'zone',
          description: 'Test geography file',
          content: testGeoJson,
          srid: 4326,
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data.name).toBe('Test Geography');
      expect(response.body.data.type).toBe('geojson');
      expect(response.body.data.category).toBe('zone');
    });

    it('should create geography file with color mapping', async () => {
      const colorMapping = {
        property: 'zone',
        type: 'property',
        colors: {
          R1: '#ff0000',
          R2: '#00ff00',
        },
        default_color: '#0000ff',
      };

      const response = await request(context.api.getApp())
        .post('/api/v1/geography')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Test Geography with Colors',
          type: 'geojson',
          category: 'zone',
          description: 'Test with color mapping',
          content: testGeoJson,
          srid: 4326,
          color_mapping: colorMapping,
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.metadata).toHaveProperty('color_mapping');
      expect(response.body.data.metadata.color_mapping).toMatchObject(
        colorMapping
      );
    });

    it('should create geography file with icon mapping', async () => {
      const iconMapping = {
        property: 'type',
        type: 'property',
        icons: {
          facility: {
            url: 'https://example.com/icon.png',
            size: [32, 32],
            anchor: [16, 32],
          },
        },
        default_icon: 'circle',
        apply_to: ['Point'],
      };

      const response = await request(context.api.getApp())
        .post('/api/v1/geography')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Test Geography with Icons',
          type: 'geojson',
          category: 'facility',
          description: 'Test with icon mapping',
          content: testGeoJson,
          srid: 4326,
          icon_mapping: iconMapping,
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.metadata).toHaveProperty('icon_mapping');
      expect(response.body.data.metadata.icon_mapping).toMatchObject(
        iconMapping
      );
    });

    it('should create geography file with UUID icon mapping', async () => {
      // First, upload an icon file to get a UUID
      const iconPath = path.join(context.testDir, 'test-icon.png');
      await fs.writeFile(iconPath, Buffer.from('fake png content'));

      const uploadResponse = await request(context.api.getApp())
        .post('/api/v1/storage/files')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', iconPath)
        .field('folder', 'icons')
        .field('description', 'Test icon');

      expect(uploadResponse.status).toBe(200);
      const iconUuid = uploadResponse.body.data.id;

      // Now create geography with UUID icon
      const iconMapping = {
        property: 'type',
        type: 'property',
        icons: {
          facility: {
            url: iconUuid, // Use UUID instead of URL
            size: [32, 32],
            anchor: [16, 32],
          },
        },
        default_icon: 'circle',
        apply_to: ['Point'],
      };

      const response = await request(context.api.getApp())
        .post('/api/v1/geography')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Test Geography with UUID Icon',
          type: 'geojson',
          category: 'facility',
          description: 'Test with UUID icon mapping',
          content: testGeoJson,
          srid: 4326,
          icon_mapping: iconMapping,
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.metadata).toHaveProperty('icon_mapping');
      expect(response.body.data.metadata.icon_mapping.icons.facility.url).toBe(
        iconUuid
      );
    });

    it('should fail without required fields', async () => {
      const response = await request(context.api.getApp())
        .post('/api/v1/geography')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Test Geography',
          // Missing required fields
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should require authentication', async () => {
      const response = await request(context.api.getApp())
        .post('/api/v1/geography')
        .send({
          name: 'Test Geography',
          type: 'geojson',
          category: 'zone',
          description: 'Test',
          content: testGeoJson,
        });

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/v1/geography - List Geography Files', () => {
    let geographyId: string;

    beforeEach(async () => {
      // Create a test geography file
      const createResponse = await request(context.api.getApp())
        .post('/api/v1/geography')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Test Geography List',
          type: 'geojson',
          category: 'zone',
          description: 'For listing test',
          content: testGeoJson,
          srid: 4326,
        });

      geographyId = createResponse.body.data.id;
    });

    it('should list geography files', async () => {
      const response = await request(context.api.getApp())
        .get('/api/v1/geography')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('files');
      expect(response.body.data).toHaveProperty('total');
      expect(Array.isArray(response.body.data.files)).toBe(true);
    });

    it('should filter by category', async () => {
      const response = await request(context.api.getApp())
        .get('/api/v1/geography?category=zone')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      response.body.data.files.forEach((file: any) => {
        expect(file.category).toBe('zone');
      });
    });

    it('should filter by type', async () => {
      const response = await request(context.api.getApp())
        .get('/api/v1/geography?type=geojson')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      response.body.data.files.forEach((file: any) => {
        expect(file.type).toBe('geojson');
      });
    });

    it('should support pagination', async () => {
      const response = await request(context.api.getApp())
        .get('/api/v1/geography?page=1&limit=5')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.files.length).toBeLessThanOrEqual(5);
    });
  });

  describe('GET /api/v1/geography/:id - Get Geography File', () => {
    let geographyId: string;

    beforeEach(async () => {
      const createResponse = await request(context.api.getApp())
        .post('/api/v1/geography')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Test Geography Get',
          type: 'geojson',
          category: 'zone',
          description: 'For get test',
          content: testGeoJson,
          srid: 4326,
        });

      geographyId = createResponse.body.data.id;
    });

    it('should get geography file by ID', async () => {
      const response = await request(context.api.getApp())
        .get(`/api/v1/geography/${geographyId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(geographyId);
      expect(response.body.data.name).toBe('Test Geography Get');
    });

    it('should return 404 for non-existent ID', async () => {
      const response = await request(context.api.getApp())
        .get('/api/v1/geography/non-existent-id')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/v1/geography/:id/raw - Get Raw Content', () => {
    let geographyId: string;

    beforeEach(async () => {
      const createResponse = await request(context.api.getApp())
        .post('/api/v1/geography')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Test Geography Raw',
          type: 'geojson',
          category: 'zone',
          description: 'For raw test',
          content: testGeoJson,
          srid: 4326,
        });

      geographyId = createResponse.body.data.id;
    });

    it('should return raw GeoJSON content', async () => {
      const response = await request(context.api.getApp())
        .get(`/api/v1/geography/${geographyId}/raw`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('application/json');
      const parsed = JSON.parse(response.text);
      expect(parsed.type).toBe('FeatureCollection');
      expect(parsed.features).toBeDefined();
    });

    it('should return 404 for non-existent ID', async () => {
      const response = await request(context.api.getApp())
        .get('/api/v1/geography/non-existent-id/raw')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(404);
    });
  });

  describe('PUT /api/v1/geography/:id - Update Geography File', () => {
    let geographyId: string;

    beforeEach(async () => {
      const createResponse = await request(context.api.getApp())
        .post('/api/v1/geography')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Test Geography Update',
          type: 'geojson',
          category: 'zone',
          description: 'For update test',
          content: testGeoJson,
          srid: 4326,
        });

      geographyId = createResponse.body.data.id;
    });

    it('should update geography file', async () => {
      const updatedColorMapping = {
        property: 'zone',
        type: 'property',
        colors: {
          R1: '#ff0000',
        },
        default_color: '#000000',
      };

      const response = await request(context.api.getApp())
        .put(`/api/v1/geography/${geographyId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Updated Geography',
          description: 'Updated description',
          color_mapping: updatedColorMapping,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe('Updated Geography');
      expect(response.body.data.metadata.color_mapping).toMatchObject(
        updatedColorMapping
      );
    });

    it('should update icon mapping with UUID', async () => {
      // Upload an icon first
      const iconPath = path.join(context.testDir, 'test-icon.png');
      await fs.writeFile(iconPath, Buffer.from('fake png content'));

      const uploadResponse = await request(context.api.getApp())
        .post('/api/v1/storage/files')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', iconPath)
        .field('folder', 'icons');

      expect(uploadResponse.status).toBe(200);
      expect(uploadResponse.body.success).toBe(true);
      expect(uploadResponse.body.data).toBeDefined();
      expect(uploadResponse.body.data.id).toBeDefined();
      const iconUuid = uploadResponse.body.data.id;

      const updatedIconMapping = {
        property: 'type',
        type: 'property',
        icons: {
          facility: {
            url: iconUuid,
            size: [32, 32],
            anchor: [16, 32],
          },
        },
        default_icon: 'circle',
        apply_to: ['Point'],
      };

      const response = await request(context.api.getApp())
        .put(`/api/v1/geography/${geographyId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          icon_mapping: updatedIconMapping,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.metadata.icon_mapping.icons.facility.url).toBe(
        iconUuid
      );
    });
  });

  describe('DELETE /api/v1/geography/:id - Delete Geography File', () => {
    let geographyId: string;

    beforeEach(async () => {
      const createResponse = await request(context.api.getApp())
        .post('/api/v1/geography')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Test Geography Delete',
          type: 'geojson',
          category: 'zone',
          description: 'For delete test',
          content: testGeoJson,
          srid: 4326,
        });

      geographyId = createResponse.body.data.id;
    });

    it('should delete geography file', async () => {
      const response = await request(context.api.getApp())
        .delete(`/api/v1/geography/${geographyId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Verify it's deleted
      const getResponse = await request(context.api.getApp())
        .get(`/api/v1/geography/${geographyId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(getResponse.status).toBe(404);
    });

    it('should return 404 for non-existent ID', async () => {
      const response = await request(context.api.getApp())
        .delete('/api/v1/geography/non-existent-id')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(404);
    });
  });

  describe('GET /api/v1/geography/presets - List Presets', () => {
    it('should list geography presets', async () => {
      const response = await request(context.api.getApp())
        .get('/api/v1/geography/presets')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);
    });

    it('should return presets with correct structure', async () => {
      const response = await request(context.api.getApp())
        .get('/api/v1/geography/presets')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      response.body.data.forEach((preset: any) => {
        expect(preset).toHaveProperty('key');
        expect(preset).toHaveProperty('name');
        expect(preset).toHaveProperty('description');
        expect(preset).toHaveProperty('type');
      });
    });
  });

  describe('GET /api/v1/geography/presets/:key - Get Preset', () => {
    it('should get a specific preset', async () => {
      // First get list to find a preset key
      const listResponse = await request(context.api.getApp())
        .get('/api/v1/geography/presets')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(listResponse.status).toBe(200);
      const presetKey = listResponse.body.data[0].key;

      const response = await request(context.api.getApp())
        .get(`/api/v1/geography/presets/${presetKey}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('key', presetKey);
      expect(response.body.data).toHaveProperty('name');
    });

    it('should return 404 for non-existent preset', async () => {
      const response = await request(context.api.getApp())
        .get('/api/v1/geography/presets/non-existent')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/v1/geography/presets/:key/apply - Apply Preset', () => {
    it('should apply a preset', async () => {
      // First get list to find a preset key
      const listResponse = await request(context.api.getApp())
        .get('/api/v1/geography/presets')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(listResponse.status).toBe(200);
      const presetKey = listResponse.body.data[0].key;

      const response = await request(context.api.getApp())
        .post(`/api/v1/geography/presets/${presetKey}/apply`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          existing_color_mapping: null,
          existing_icon_mapping: null,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('color_mapping');
      expect(response.body.data).toHaveProperty('icon_mapping');
    });

    it('should merge with existing mappings', async () => {
      const listResponse = await request(context.api.getApp())
        .get('/api/v1/geography/presets')
        .set('Authorization', `Bearer ${adminToken}`);

      const presetKey = listResponse.body.data[0].key;

      const existingColorMapping = {
        property: 'existing',
        colors: { test: '#ffffff' },
      };

      const response = await request(context.api.getApp())
        .post(`/api/v1/geography/presets/${presetKey}/apply`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          existing_color_mapping: existingColorMapping,
          existing_icon_mapping: null,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });
});
