import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { CentralConfigManager } from '@civicpress/core';
import {
  createAPITestContext,
  cleanupAPITestContext,
  setupGlobalTestEnvironment,
} from '../fixtures/test-setup';

await setupGlobalTestEnvironment();

/**
 * The raw configuration routes worked out their own paths, and two of the
 * three were relative to the WORKING DIRECTORY:
 *
 *  - `notifications` was read and written under `./.system-data`;
 *  - the shipped defaults were read from `./core/src/defaults`, a directory
 *    that exists in a source checkout and nowhere else.
 *
 * The test suite runs from the repository root, where both happen to resolve.
 * So these tests move somewhere else first — which is what a container does:
 * code in /app, working directory /instance.
 */
describe('raw configuration routes do not depend on the working directory', () => {
  let context: any;
  let admin: string;
  let elsewhere: string;
  const startedIn = process.cwd();

  beforeEach(async () => {
    context = await createAPITestContext();
    admin = (
      await request(context.api.getApp())
        .post('/api/v1/auth/simulated')
        .send({ username: 'admin', role: 'admin' })
    ).body.data.session.token;

    elsewhere = mkdtempSync(join(tmpdir(), 'civic-elsewhere-'));
    process.chdir(elsewhere);
  });

  afterEach(async () => {
    process.chdir(startedIn);
    rmSync(elsewhere, { recursive: true, force: true });
    await cleanupAPITestContext(context);
  });

  const raw = (type: string) =>
    request(context.api.getApp())
      .get(`/api/v1/config/raw/${type}`)
      .set('Authorization', `Bearer ${admin}`);

  const put = (type: string, yaml: string) =>
    request(context.api.getApp())
      .put(`/api/v1/config/raw/${type}`)
      .set('Authorization', `Bearer ${admin}`)
      .set('Content-Type', 'text/yaml')
      .send(yaml);

  it('serves the shipped default for a file the instance has not customised', async () => {
    // No `analytics.yml` in the test instance, so this is the fallback — and
    // from here the old relative path pointed at nothing: 404.
    const response = await raw('analytics');

    expect(response.status).toBe(200);
    expect(response.text.length).toBeGreaterThan(0);
  });

  it("writes notifications into the instance's system data", async () => {
    const yaml = 'channels:\n  email:\n    enabled: false\n';

    const response = await put('notifications', yaml);

    expect(response.status).toBe(200);
    expect(
      readFileSync(
        join(CentralConfigManager.getSystemDataDir(), 'notifications.yml'),
        'utf8'
      )
    ).toBe(yaml);
    // …and not under wherever the process happens to be.
    expect(existsSync(join(elsewhere, '.system-data'))).toBe(false);
  });

  it('reads back what it wrote', async () => {
    const yaml = 'channels:\n  email:\n    enabled: true\n';
    await put('notifications', yaml);

    const response = await raw('notifications');

    expect(response.status).toBe(200);
    expect(response.text).toBe(yaml);
  });

  it('reads the same file the structured route reads', async () => {
    mkdirSync(join(elsewhere, '.system-data'), { recursive: true });
    const yaml = 'channels:\n  email:\n    enabled: true\n    provider: smtp\n';
    await put('notifications', yaml);

    const structured = await request(context.api.getApp())
      .get('/api/v1/config/notifications')
      .set('Authorization', `Bearer ${admin}`);

    expect(structured.status).toBe(200);
    expect(JSON.stringify(structured.body.data)).toContain('smtp');
  });

  it.each(['../../outside', '..', 'roles/../../x', 'roles.yml', ''])(
    'still refuses the type %j',
    async (type) => {
      const response = await raw(encodeURIComponent(type));

      expect([400, 404]).toContain(response.status);
      expect(response.status).not.toBe(200);
    }
  );
});
