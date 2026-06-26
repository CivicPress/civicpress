/**
 * startInProcessBroadcastBox — the mount gating decisions, with fakes.
 * (The full services + routes mount is covered by
 * tests/broadcast-box/broadcast-box-mount-e2e.test.ts against a real CivicPress.)
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { CentralConfigManager } from '@civicpress/core';
import { startInProcessBroadcastBox } from '../broadcast-box-bootstrap.js';

const logger = {
  info() {},
  warn() {},
  error() {},
  debug() {},
} as any;

// A CivicPress whose container would throw if touched — so a test that gets
// past the gate (and shouldn't) fails loudly instead of silently mounting.
function fakeCivic(): any {
  return {
    getContainer: () => {
      throw new Error(
        'getContainer called despite the gate rejecting the mount'
      );
    },
  };
}

const fakeApp = {
  use() {
    throw new Error('app.use called despite the gate rejecting the mount');
  },
} as any;

describe('startInProcessBroadcastBox gating', () => {
  afterEach(() => vi.restoreAllMocks());

  it('skips on the env opt-out (enabled:false) without touching core/app', async () => {
    const result = await startInProcessBroadcastBox(
      fakeCivic(),
      fakeApp,
      logger,
      { enabled: false }
    );
    expect(result.started).toBe(false);
  });

  it('skips when broadcast-box is not in config modules:', async () => {
    vi.spyOn(CentralConfigManager, 'getModules').mockReturnValue([
      'legal-register',
    ]);
    const result = await startInProcessBroadcastBox(
      fakeCivic(),
      fakeApp,
      logger,
      { enabled: true }
    );
    expect(result.started).toBe(false);
  });

  it('the returned stop() is always callable (no-op when not started)', async () => {
    const result = await startInProcessBroadcastBox(
      fakeCivic(),
      fakeApp,
      logger,
      { enabled: false }
    );
    expect(() => result.stop()).not.toThrow();
  });
});
