/**
 * Password reset (forgot-password) token flow — PasswordOps against a real
 * SQLite DatabaseService. Covers eligibility, mint→reset happy path,
 * single-use, TTL, policy-before-consume, session revocation and the
 * OAuth-ineligible guard.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import bcrypt from 'bcrypt';
import { DatabaseService } from '../../database/database-service.js';
import { PasswordOps } from '../auth-service/password-ops.js';
import { hashToken } from '../auth-service/crypto.js';
import type { AuthUser } from '../auth-service.js';

function makeOps(db: DatabaseService) {
  const deleted: number[] = [];
  const ops = new PasswordOps({
    db,
    writeAudit: async () => {},
    // Not used by the reset paths under test.
    emailValidationService: {} as never,
    logAuthEvent: async () => {},
    createSession: async () => ({ token: 't', session: {} as never }),
    deleteUserSessions: async (userId: number) => {
      deleted.push(userId);
      await db.deleteUserSessions(userId);
    },
    // Mirror AuthService.canSetPassword / getUserAuthProvider exactly.
    canSetPassword: (u: Pick<AuthUser, 'auth_provider'>) =>
      u.auth_provider === 'password' || !u.auth_provider,
    getUserAuthProvider: (u: Pick<AuthUser, 'auth_provider'>) =>
      u.auth_provider || 'password',
  });
  return { ops, deleted };
}

describe('PasswordOps — password reset flow', () => {
  let dir: string;
  let db: DatabaseService;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'civic-pwreset-'));
    db = new DatabaseService({
      type: 'sqlite',
      sqlite: { file: join(dir, 'test.db') },
    });
    await db.initialize();
  });

  afterEach(async () => {
    await db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  async function seedPasswordUser() {
    const passwordHash = await bcrypt.hash('OldPassw0rd!', 12);
    const id = await db.createUserWithPassword({
      username: 'jo',
      role: 'clerk',
      email: 'jo@example.org',
      passwordHash,
      auth_provider: 'password',
      email_verified: true,
    });
    return id;
  }

  it('resolves an eligible user by username or email; nothing for unknowns', async () => {
    await seedPasswordUser();
    const { ops } = makeOps(db);

    expect(await ops.findResetEligibleUser('jo')).toMatchObject({
      username: 'jo',
      email: 'jo@example.org',
    });
    expect(await ops.findResetEligibleUser('jo@example.org')).toMatchObject({
      username: 'jo',
    });
    expect(await ops.findResetEligibleUser('nobody')).toBeNull();
    expect(await ops.findResetEligibleUser('  ')).toBeNull();
  });

  it('treats OAuth accounts as ineligible (no password to reset)', async () => {
    await db.createUser({
      username: 'gh',
      role: 'public',
      email: 'gh@example.org',
      auth_provider: 'github',
      provider_user_id: '123',
    });
    const { ops } = makeOps(db);
    expect(await ops.findResetEligibleUser('gh')).toBeNull();
    // ...and createPasswordResetToken refuses too.
    expect(await ops.createPasswordResetToken('gh')).toBeNull();
  });

  it('mints a token, resets the password, revokes sessions, and is single-use', async () => {
    const userId = await seedPasswordUser();
    const { ops, deleted } = makeOps(db);

    const minted = await ops.createPasswordResetToken('jo');
    expect(minted?.token).toBeTruthy();

    const res = await ops.resetPasswordWithToken(
      minted!.token,
      'BrandNewP4ss!'
    );
    expect(res.success).toBe(true);
    expect(res.sessionsRevoked).toBe(true);
    expect(deleted).toContain(userId);

    // New password verifies against the stored hash.
    const row = await db.getUserWithPassword('jo');
    expect(await bcrypt.compare('BrandNewP4ss!', row!.password_hash!)).toBe(
      true
    );

    // The same link cannot be used twice.
    const replay = await ops.resetPasswordWithToken(
      minted!.token,
      'AnotherP4ss!'
    );
    expect(replay.success).toBe(false);
    expect(replay.message).toMatch(/invalid or has expired/i);
  });

  it('rejects an unknown/garbage token uniformly', async () => {
    await seedPasswordUser();
    const { ops } = makeOps(db);
    const res = await ops.resetPasswordWithToken('not-a-real-token', 'BrandNewP4ss!');
    expect(res.success).toBe(false);
    expect(res.message).toMatch(/invalid or has expired/i);
  });

  it('does NOT consume the token when the new password fails policy', async () => {
    await seedPasswordUser();
    const { ops } = makeOps(db);
    const minted = await ops.createPasswordResetToken('jo');

    const weak = await ops.resetPasswordWithToken(minted!.token, 'weak');
    expect(weak.success).toBe(false);
    expect(weak.message).toMatch(/requirements/i);

    // Same link still works with a compliant password.
    const ok = await ops.resetPasswordWithToken(minted!.token, 'BrandNewP4ss!');
    expect(ok.success).toBe(true);
  });

  it('rejects an expired token (TTL enforced at the store)', async () => {
    const userId = await seedPasswordUser();
    const { ops } = makeOps(db);

    // Insert a token that expired an hour ago.
    const past = new Date(Date.now() - 60 * 60 * 1000);
    await db.createPasswordResetToken(userId, hashToken('expired-token'), past);

    const res = await ops.resetPasswordWithToken('expired-token', 'BrandNewP4ss!');
    expect(res.success).toBe(false);
    expect(res.message).toMatch(/invalid or has expired/i);
  });

  it('minting a new token invalidates the previous unconsumed one', async () => {
    await seedPasswordUser();
    const { ops } = makeOps(db);

    const first = await ops.createPasswordResetToken('jo');
    const second = await ops.createPasswordResetToken('jo');
    expect(first!.token).not.toBe(second!.token);

    // The first link is now dead; only the most recent works.
    const stale = await ops.resetPasswordWithToken(first!.token, 'BrandNewP4ss!');
    expect(stale.success).toBe(false);

    const ok = await ops.resetPasswordWithToken(second!.token, 'BrandNewP4ss!');
    expect(ok.success).toBe(true);
  });
});
