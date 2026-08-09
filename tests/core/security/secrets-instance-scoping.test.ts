import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { SecretsManager } from '@civicpress/core';

/**
 * A signing secret belongs to one instance, and must never be written outside
 * the lifecycle of a live one.
 *
 * `SecretsManager` is a process-wide singleton that used to compute
 * `secretsFilePath` once, in the constructor, from the FIRST caller's `dataDir`
 * — every later `getInstance(otherDataDir)` silently returned a manager still
 * aimed at the first location. Harmless for a server serving a single instance;
 * destructive for any process that moves between them, which is exactly what
 * the test suite does.
 *
 * Concretely: API test 1 builds a temp instance and deletes it on teardown.
 * Test 2 calls `getInstance(test2Dir)`, gets the manager still pointed at
 * test 1, fails to read a secret there (that tree is gone), generates a new one,
 * and `generateAndSaveSecret`'s `mkdir(recursive)` RE-CREATES test 1's deleted
 * directory to hold it. 1186 stray `/tmp/api-test-*` directories had piled up
 * since 2026-07-20, each containing nothing but `.system-data/secrets.yml`.
 */
describe('SecretsManager is scoped to the current instance', () => {
  const roots: string[] = [];

  function newRoot(prefix: string): { root: string; dataDir: string } {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    roots.push(root);
    const dataDir = path.join(root, 'data');
    fs.mkdirSync(dataDir, { recursive: true });
    return { root, dataDir };
  }

  beforeEach(() => {
    SecretsManager.resetInstance();
    delete process.env.CIVICPRESS_SECRET;
  });

  afterEach(() => {
    for (const root of roots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
    SecretsManager.resetInstance();
    delete process.env.CIVICPRESS_SECRET;
  });

  test('does not resurrect a torn-down instance directory', async () => {
    // Instance A: generate and persist a secret, then tear the whole tree down
    // the way cleanupAPITestContext does.
    const a = newRoot('civic-secrets-a-');
    await SecretsManager.getInstance(a.dataDir).initialize();
    expect(
      fs.existsSync(path.join(a.root, '.system-data', 'secrets.yml'))
    ).toBe(true);
    fs.rmSync(a.root, { recursive: true, force: true });
    expect(fs.existsSync(a.root)).toBe(false);

    // Instance B, in the same process. This must not touch A at all.
    const b = newRoot('civic-secrets-b-');
    await SecretsManager.getInstance(b.dataDir).initialize();

    expect(
      fs.existsSync(path.join(b.root, '.system-data', 'secrets.yml'))
    ).toBe(true);
    expect(fs.existsSync(a.root)).toBe(false); // ← the bug: A came back
  });

  test('writes inside the instance, never beside it', async () => {
    // The old test-side mistake was passing a bare temp dir as `dataDir`, which
    // makes `dirname(dataDir)` the SHARED os tmpdir — so the secret landed in
    // `<tmp>/.system-data/secrets.yml`, outside anything a test cleans up.
    const { root, dataDir } = newRoot('civic-secrets-scope-');
    await SecretsManager.getInstance(dataDir).initialize();

    expect(fs.existsSync(path.join(root, '.system-data', 'secrets.yml'))).toBe(
      true
    );
    const shared = path.join(path.dirname(root), '.system-data', 'secrets.yml');
    const sharedBefore = fs.existsSync(shared);
    // Re-initializing must not start writing to the shared parent.
    await SecretsManager.getInstance(dataDir).initialize();
    expect(fs.existsSync(shared)).toBe(sharedBefore);
  });

  test('does not carry one instance’s secret into the next', async () => {
    const a = newRoot('civic-secrets-keys-a-');
    const managerA = SecretsManager.getInstance(a.dataDir);
    await managerA.initialize();
    const keyA = managerA.getSessionSigningKey().toString('hex');

    const b = newRoot('civic-secrets-keys-b-');
    const managerB = SecretsManager.getInstance(b.dataDir);
    await managerB.initialize();
    const keyB = managerB.getSessionSigningKey().toString('hex');

    // Two independently generated root secrets must not derive the same key —
    // otherwise instance B is signing sessions with instance A's material.
    expect(keyB).not.toBe(keyA);
  });

  test('re-reads the secret already on disk when it returns to an instance', async () => {
    const a = newRoot('civic-secrets-return-a-');
    const first = SecretsManager.getInstance(a.dataDir);
    await first.initialize();
    const keyBefore = first.getSessionSigningKey().toString('hex');

    // Move away, then come back. A's secrets.yml is untouched on disk, so the
    // same key must come back — re-pointing drops the cache, it must not mint a
    // new secret over a perfectly good one.
    const b = newRoot('civic-secrets-return-b-');
    await SecretsManager.getInstance(b.dataDir).initialize();

    const back = SecretsManager.getInstance(a.dataDir);
    await back.initialize();
    expect(back.getSessionSigningKey().toString('hex')).toBe(keyBefore);
  });
});
