import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import {
  createAPITestContext,
  cleanupAPITestContext,
} from '../fixtures/test-setup';

/**
 * Endpoint tests for POST /api/v1/records/:id/snapshot (W5-T3/T4).
 *
 * These exercise the in-process seam at the ROUTER level: routing + auth +
 * records:edit permission + passthrough to the injected RealtimeServerLike.
 * The real WS server is never started (the API test harness calls initialize()
 * but not start()); instead we inject a stub via setRealtimeServerForTesting()
 * so the endpoint's call into the realtime layer is deterministic.
 *
 * Auth note: the records router is mounted behind csrfMiddleware, so an
 * unauthenticated POST is rejected with 403 (CSRF_TOKEN_MISSING) BEFORE the
 * route's auth middleware runs — we assert 403 for the no-auth case (matching
 * lock-endpoints.test.ts), not 401.
 */
describe('Snapshot Endpoint - POST /api/v1/records/:id/snapshot', () => {
  let context: Awaited<ReturnType<typeof createAPITestContext>>;
  let adminToken: string;
  let publicToken: string;
  let testRecordId: string;

  // Records the id passed to the stub so we can assert passthrough.
  let lastSnapshotId: string | null = null;
  // The shape the stub returns for the next call (mutated per-test).
  let stubResult: {
    snapshotCreated: boolean;
    version: number | null;
    timestamp: number;
  };

  beforeAll(async () => {
    context = await createAPITestContext();

    // Inject a RealtimeServerLike stub so routing+auth+passthrough are testable
    // without a live WS server.
    context.api.setRealtimeServerForTesting({
      triggerRecordSnapshot: async (recordId: string) => {
        lastSnapshotId = recordId;
        return stubResult;
      },
    });

    // Admin user (has records:edit) and public user (does NOT).
    const adminAuth = await request(context.api.getApp())
      .post('/api/v1/auth/simulated')
      .send({ username: 'admin', role: 'admin' });
    adminToken = adminAuth.body?.data?.session?.token as string;

    const publicAuth = await request(context.api.getApp())
      .post('/api/v1/auth/simulated')
      .send({ username: 'public', role: 'public' });
    publicToken = publicAuth.body?.data?.session?.token as string;

    // Create a record to snapshot.
    const createResponse = await request(context.api.getApp())
      .post('/api/v1/records')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Test Record for Snapshot',
        type: 'bylaw',
        status: 'draft',
        content: '# Test Record\n\nContent for testing snapshots.',
      });

    testRecordId =
      (createResponse.body?.data?.id as string) || 'test-snapshot-record-1';
  });

  afterAll(async () => {
    if (context) {
      await cleanupAPITestContext(context);
    }
  });

  beforeEach(() => {
    lastSnapshotId = null;
    stubResult = {
      snapshotCreated: true,
      version: 3,
      timestamp: 1234567890,
    };
  });

  it('returns 200 and the snapshot result, calling triggerRecordSnapshot with the id', async () => {
    const response = await request(context.api.getApp())
      .post(`/api/v1/records/${testRecordId}/snapshot`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.snapshotCreated).toBe(true);
    expect(response.body.data.version).toBe(3);
    expect(response.body.data.timestamp).toBe(1234567890);
    // Passthrough: the endpoint forwarded the :id to the realtime layer.
    expect(lastSnapshotId).toBe(testRecordId);
  });

  it('requires authentication (403 via CSRF before auth middleware)', async () => {
    const response = await request(context.api.getApp()).post(
      `/api/v1/records/${testRecordId}/snapshot`
    );

    expect(response.status).toBe(403); // CSRF middleware returns 403 before auth middleware
    // The stub must not have been reached.
    expect(lastSnapshotId).toBe(null);
  });

  it('requires records:edit permission (403 for public role)', async () => {
    const response = await request(context.api.getApp())
      .post(`/api/v1/records/${testRecordId}/snapshot`)
      .set('Authorization', `Bearer ${publicToken}`);

    expect(response.status).toBe(403);
    // Permission denied before the realtime layer is reached.
    expect(lastSnapshotId).toBe(null);
  });

  it('passes through snapshotCreated:false (no active room) as a 200 no-op', async () => {
    stubResult = { snapshotCreated: false, version: null, timestamp: 999 };

    const response = await request(context.api.getApp())
      .post(`/api/v1/records/${testRecordId}/snapshot`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.snapshotCreated).toBe(false);
    expect(response.body.data.version).toBe(null);
    expect(response.body.data.timestamp).toBe(999);
    expect(lastSnapshotId).toBe(testRecordId);
  });
});
