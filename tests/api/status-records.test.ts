import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { CentralConfigManager } from '@civicpress/core';
import {
  createAPITestContext,
  cleanupAPITestContext,
  setupGlobalTestEnvironment,
} from '../fixtures/test-setup';

await setupGlobalTestEnvironment();

/**
 * GET /api/v1/status/records counts the records on disk, by type and by
 * status. The by-status half looked for every file one directory too high —
 * it joined the data directory to the path with its `records/` prefix removed
 * — found none of them, and has always answered `{}`.
 */
describe('GET /api/v1/status/records', () => {
  let context: any;
  let admin: string;

  beforeEach(async () => {
    context = await createAPITestContext();
    admin = (
      await request(context.api.getApp())
        .post('/api/v1/auth/simulated')
        .send({ username: 'admin', role: 'admin' })
    ).body.data.session.token;
  });

  afterEach(async () => {
    await cleanupAPITestContext(context);
  });

  const records = () =>
    request(context.api.getApp())
      .get('/api/v1/status/records')
      .set('Authorization', `Bearer ${admin}`);

  const plant = (type: string, name: string, frontmatter: string[]) => {
    const dir = join(CentralConfigManager.getDataDir(), 'records', type);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, `${name}.md`),
      ['---', ...frontmatter, '---', '', `# ${name}`, ''].join('\n')
    );
  };

  it('counts records by status', async () => {
    // The fixture has two bylaws, both archived.
    const response = await records();

    expect(response.status).toBe(200);
    const stats = response.body.data.records ?? response.body.data;
    expect(stats.totalRecords).toBeGreaterThanOrEqual(2);
    expect(stats.byStatus.archived).toBeGreaterThanOrEqual(2);
    const counted = Object.values<number>(stats.byStatus).reduce(
      (sum, n) => sum + n,
      0
    );
    expect(counted).toBe(stats.totalRecords);
  });

  it("reads the record's own status, not the first thing that looks like one", async () => {
    // A recorded session carries `redaction_status:` before `status:`, and
    // the old pattern took the first `status:` it found anywhere in the file.
    plant('session', 'council-2026-01', [
      'id: council-2026-01',
      'title: Council meeting',
      'type: session',
      'capture:',
      '  redaction_status: pending',
      'status: published',
      'author: clerk',
      "created: '2026-01-01T00:00:00Z'",
      "updated: '2026-01-01T00:00:00Z'",
    ]);

    const stats =
      (await records()).body.data.records ?? (await records()).body.data;

    expect(stats.byStatus.published).toBe(1);
    expect(stats.byStatus.pending).toBeUndefined();
  });

  it('counts a record it cannot parse as unknown, and carries on', async () => {
    plant('bylaw', 'broken', ['title: [unclosed']);

    const response = await records();

    expect(response.status).toBe(200);
    const stats = response.body.data.records ?? response.body.data;
    expect(stats.byType.bylaw.count).toBeGreaterThanOrEqual(3);
  });
});
