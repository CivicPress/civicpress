import request from 'supertest';
import {
  createAPITestContext,
  APITestContext,
  cleanupAPITestContext,
} from '../fixtures/test-setup';
import { ConfigurationService } from '@civicpress/core';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';

describe('API Configuration Validation', () => {
  let context: APITestContext;
  let configService: ConfigurationService;

  // Get admin token for authenticated requests

  beforeAll(async () => {
    context = await createAPITestContext();
    configService = new ConfigurationService({
      dataPath: join(context.testDir, 'data', '.civic'),
      defaultsPath: 'core/src/defaults',
      systemDataPath: join(context.testDir, '.system-data'),
    });
  });

  afterAll(async () => {
    if (context) {
      await cleanupAPITestContext(context);
    }
  });

  // Helper to get admin token
  const getAdminToken = () => context.adminToken || context.authToken || '';
  // Check if we have a token for authenticated tests
  const hasAuthToken = () => !!(context.adminToken || context.authToken);

  // Note: API endpoint tests require adminToken to be set in test context.
  // If adminToken is not available, these tests will get 401 (unauthorized),
  // which is correct behavior but prevents testing the validation logic.
  // The core service tests below work without authentication.

  describe('POST /api/v1/config/:type/validate - Validate Configuration', () => {
    describe('Validation without content (validates saved file)', () => {
      it('should validate existing configuration file', async () => {
        // Create a valid analytics config file
        const analyticsConfigPath = join(
          context.testDir,
          'data',
          '.civic',
          'analytics.yml'
        );
        await mkdir(join(context.testDir, 'data', '.civic'), {
          recursive: true,
        });
        await writeFile(
          analyticsConfigPath,
          `_metadata:
  name: 'Analytics & Custom Content'
  description: 'Inject custom HTML, scripts, or CSS into the site'
  version: '1.0.0'
  editable: true

enabled:
  value: true
  type: 'boolean'
  description: 'Enable or disable all custom content injections'
  required: true

inject_head:
  value: ''
  type: 'textarea'
  description: 'HTML content to inject into the <head> section.'
  required: false
`,
          'utf-8'
        );

        const response = await request(context.api.getApp())
          .post('/api/v1/config/analytics/validate')
          .set('Authorization', `Bearer ${getAdminToken()}`)
          .send();

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data).toBeDefined();
        expect(response.body.data.valid).toBe(true);
        expect(response.body.data.errors).toEqual([]);
      });
    });

    describe('Validation with content (validates provided YAML)', () => {
      it('should validate valid YAML content', async () => {
        const validYAML = `_metadata:
  name: 'Analytics & Custom Content'
  description: 'Inject custom HTML, scripts, or CSS into the site'
  version: '1.0.0'
  editable: true

enabled:
  value: true
  type: 'boolean'
  description: 'Enable or disable all custom content injections'
  required: true

inject_head:
  value: '<script>console.log("test")</script>'
  type: 'textarea'
  description: 'HTML content to inject into the <head> section.'
  required: false
`;

        const response = await request(context.api.getApp())
          .post('/api/v1/config/analytics/validate')
          .set('Authorization', `Bearer ${getAdminToken()}`)
          .set('Content-Type', 'text/yaml')
          .send(validYAML);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data.valid).toBe(true);
        expect(response.body.data.errors).toEqual([]);
      });

      it('should detect YAML syntax errors (unclosed string)', async () => {
        const invalidYAML = `_metadata:
  name: 'Analytics'
enabled:
  value: true
invalid_key: [unclosed
`;

        const response = await request(context.api.getApp())
          .post('/api/v1/config/analytics/validate')
          .set('Authorization', `Bearer ${getAdminToken()}`)
          .set('Content-Type', 'text/yaml')
          .send(invalidYAML);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data.valid).toBe(false);
        expect(response.body.data.errors).toBeDefined();
        expect(response.body.data.errors.length).toBeGreaterThan(0);
        expect(response.body.data.errors[0]).toContain('YAML syntax error');
      });

      it('should detect missing required fields in org-config', async () => {
        // After transformToLegacyFormat, org-config needs name, city, state, country at top level
        const invalidOrgConfig = `_metadata:
  name: 'Organization Configuration'
  version: '1.0.0'

name: 'Test City'
# Missing city, state, country - these are required after transform
`;

        const response = await request(context.api.getApp())
          .post('/api/v1/config/org-config/validate')
          .set('Authorization', `Bearer ${getAdminToken()}`)
          .set('Content-Type', 'text/yaml')
          .send(invalidOrgConfig);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data.valid).toBe(false);
        expect(response.body.data.errors.length).toBeGreaterThan(0);
        expect(
          response.body.data.errors.some((e: string) =>
            e.includes('City is required')
          )
        ).toBe(true);
        expect(
          response.body.data.errors.some((e: string) =>
            e.includes('State/Province is required')
          )
        ).toBe(true);
        expect(
          response.body.data.errors.some((e: string) =>
            e.includes('Country is required')
          )
        ).toBe(true);
        expect(response.body.data.valid).toBe(false);
        expect(response.body.data.errors.length).toBeGreaterThan(0);
        expect(
          response.body.data.errors.some((e: string) =>
            e.includes('City is required')
          )
        ).toBe(true);
        expect(
          response.body.data.errors.some((e: string) =>
            e.includes('State/Province is required')
          )
        ).toBe(true);
        expect(
          response.body.data.errors.some((e: string) =>
            e.includes('Country is required')
          )
        ).toBe(true);
      });
    });

    describe('Authentication and Authorization', () => {
      it('should allow public access (validation is public)', async () => {
        // Config validation endpoint is intentionally public - no auth required
        const response = await request(context.api.getApp())
          .post('/api/v1/config/analytics/validate')
          .send();

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });

      it('should work with or without authentication', async () => {
        // Config validation endpoint is intentionally public - works with any token or none
        const token =
          context.regularUserToken || context.adminToken || undefined;
        const requestBuilder = request(context.api.getApp()).post(
          '/api/v1/config/analytics/validate'
        );

        if (token) {
          requestBuilder.set('Authorization', `Bearer ${token}`);
        }

        const response = await requestBuilder.send();

        // Should succeed regardless of authentication
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });
    });
  });

  describe('Core ConfigurationService.validateConfiguration()', () => {
    it('should validate configuration without content (loads from disk)', async () => {
      // Create a valid config file
      const configPath = join(
        context.testDir,
        'data',
        '.civic',
        'analytics.yml'
      );
      await mkdir(join(context.testDir, 'data', '.civic'), {
        recursive: true,
      });
      await writeFile(
        configPath,
        `_metadata:
  name: 'Analytics'
enabled:
  value: true
  type: 'boolean'
`,
        'utf-8'
      );

      const result = await configService.validateConfiguration('analytics');

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should validate configuration with provided content', async () => {
      const validYAML = `_metadata:
  name: 'Analytics'
enabled:
  value: true
  type: 'boolean'
`;

      const result = await configService.validateConfiguration(
        'analytics',
        validYAML
      );

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should detect YAML syntax errors in provided content', async () => {
      const invalidYAML = `_metadata:
  name: 'Analytics'
enabled:
  value: true
invalid_key: [unclosed
`;

      const result = await configService.validateConfiguration(
        'analytics',
        invalidYAML
      );

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('YAML syntax error');
    });

    it('should detect missing required fields when validating content', async () => {
      const invalidOrgConfig = `_metadata:
  name: 'Organization Configuration'
name:
  value: 'Test City'
  type: 'string'
# Missing city, state, country`;

      const result = await configService.validateConfiguration(
        'org-config',
        invalidOrgConfig
      );

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some((e) => e.includes('City is required'))).toBe(
        true
      );
    });
  });
});
