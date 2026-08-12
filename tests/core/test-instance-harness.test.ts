import { describe, it, expect, afterEach } from 'vitest';
import { existsSync } from 'fs';
import { join } from 'path';
import { CentralConfigManager } from '@civicpress/core';
import {
  createTestInstance,
  type TestInstance,
} from '../fixtures/test-instance.js';

/**
 * The point of the hermetic harness: a test instance is FOUND because it was
 * installed, not because the process happened to be sitting in its directory.
 * These pin that property — if config resolution ever goes back to consulting
 * cwd, the first test here fails.
 */
describe('createTestInstance', () => {
  let instance: TestInstance | null = null;

  afterEach(() => {
    instance?.cleanup();
    instance = null;
  });

  it('is discovered without any chdir', () => {
    const cwdBefore = process.cwd();
    instance = createTestInstance({ prefix: 'hermetic' });

    // Still in the repo — the instance is elsewhere entirely.
    expect(process.cwd()).toBe(cwdBefore);
    expect(instance.root.startsWith(cwdBefore)).toBe(false);

    expect(CentralConfigManager.getProjectRoot()).toBe(instance.root);
    expect(CentralConfigManager.getDataDir()).toBe(instance.dataDir);
  });

  it('anchors .system-data inside the instance, not the repo', () => {
    instance = createTestInstance();

    expect(CentralConfigManager.getSystemDataDir()).toBe(
      join(instance.root, '.system-data')
    );
    expect(instance.context.systemDataDir).toBe(
      CentralConfigManager.getSystemDataDir()
    );
  });

  it('points the database at the instance, not the repo-root civic.db', () => {
    instance = createTestInstance();

    const db = CentralConfigManager.getDatabaseConfig();
    expect(db?.sqlite?.file).toBe(instance.dbFile);
  });

  it('writes the expected instance layout', () => {
    instance = createTestInstance();

    expect(existsSync(join(instance.root, '.civicrc'))).toBe(true);
    expect(existsSync(join(instance.dataDir, '.civic', 'config.yml'))).toBe(
      true
    );
    expect(existsSync(join(instance.dataDir, '.git'))).toBe(true);
  });

  it('gives consecutive instances separate roots and no shared state', () => {
    const first = createTestInstance();
    const firstRoot = CentralConfigManager.getProjectRoot();
    first.cleanup();

    instance = createTestInstance();

    expect(instance.root).not.toBe(first.root);
    expect(CentralConfigManager.getProjectRoot()).toBe(instance.root);
    expect(CentralConfigManager.getProjectRoot()).not.toBe(firstRoot);
  });

  it('removes the whole tree on cleanup', () => {
    const temp = createTestInstance();
    const root = temp.root;
    expect(existsSync(root)).toBe(true);

    temp.cleanup();

    expect(existsSync(root)).toBe(false);
  });

  it('honors .civicrc overrides', () => {
    instance = createTestInstance({ civicrc: { default_role: 'clerk' } });

    expect(CentralConfigManager.getConfig().default_role).toBe('clerk');
  });
});
