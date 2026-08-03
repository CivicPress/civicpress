/**
 * UpdateChecker — version comparison + the update_available producer.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  UpdateChecker,
  isNewerVersion,
  type UpdateNotifierSink,
} from '../update-checker.js';

describe('isNewerVersion', () => {
  it('compares major.minor.patch numerically', () => {
    expect(isNewerVersion('2.0.0', '1.9.9')).toBe(true);
    expect(isNewerVersion('1.5.3', '1.5.2')).toBe(true);
    expect(isNewerVersion('1.5.2', '1.5.3')).toBe(false);
    expect(isNewerVersion('1.5.3', '1.5.3')).toBe(false);
    // Not fooled by lexical comparison (10 > 9).
    expect(isNewerVersion('1.10.0', '1.9.0')).toBe(true);
  });

  it('tolerates a leading v', () => {
    expect(isNewerVersion('v2.0.0', '1.0.0')).toBe(true);
    expect(isNewerVersion('2.0.0', 'v2.0.0')).toBe(false);
  });

  it('treats a release as newer than a pre-release of the same core', () => {
    expect(isNewerVersion('2.0.0', '2.0.0-beta.1')).toBe(true);
    expect(isNewerVersion('2.0.0-beta.1', '2.0.0')).toBe(false);
    expect(isNewerVersion('2.0.0-rc.2', '2.0.0-rc.1')).toBe(true);
  });

  it('is conservative on unparseable input (never nags on garbage)', () => {
    expect(isNewerVersion('not-a-version', '1.0.0')).toBe(false);
    expect(isNewerVersion('2.0.0', 'garbage')).toBe(false);
    expect(isNewerVersion('', '1.0.0')).toBe(false);
  });
});

function fakeNotifier() {
  const calls: Array<{ version: string; current?: string }> = [];
  const sink: UpdateNotifierSink = {
    updateAvailable: vi.fn(async (input) => {
      calls.push(input);
      return 1;
    }),
  };
  return { sink, calls };
}

describe('UpdateChecker.check', () => {
  it('files an update_available notification when a newer version exists', async () => {
    const { sink, calls } = fakeNotifier();
    const checker = new UpdateChecker(sink, async () => '2.0.0');

    const result = await checker.check('1.0.0');

    expect(result).toEqual({
      currentVersion: '1.0.0',
      latestVersion: '2.0.0',
      updateAvailable: true,
    });
    expect(calls).toEqual([{ version: '2.0.0', current: '1.0.0' }]);
  });

  it('does nothing when already up to date', async () => {
    const { sink } = fakeNotifier();
    const checker = new UpdateChecker(sink, async () => '1.0.0');

    const result = await checker.check('1.0.0');

    expect(result.updateAvailable).toBe(false);
    expect(sink.updateAvailable).not.toHaveBeenCalled();
  });

  it('does not downgrade-nag when the running version is ahead', async () => {
    const { sink } = fakeNotifier();
    const checker = new UpdateChecker(sink, async () => '1.0.0');
    const result = await checker.check('1.2.0');
    expect(result.updateAvailable).toBe(false);
    expect(sink.updateAvailable).not.toHaveBeenCalled();
  });

  it('is best-effort: a fetch failure yields null latest, no notification, no throw', async () => {
    const { sink } = fakeNotifier();
    const checker = new UpdateChecker(sink, async () => {
      throw new Error('network down');
    });

    const result = await checker.check('1.0.0');

    expect(result).toEqual({
      currentVersion: '1.0.0',
      latestVersion: null,
      updateAvailable: false,
    });
    expect(sink.updateAvailable).not.toHaveBeenCalled();
  });

  it('treats a null fetch (no releases) as no update', async () => {
    const { sink } = fakeNotifier();
    const checker = new UpdateChecker(sink, async () => null);
    const result = await checker.check('1.0.0');
    expect(result.updateAvailable).toBe(false);
    expect(sink.updateAvailable).not.toHaveBeenCalled();
  });
});
