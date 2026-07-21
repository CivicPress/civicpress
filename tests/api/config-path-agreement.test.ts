import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import {
  createAPITestContext,
  cleanupAPITestContext,
  setupGlobalTestEnvironment,
} from '../fixtures/test-setup';

await setupGlobalTestEnvironment();

/**
 * The config router reaches the same files by two routes: `resolveRawPaths()`
 * asks CentralConfigManager for the data directory, while the parsed endpoints
 * go through ConfigurationService.
 *
 * Those used to disagree. ConfigurationService was consumed as a module-level
 * singleton, constructed at import time with the constructor default
 * `dataPath: 'data/.civic'` — relative to whatever the process cwd happened to
 * be — so as soon as the data directory was not `./data` the two endpoints read
 * DIFFERENT FILES. With `CIVIC_DATA_DIR=/var/civic/data` (the documented Docker
 * path) `/config/attachment-types` served whatever sat under the cwd while
 * `/config/raw/attachment-types` served the deployment's real config.
 *
 * The test harness gives each test its own temp data directory, which is
 * exactly the condition that separated them.
 */
describe('Config API — both endpoints resolve the same file', () => {
  let context: any;
  let adminToken: string;

  beforeEach(async () => {
    context = await createAPITestContext();
    const adminResponse = await request(context.api.getApp())
      .post('/api/v1/auth/simulated')
      .send({ username: 'admin', role: 'admin' });
    adminToken = adminResponse.body.data.session.token;
  });

  afterEach(async () => {
    await cleanupAPITestContext(context);
  });

  // Written and read back THROUGH THE SERVER, so the test never has to guess
  // where the data directory is — which is the whole point, since the two
  // resolutions disagreeing is the bug. The write goes through
  // ConfigurationService and the read through resolveRawPaths, so the sentinel
  // only survives the round trip if both land on the same file.
  it('a config written through ConfigurationService is found by resolveRawPaths', async () => {
    const save = await request(context.api.getApp())
      .put('/api/v1/config/attachment-types')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        types: [{ name: 'sentinel-round-trip', extensions: ['.sentinel'] }],
      });
    expect(save.status).toBe(200);

    const raw = await request(context.api.getApp())
      .get('/api/v1/config/raw/attachment-types')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(raw.status).toBe(200);
    // The raw endpoint answers with YAML text, not JSON — hence `.text`.
    // Before the fix this returned the packaged DEFAULT config: the write had
    // gone to `./data/.civic` relative to the cwd while the read looked under
    // the resolved data dir, so the two never met.
    expect(raw.text).toContain('sentinel-round-trip');

    // And the parsed endpoint agrees with both.
    const parsed = await request(context.api.getApp()).get(
      '/api/v1/config/attachment-types'
    );
    expect(parsed.status).toBe(200);
    expect(JSON.stringify(parsed.body)).toContain('sentinel-round-trip');
  });
});
