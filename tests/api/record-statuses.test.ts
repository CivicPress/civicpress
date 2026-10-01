import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import yaml from 'js-yaml';
import { CentralConfigManager } from '@civicpress/core';
import {
  createAPITestContext,
  cleanupAPITestContext,
  setupGlobalTestEnvironment,
} from '../fixtures/test-setup';

// Setup global test environment
await setupGlobalTestEnvironment();

describe('Record Statuses API Endpoints', () => {
  let context: any;
  let adminToken: string;

  beforeEach(async () => {
    context = await createAPITestContext();

    // Get authentication token for admin
    const adminResponse = await request(context.api.getApp())
      .post('/api/v1/auth/simulated')
      .send({
        username: 'admin',
        role: 'admin',
      });
    adminToken = adminResponse.body.data.session.token;
  });

  afterEach(async () => {
    await cleanupAPITestContext(context);
  });

  describe('GET /api/v1/system/record-statuses', () => {
    it('should return record statuses with correct structure', async () => {
      const response = await request(context.api.getApp())
        .get('/api/v1/system/record-statuses')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('record_statuses');
      expect(response.body.data).toHaveProperty('total');
      expect(Array.isArray(response.body.data.record_statuses)).toBe(true);
      expect(typeof response.body.data.total).toBe('number');
    });

    it('should return all expected default statuses', async () => {
      const response = await request(context.api.getApp())
        .get('/api/v1/system/record-statuses')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const statuses = response.body.data.record_statuses;

      // Check that all expected statuses are present (new standardized format)
      const expectedStatuses = [
        'draft',
        'pending_review',
        'under_review',
        'approved',
        'published',
        'rejected',
        'archived',
        'expired',
      ];
      const actualStatuses = statuses.map((s: any) => s.key);

      expectedStatuses.forEach((expectedStatus) => {
        expect(actualStatuses).toContain(expectedStatus);
      });
    });

    it('should return statuses with correct metadata structure', async () => {
      const response = await request(context.api.getApp())
        .get('/api/v1/system/record-statuses')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const statuses = response.body.data.record_statuses;

      statuses.forEach((status: any) => {
        expect(status).toHaveProperty('key');
        expect(status).toHaveProperty('label');
        expect(status).toHaveProperty('description');
        expect(status).toHaveProperty('color');
        expect(status).toHaveProperty('priority');

        expect(typeof status.key).toBe('string');
        expect(typeof status.label).toBe('string');
        expect(typeof status.description).toBe('string');
        expect(typeof status.color).toBe('string');
        expect(typeof status.priority).toBe('number');
      });
    });

    it('should be accessible without authentication (public endpoint)', async () => {
      const response = await request(context.api.getApp())
        .get('/api/v1/system/record-statuses')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('record_statuses');
    });
  });

  /**
   * Whether the public can see a record in a given status is configuration —
   * the `public` flag the read gate enforces. The endpoint has to serve that
   * answer, or every client ends up keeping its own list of "published"
   * statuses. The editor kept one, and it disagreed with the gate.
   */
  describe('the `public` flag', () => {
    const fetchStatuses = async () => {
      const response = await request(context.api.getApp())
        .get('/api/v1/system/record-statuses')
        .expect(200);
      return response.body.data.record_statuses as Array<{
        key: string;
        public: unknown;
        editable: unknown;
      }>;
    };

    const publicKeys = (statuses: Array<{ key: string; public: unknown }>) =>
      statuses
        .filter((s) => s.public === true)
        .map((s) => s.key)
        .sort();

    /** Edit the instance's own configuration, as an operator would. */
    const configureStatuses = (
      change: (statuses: Record<string, Record<string, unknown>>) => void
    ) => {
      const file = join(
        CentralConfigManager.getDataDir(),
        '.civic',
        'config.yml'
      );
      const config = yaml.load(readFileSync(file, 'utf8')) as {
        record_statuses_config: Record<string, Record<string, unknown>>;
      };
      change(config.record_statuses_config);
      writeFileSync(file, yaml.dump(config));
    };

    it('is a boolean on every status', async () => {
      const statuses = await fetchStatuses();

      expect(statuses.length).toBeGreaterThan(0);
      for (const status of statuses) {
        expect(typeof status.public).toBe('boolean');
      }
    });

    it('marks published, archived and expired public by default', async () => {
      // `approved` is the one to look at: it reads like "in effect", and the
      // editor's list treated it as published. The read gate does not.
      expect(publicKeys(await fetchStatuses())).toEqual([
        'archived',
        'expired',
        'published',
      ]);
    });

    it('is the same answer the read gate uses', async () => {
      expect(publicKeys(await fetchStatuses())).toEqual(
        [...CentralConfigManager.getPublicRecordStatuses()].sort()
      );
    });

    it('follows a status the instance declares public', async () => {
      configureStatuses((statuses) => {
        statuses.in_force = {
          label: 'In force',
          description: 'Adopted and publicly in effect',
          public: true,
        };
      });

      expect(publicKeys(await fetchStatuses())).toContain('in_force');
    });

    it('does not make a new status public by omission', async () => {
      configureStatuses((statuses) => {
        statuses.in_camera = {
          label: 'In camera',
          description: 'Discussed in closed session',
        };
      });

      const statuses = await fetchStatuses();
      expect(statuses.map((s) => s.key)).toContain('in_camera');
      expect(publicKeys(statuses)).not.toContain('in_camera');
    });

    it('follows the instance when it takes a default status out of public view', async () => {
      configureStatuses((statuses) => {
        statuses.archived = { ...statuses.archived, public: false };
      });

      expect(publicKeys(await fetchStatuses())).toEqual([
        'expired',
        'published',
      ]);
    });

    it('derives `editable` from it rather than from a second list', async () => {
      configureStatuses((statuses) => {
        statuses.in_force = {
          label: 'In force',
          description: 'Adopted and publicly in effect',
          public: true,
        };
      });

      for (const status of await fetchStatuses()) {
        expect(status.editable).toBe(!status.public);
      }
    });
  });
});
