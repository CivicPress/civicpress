import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'path';
import bcrypt from 'bcrypt';
import { CivicPress } from '../../core/src/civic-core.js';
import { AuthService } from '../../core/src/auth/auth-service.js';
import {
  createTestDirectory,
  createRolesConfig,
  cleanupTestDirectory,
} from '../fixtures/test-setup';

/**
 * Post-audit hardening batch 3: OAuth account linking must match by stable
 * provider identity (auth_provider, provider_user_id) — never by username.
 * The old code linked any existing account whose username matched the
 * provider-supplied one and overwrote its email: register a victim's
 * username at the provider → take over their local account.
 */
describe('OAuth account linking by provider identity', () => {
  let civicPress: CivicPress;
  let authService: AuthService;
  let testConfig: ReturnType<typeof createTestDirectory>;

  const oauth = (over: Partial<Record<string, string>> = {}) => ({
    id: over.id ?? 'gh-1001',
    username: over.username ?? 'alice',
    email: over.email ?? 'alice@provider.example',
    name: over.name ?? 'Alice',
    provider: 'github',
    providerUserId: over.providerUserId ?? over.id ?? 'gh-1001',
  });

  beforeEach(async () => {
    process.env.NODE_ENV = 'test';
    testConfig = createTestDirectory('oauth-linking-test');
    createRolesConfig(testConfig);
    civicPress = new CivicPress({
      dataDir: testConfig.dataDir,
      database: {
        type: 'sqlite',
        sqlite: { file: join(testConfig.testDir, 'test.db') },
      },
    });
    await civicPress.initialize();
    authService = civicPress.getAuthService();
  });

  afterEach(async () => {
    if (civicPress) {
      await civicPress.shutdown();
    }
    cleanupTestDirectory(testConfig);
  });

  it('does NOT take over a local password account with the same username', async () => {
    const local = await authService.createUserWithPassword({
      username: 'alice',
      passwordHash: await bcrypt.hash('Local-Passw0rd!1', 12),
      email: 'alice@town.example',
      role: 'clerk',
    });

    const result = await authService.authenticateWithOAuth(
      'github',
      'tok',
      oauth()
    );

    // A NEW account is created under a de-conflicted username…
    expect(result.user.id).not.toBe(local.id);
    expect(result.user.username).toBe('alice-github');
    // …and the local account is untouched: email, role, provider intact.
    const localAfter = await authService.getUserById(local.id);
    expect(localAfter?.email).toBe('alice@town.example');
    expect(localAfter?.role).toBe('clerk');
    expect(localAfter?.auth_provider).toBe('password');
  });

  it('matches a returning OAuth user by provider identity even after a provider username change', async () => {
    const first = await authService.authenticateWithOAuth(
      'github',
      'tok',
      oauth()
    );

    // Same provider identity, new provider username.
    const second = await authService.authenticateWithOAuth(
      'github',
      'tok',
      oauth({ username: 'alice-renamed' })
    );

    expect(second.user.id).toBe(first.user.id);
  });

  it('an attacker with the same username on the SAME provider but different identity gets a separate account', async () => {
    const victim = await authService.authenticateWithOAuth(
      'github',
      'tok',
      oauth()
    );

    const attacker = await authService.authenticateWithOAuth(
      'github',
      'tok',
      oauth({ id: 'gh-6666', providerUserId: 'gh-6666', email: 'evil@x.example' })
    );

    expect(attacker.user.id).not.toBe(victim.user.id);
    const victimAfter = await authService.getUserById(victim.user.id);
    expect(victimAfter?.email).toBe('alice@provider.example');
  });

  it('adopts a legacy same-provider account (no recorded identity) and binds it', async () => {
    // Simulate a pre-provider_user_id OAuth account.
    const legacy = await authService.createUser({
      username: 'bob',
      email: 'bob@provider.example',
      role: 'public',
      auth_provider: 'github',
    });

    const result = await authService.authenticateWithOAuth(
      'github',
      'tok',
      oauth({ id: 'gh-2002', providerUserId: 'gh-2002', username: 'bob', email: 'bob@provider.example' })
    );
    expect(result.user.id).toBe(legacy.id);

    // Once bound, a DIFFERENT identity with the same username cannot adopt it.
    const impostor = await authService.authenticateWithOAuth(
      'github',
      'tok',
      oauth({ id: 'gh-9999', providerUserId: 'gh-9999', username: 'bob', email: 'imp@x.example' })
    );
    expect(impostor.user.id).not.toBe(legacy.id);
  });
});
