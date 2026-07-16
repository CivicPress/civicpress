import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, statSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { AuthUtils } from '../auth-utils.js';

/**
 * Post-audit Tier-C: the CLI login→command loop was broken — resolveToken
 * reads ~/.civicpress/token but login never wrote it. saveToken/clearToken/
 * getResolvedToken are the mechanism that closes that loop.
 */
describe('AuthUtils token persistence', () => {
  let home: string;
  let originalHome: string | undefined;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'civic-home-'));
    originalHome = process.env.HOME;
    process.env.HOME = home;
    delete process.env.CIVIC_TOKEN;
  });

  afterEach(() => {
    if (originalHome) process.env.HOME = originalHome;
    else delete process.env.HOME;
    rmSync(home, { recursive: true, force: true });
  });

  it('saves a token that getResolvedToken then reads back', () => {
    expect(AuthUtils.getResolvedToken()).toBeUndefined();

    const file = AuthUtils.saveToken('sess-abc.def');
    expect(file).toBe(AuthUtils.tokenFilePath());
    expect(existsSync(file)).toBe(true);
    expect(readFileSync(file, 'utf-8')).toBe('sess-abc.def');

    expect(AuthUtils.getResolvedToken()).toBe('sess-abc.def');
  });

  it('writes the token file owner-only (0600)', () => {
    const file = AuthUtils.saveToken('secret');
    // Low 9 permission bits must be rw for owner only.
    expect(statSync(file).mode & 0o777).toBe(0o600);
  });

  it('clearToken removes the persisted token (idempotent)', () => {
    AuthUtils.saveToken('sess-1');
    AuthUtils.clearToken();
    expect(existsSync(AuthUtils.tokenFilePath())).toBe(false);
    expect(AuthUtils.getResolvedToken()).toBeUndefined();
    // Second clear must not throw.
    expect(() => AuthUtils.clearToken()).not.toThrow();
  });

  it('precedence: explicit flag beats env beats file', () => {
    AuthUtils.saveToken('from-file');
    process.env.CIVIC_TOKEN = 'from-env';
    expect(AuthUtils.getResolvedToken('from-flag')).toBe('from-flag');
    expect(AuthUtils.getResolvedToken()).toBe('from-env');
    delete process.env.CIVIC_TOKEN;
    expect(AuthUtils.getResolvedToken()).toBe('from-file');
  });
});
