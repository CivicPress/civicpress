import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { AuditLogger } from '../../../core/src/audit/audit-logger.js';

// FA-CORE-004: an audit write that fails (full/racing disk, permissions) must
// be observable — counted and, for strict deployments, fatal — not a silent
// gap in the trust/transparency trail.
describe('AuditLogger write-failure accounting (FA-CORE-004)', () => {
  function makeUnwritableDir(): string {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'civic-audit-fail-'));
    // A file where a directory is expected makes mkdir/append throw.
    const collision = path.join(base, 'blocker');
    fs.writeFileSync(collision, 'x');
    return path.join(collision, 'nested'); // dataDir under a file → EEXIST/ENOTDIR
  }

  it('counts dropped writes without throwing by default', async () => {
    const logger = new AuditLogger({ dataDir: makeUnwritableDir() });
    expect(logger.getWriteFailureCount()).toBe(0);

    await logger.log({ source: 'core', action: 'test:event', outcome: 'success' });
    await logger.log({ source: 'core', action: 'test:event2', outcome: 'success' });

    expect(logger.getWriteFailureCount()).toBe(2);
  });

  it('rethrows on write failure when failFast is set', async () => {
    const logger = new AuditLogger({
      dataDir: makeUnwritableDir(),
      failFast: true,
    });

    await expect(
      logger.log({ source: 'core', action: 'test:event', outcome: 'success' })
    ).rejects.toThrow();
    expect(logger.getWriteFailureCount()).toBe(1);
  });

  it('records nothing failed on a healthy path', async () => {
    const okDir = fs.mkdtempSync(path.join(os.tmpdir(), 'civic-audit-ok-'));
    const logger = new AuditLogger({ dataDir: okDir });
    await logger.log({ source: 'core', action: 'test:event', outcome: 'success' });
    expect(logger.getWriteFailureCount()).toBe(0);
  });
});
