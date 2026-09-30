import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import {
  createAPITestContext,
  cleanupAPITestContext,
  type APITestContext,
} from '../fixtures/test-setup';

/**
 * The review chain a new instance is born with — walked on the SHIPPED
 * `workflows.yml`, `roles.yml` and `config.yml`, not the fixture's copies.
 *
 * Measured on 2026-09-30 before the fix: a draft saved as `proposed` was
 * accepted, publishing it answered 500 (`/status must be one of: draft,
 * pending_review, …` — the workflow's vocabulary was not the schema's),
 * publishing straight to `approved` was refused ("Allowed transitions:
 * proposed"), and `published` was reachable only around the chain. Nothing in
 * the suite could have seen it: the fixture wrote `workflow.yml` (singular), so
 * the API ran on an inline default that did not even know the admin role.
 */
describe('the shipped review chain', () => {
  let context: APITestContext;
  let adminToken: string;
  let clerkToken: string;

  const app = () => context.api.getApp();

  async function token(username: string, role: string) {
    const res = await request(app())
      .post('/api/v1/auth/simulated')
      .send({ username, role });
    expect(res.status).toBe(200);
    return res.body.data.session.token as string;
  }

  async function createDraft(t: string, title: string) {
    const res = await request(app())
      .post('/api/v1/records')
      .set('Authorization', `Bearer ${t}`)
      .send({ type: 'policy', title, content: `# ${title}` });
    expect(res.status).toBe(201);
    return res.body.data.id as string;
  }

  async function publishAs(t: string, id: string, status: string) {
    return request(app())
      .post(`/api/v1/records/${id}/publish`)
      .set('Authorization', `Bearer ${t}`)
      .send({ status });
  }

  async function moveTo(t: string, id: string, status: string) {
    return request(app())
      .post(`/api/v1/records/${id}/status`)
      .set('Authorization', `Bearer ${t}`)
      .send({ status });
  }

  async function anonymousStatus(id: string) {
    return (await request(app()).get(`/api/v1/records/${id}`)).status;
  }

  beforeAll(async () => {
    context = await createAPITestContext({ shippedDefaults: true });
    adminToken = await token('shipped-admin', 'admin');
    clerkToken = await token('shipped-clerk', 'clerk');
  });

  afterAll(async () => {
    await cleanupAPITestContext(context);
  });

  it('proposed and reviewed are record statuses, and neither is public', async () => {
    const res = await request(app()).get('/api/v1/system/record-statuses');
    expect(res.status).toBe(200);
    const byKey = Object.fromEntries(
      (res.body.data.record_statuses as Array<{ key: string }>).map((s) => [
        s.key,
        s,
      ])
    );
    expect(byKey.proposed).toBeDefined();
    expect(byKey.reviewed).toBeDefined();
    // Sorted by priority, the chain reads in order.
    const keys = (
      res.body.data.record_statuses as Array<{ key: string; priority: number }>
    )
      .slice()
      .sort((a, b) => a.priority - b.priority)
      .map((s) => s.key);
    expect(keys.indexOf('proposed')).toBeGreaterThan(keys.indexOf('draft'));
    expect(keys.indexOf('proposed')).toBeLessThan(
      keys.indexOf('pending_review')
    );
    expect(keys.indexOf('reviewed')).toBeLessThan(keys.indexOf('approved'));
  });

  it('an admin walks draft → proposed → reviewed → approved → published, and only the end is public', async () => {
    const id = await createDraft(adminToken, 'Walk the chain');

    // A draft that was never published still offers its transitions.
    const offered = await request(app())
      .get(`/api/v1/records/${id}/transitions`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(offered.status).toBe(200);
    const targets: string[] =
      offered.body?.data?.transitions ?? offered.body?.data ?? [];
    expect(targets).toContain('proposed');

    const proposed = await publishAs(adminToken, id, 'proposed');
    expect([200, 201]).toContain(proposed.status);
    expect(await anonymousStatus(id)).toBe(404);

    for (const next of ['reviewed', 'approved']) {
      const res = await moveTo(adminToken, id, next);
      expect(res.status, `${next}: ${JSON.stringify(res.body)}`).toBe(200);
      expect(await anonymousStatus(id)).toBe(404);
    }

    const published = await moveTo(adminToken, id, 'published');
    expect(published.status).toBe(200);
    expect(await anonymousStatus(id)).toBe(200);

    const archived = await moveTo(adminToken, id, 'archived');
    expect(archived.status).toBe(200);
  });

  it('a clerk can propose but not approve, and can still publish a draft directly', async () => {
    const id = await createDraft(clerkToken, 'Clerk proposes');
    const proposed = await publishAs(clerkToken, id, 'proposed');
    expect([200, 201]).toContain(proposed.status);

    // POST /:id/status reports a refused transition as 400
    // STATUS_CHANGE_FAILED with the reason in details (the other write paths
    // say 403 INVALID_STATUS_TRANSITION — a pre-existing inconsistency, not
    // this change's). What matters here: refused, and refused for the role.
    for (const next of ['reviewed', 'approved']) {
      const res = await moveTo(clerkToken, id, next);
      expect(res.status, next).toBe(400);
      expect(res.body.error?.code).toBe('STATUS_CHANGE_FAILED');
      expect(String(res.body.error?.details?.reason)).toMatch(
        /clerk|not allowed/i
      );
    }

    const direct = await createDraft(clerkToken, 'Clerk publishes directly');
    const published = await publishAs(clerkToken, direct, 'published');
    expect([200, 201]).toContain(published.status);
    expect(await anonymousStatus(direct)).toBe(200);
  });

  it('nobody skips to approved from a draft', async () => {
    for (const t of [adminToken, clerkToken]) {
      const id = await createDraft(t, 'Skip attempt');
      const res = await publishAs(t, id, 'approved');
      expect(res.status).toBe(403);
    }
  });
});
