/**
 * ConsoleChannel — the user-facing dev sink + its enablement policy.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readdirSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  ConsoleChannel,
  isConsoleChannelEnabled,
} from '../channels/console-channel.js';

describe('isConsoleChannelEnabled', () => {
  it('is on in development and test, off in production', () => {
    expect(isConsoleChannelEnabled({ NODE_ENV: 'development' })).toBe(true);
    expect(isConsoleChannelEnabled({ NODE_ENV: 'test' })).toBe(true);
    expect(isConsoleChannelEnabled({ NODE_ENV: 'production' })).toBe(false);
  });

  it('treats an unset NODE_ENV as production (fail safe)', () => {
    expect(isConsoleChannelEnabled({})).toBe(false);
  });

  it('honors an explicit opt-in/opt-out override', () => {
    expect(
      isConsoleChannelEnabled({
        NODE_ENV: 'production',
        CIVIC_CONSOLE_NOTIFICATIONS: 'true',
      })
    ).toBe(true);
    expect(
      isConsoleChannelEnabled({
        NODE_ENV: 'development',
        CIVIC_CONSOLE_NOTIFICATIONS: 'false',
      })
    ).toBe(false);
  });
});

describe('ConsoleChannel', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'civic-console-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('reports success and writes the message to the file outbox', async () => {
    const channel = new ConsoleChannel({ outboxDir: dir, echo: false });
    const res = await channel.send({
      to: 'jo@example.org',
      content: { subject: 'Reset your password', body: 'link: https://x/y?token=abc' },
      data: {},
      priority: 'high',
    });

    expect(res.success).toBe(true);

    const files = readdirSync(dir);
    expect(files).toHaveLength(1);
    const contents = readFileSync(join(dir, files[0]), 'utf8');
    expect(contents).toContain('jo@example.org');
    expect(contents).toContain('Reset your password');
    expect(contents).toContain('https://x/y?token=abc');
  });

  it('still succeeds when no outbox dir is configured (console-only)', async () => {
    const channel = new ConsoleChannel({ echo: false });
    const res = await channel.send({
      to: 'nobody@example.org',
      content: { body: 'hello' },
      data: {},
      priority: 'normal',
    });
    expect(res.success).toBe(true);
    expect(res.messageId).toBeTruthy();
  });
});
