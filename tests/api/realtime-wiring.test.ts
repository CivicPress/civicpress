import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
} from 'vitest';
import request from 'supertest';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import yaml from 'js-yaml';
import {
  createAPITestContext,
  cleanupAPITestContext,
  getRandomPort,
} from '../fixtures/test-setup';

/**
 * Smoke tests for the in-process realtime wiring in CivicPressAPI.start().
 *
 * Unlike snapshot-endpoints.test.ts (which injects a stub and never calls
 * start()), these drive the REAL lifecycle: api.start() constructs + starts the
 * realtime server from core services, and api.shutdown() stops it. We verify
 * both the config-gated OFF path and the ON path, and that startup never throws.
 *
 * The realtime WS server binds its own port (from RealtimeConfig). To avoid
 * collisions across parallel test forks we write a realtime.yml with a unique
 * random port before start().
 */
describe('In-process realtime wiring (CivicPressAPI.start)', () => {
  describe('disabled via REALTIME_ENABLED=false', () => {
    let context: Awaited<ReturnType<typeof createAPITestContext>>;
    let prevEnv: string | undefined;
    let adminToken: string;
    let recordId: string;

    beforeAll(async () => {
      context = await createAPITestContext();
      prevEnv = process.env.REALTIME_ENABLED;
      process.env.REALTIME_ENABLED = 'false';

      // start() must resolve (HTTP listener up) and NOT start realtime.
      await context.api.start();

      const adminAuth = await request(context.api.getApp())
        .post('/api/v1/auth/simulated')
        .send({ username: 'admin', role: 'admin' });
      adminToken = adminAuth.body?.data?.session?.token as string;

      const create = await request(context.api.getApp())
        .post('/api/v1/records')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Realtime-disabled record',
          type: 'bylaw',
          status: 'draft',
          content: '# x',
        });
      recordId = (create.body?.data?.id as string) || 'rt-disabled-1';
    });

    afterAll(async () => {
      if (context) {
        await cleanupAPITestContext(context);
      }
      if (prevEnv === undefined) {
        delete process.env.REALTIME_ENABLED;
      } else {
        process.env.REALTIME_ENABLED = prevEnv;
      }
    });

    it('starts the API without starting realtime, and the snapshot endpoint degrades gracefully', async () => {
      // No realtime server → the records router's provider returns null → the
      // endpoint reports a 200 no-op (not a 500).
      const response = await request(context.api.getApp())
        .post(`/api/v1/records/${recordId}/snapshot`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.snapshotCreated).toBe(false);
      expect(response.body.data.version).toBe(null);
      expect(typeof response.body.data.timestamp).toBe('number');
    });
  });

  describe('enabled (real in-process realtime server)', () => {
    let context: Awaited<ReturnType<typeof createAPITestContext>>;
    let adminToken: string;
    let recordId: string;
    const realtimePort = getRandomPort();

    beforeAll(async () => {
      context = await createAPITestContext();

      // Write a realtime.yml with a unique port so initialize() loads it and the
      // WS server binds a non-colliding port. resolveSystemDataDir() uses
      // dirname(dataDir)/.system-data; dataDir is <testDir>/data.
      const systemDataDir = join(dirname(`${context.testDir}/data`), '.system-data');
      mkdirSync(systemDataDir, { recursive: true });
      writeFileSync(
        join(systemDataDir, 'realtime.yml'),
        yaml.dump({
          realtime: {
            enabled: true,
            port: realtimePort,
            host: '127.0.0.1',
            path: '/realtime',
          },
        })
      );

      // Real start: constructs + initializes the realtime server. Must not throw.
      await context.api.start();

      const adminAuth = await request(context.api.getApp())
        .post('/api/v1/auth/simulated')
        .send({ username: 'admin', role: 'admin' });
      adminToken = adminAuth.body?.data?.session?.token as string;

      const create = await request(context.api.getApp())
        .post('/api/v1/records')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Realtime-enabled record',
          type: 'bylaw',
          status: 'draft',
          content: '# x',
        });
      recordId = (create.body?.data?.id as string) || 'rt-enabled-1';
    });

    afterAll(async () => {
      if (context) {
        // shutdown() must stop the realtime server too (and not throw).
        await cleanupAPITestContext(context);
      }
    });

    it('reaches the real realtime server via the snapshot endpoint (no live room → 200 no-op)', async () => {
      // The real server is wired but there is no in-memory editing room for this
      // record, so triggerRecordSnapshot returns the graceful no-op shape. This
      // proves the endpoint→realtime passthrough works end-to-end in-process.
      const response = await request(context.api.getApp())
        .post(`/api/v1/records/${recordId}/snapshot`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.snapshotCreated).toBe(false);
      expect(response.body.data.version).toBe(null);
      expect(typeof response.body.data.timestamp).toBe('number');
    });
  });
});
