import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
// Everything comes from the built barrel, NOT from core/src: `createTestInstance`
// installs the context through `@civicpress/core` (aliased to core/dist), and
// importing the logger from src would give it a SECOND copy of
// instance-context with its own memoized context — the test would then pass or
// fail for reasons unrelated to the behavior it claims to pin.
import {
  AuditLogger,
  resolveInstanceContext,
  setInstanceContext,
  resetInstanceContext,
} from '@civicpress/core';
import { createTestInstance } from '../../fixtures/test-instance.js';

/**
 * The audit trail must land in the instance, not in whatever directory the
 * process was started from.
 *
 * `AuditLogger` used to default to the RELATIVE `'.system-data'` and join it in
 * the constructor, so the destination was `<cwd>/.system-data/activity.log`.
 * Five API route modules construct one at module scope, before any instance
 * context exists, so their path was decided by the launch directory: the
 * transparency trail for records/users/config/notifications was written outside
 * the instance whenever the server was started from anywhere but its own root.
 * A full test run proved it live — 2204 entries landed in the repository's own
 * `.system-data/activity.log`, one of them describing a file under
 * `/tmp/api-test-…`.
 */
describe('AuditLogger writes into the instance, not the working directory', () => {
  const instances: Array<{ cleanup(): void }> = [];

  function newInstance(prefix: string) {
    const instance = createTestInstance({ prefix, git: false });
    instances.push(instance);
    return instance;
  }

  afterEach(() => {
    while (instances.length) instances.pop()!.cleanup();
    resetInstanceContext();
  });

  it('defaults to <systemDataDir>/activity.log, never <cwd>/.system-data', async () => {
    const instance = newInstance('audit-loc');

    const logger = new AuditLogger();
    await logger.log({
      source: 'core',
      action: 'test:event',
      outcome: 'success',
    });

    const expected = path.join(instance.systemDataDir, 'activity.log');
    expect(fs.existsSync(expected)).toBe(true);
    expect(fs.readFileSync(expected, 'utf8')).toContain('test:event');

    // The old behavior: a path built from the working directory. cwd here is
    // the repo checkout, which must stay clean.
    const cwdPath = path.join(process.cwd(), '.system-data', 'activity.log');
    if (fs.existsSync(cwdPath)) {
      expect(fs.readFileSync(cwdPath, 'utf8')).not.toContain('test:event');
    }
  });

  it('follows the instance installed AFTER it was constructed', async () => {
    // The module-scope case: `new AuditLogger()` runs at import time, long
    // before the server installs a context. An eagerly-resolved path could
    // never be right for those five route modules.
    const logger = new AuditLogger();

    const first = newInstance('audit-first');
    await logger.log({
      source: 'api',
      action: 'first:event',
      outcome: 'success',
    });

    const second = newInstance('audit-second');
    await logger.log({
      source: 'api',
      action: 'second:event',
      outcome: 'success',
    });

    const firstLog = path.join(first.systemDataDir, 'activity.log');
    const secondLog = path.join(second.systemDataDir, 'activity.log');

    expect(fs.readFileSync(firstLog, 'utf8')).toContain('first:event');
    expect(fs.readFileSync(firstLog, 'utf8')).not.toContain('second:event');
    expect(fs.readFileSync(secondLog, 'utf8')).toContain('second:event');
    expect(fs.readFileSync(secondLog, 'utf8')).not.toContain('first:event');
  });

  it('still honours an explicit directory', async () => {
    const instance = newInstance('audit-explicit');
    const explicit = path.join(instance.root, 'elsewhere');

    const logger = new AuditLogger({ dir: explicit });
    await logger.log({
      source: 'cli',
      action: 'explicit:event',
      outcome: 'success',
    });

    expect(
      fs.readFileSync(path.join(explicit, 'activity.log'), 'utf8')
    ).toContain('explicit:event');
    expect(
      fs.existsSync(path.join(instance.systemDataDir, 'activity.log'))
    ).toBe(false);
  });

  it('reads back what it wrote, so the API audit route and the writer agree', async () => {
    const instance = newInstance('audit-roundtrip');
    setInstanceContext(resolveInstanceContext({ root: instance.root }));

    const writer = new AuditLogger();
    await writer.log({
      source: 'api',
      action: 'records:create',
      outcome: 'success',
    });

    // A separate instance, as the read path (routes/audit.ts) builds its own.
    const reader = new AuditLogger();
    const entries = await reader.tail(10);
    expect(entries.map((e) => e.action)).toContain('records:create');
  });
});
