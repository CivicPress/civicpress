/**
 * Hermetic test instance.
 *
 * One factory that stands up a complete, isolated CivicPress instance in a
 * temp directory and tells the process where it is — rather than the ~10
 * `create*` helpers each assembling a partial fixture and then relying on
 * ambient state to be discovered.
 *
 * The thing that makes it hermetic is `setInstanceContext`. Config resolution
 * used to find an instance by walking up from `process.cwd()`, so a fixture had
 * to `process.chdir()` into its own directory (and remember to chdir back) just
 * to be seen — which is shared global state, order-dependent, and the reason
 * tests leaked into each other and into the repo's own `.system-data`. Here the
 * root is INSTALLED, so nothing depends on the working directory.
 *
 * `createTestInstance()` and `resolveInstanceContext()` are the same
 * abstraction: one builds a root and declares it, the other discovers one.
 */

import { execSync } from 'child_process';
import { existsSync, mkdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  CentralConfigManager,
  resolveInstanceContext,
  setInstanceContext,
  type InstanceContext,
} from '@civicpress/core';
import {
  createCivicConfig,
  createOrgConfig,
  createRolesConfig,
  createSampleRecords,
  createStorageConfig,
  createWorkflowConfig,
  type TestConfig,
} from './test-setup.js';

export interface TestInstance {
  /** The instance root — the directory holding `.civicrc`. */
  root: string;
  dataDir: string;
  systemDataDir: string;
  recordsDir: string;
  /** The SQLite file this instance's config points at. */
  dbFile: string;
  /** The installed, fully-resolved layout. */
  context: InstanceContext;
  /** The shape the older `create*` helpers expect, for incremental migration. */
  config: TestConfig;
  cleanup(): void;
}

export interface CreateTestInstanceOptions {
  /** Temp-directory name prefix, to make failures easier to attribute. */
  prefix?: string;
  /** Extra `.civicrc` fields, merged over the defaults. */
  civicrc?: Record<string, unknown>;
  /** Write `storage.yml` (absolute, inside the instance). Default true. */
  storage?: boolean;
  /** Write `org-config.yml`. Default true. */
  org?: boolean;
  /** Write `workflows.yml`. Default true. */
  workflows?: boolean;
  /** Write `roles.yml`. Default true. */
  roles?: boolean;
  /** Seed the standard sample records. Default false. */
  records?: boolean;
  /** `git init` the root and the data dir. Default true. */
  git?: boolean;
}

/**
 * Build an isolated instance and make it the process's current one.
 *
 * Deliberately does NOT chdir and does NOT touch `process.env.NODE_ENV` — the
 * two ambient levers the older fixtures pulled. Everything it needs to be found
 * is carried by the installed context.
 */
export function createTestInstance(
  options: CreateTestInstanceOptions = {}
): TestInstance {
  const {
    prefix = 'civic-instance',
    civicrc,
    storage = true,
    org = true,
    workflows = true,
    roles = true,
    records = false,
    git = true,
  } = options;

  const root = join(
    tmpdir(),
    `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 11)}-${process.pid}`
  );
  const dataDir = join(root, 'data');
  const civicDir = join(dataDir, '.civic');
  const recordsDir = join(dataDir, 'records');

  for (const dir of [root, dataDir, civicDir, recordsDir]) {
    mkdirSync(dir, { recursive: true });
  }

  // The older helpers all take this shape; reuse them rather than duplicating
  // the record-type / status / role config blobs.
  const config: TestConfig = {
    testDir: root,
    dataDir,
    civicDir,
    recordsDir,
    originalCwd: process.cwd(),
    cleanupOnExit: true,
  };

  createCivicConfig(config, civicrc ?? {});
  if (workflows) createWorkflowConfig(config);
  if (roles) createRolesConfig(config);
  if (storage) createStorageConfig(config);
  if (org) createOrgConfig(config);
  if (records) createSampleRecords(config);

  if (git) {
    // The saga's git step commits records into whatever repo contains dataDir.
    // Both roots get their own repo so a test can never commit into THIS one.
    for (const dir of [root, dataDir]) {
      try {
        execSync('git init', { cwd: dir, stdio: 'ignore' });
      } catch {
        // git unavailable — tests that need commits will surface it themselves.
      }
    }
  }

  // Drop any config a previous test (or the repo root) resolved, then declare
  // THIS instance. Order matters: reset() also clears the memoized context.
  CentralConfigManager.reset();
  const context = setInstanceContext(resolveInstanceContext({ root }));

  return {
    root,
    dataDir,
    systemDataDir: context.systemDataDir,
    recordsDir,
    dbFile: join(root, 'test.db'),
    context,
    config,
    cleanup() {
      CentralConfigManager.reset();
      if (existsSync(root)) {
        rmSync(root, { recursive: true, force: true });
      }
    },
  };
}
