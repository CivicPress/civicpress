import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'path';
import { CivicPress } from '../../core/src/civic-core.js';
import { AuthService } from '../../core/src/auth/auth-service.js';
import {
  createTestDirectory,
  createRolesConfig,
  cleanupTestDirectory,
} from '../fixtures/test-setup';

describe('Security Guards', () => {
  let civicPress: CivicPress;
  let authService: AuthService;
  let testConfig: any;

  beforeEach(async () => {
    // Use shared fixture for test directory and roles config
    testConfig = createTestDirectory('security-guards-test');
    createRolesConfig(testConfig);

    // Initialize CivicPress
    civicPress = new CivicPress({
      dataDir: testConfig.dataDir,
      database: {
        type: 'sqlite',
        sqlite: {
          file: join(testConfig.testDir, 'test.db'),
        },
      },
    });
    await civicPress.initialize();

    // Get auth service
    authService = civicPress.getAuthService();
  });

  afterEach(async () => {
    if (civicPress) {
      await civicPress.shutdown();
    }
    cleanupTestDirectory(testConfig);
  });

  describe('Password Management Guards', () => {
    it('should allow password-authenticated users to set passwords', async () => {
      const user = await authService.createUserWithPassword({
        username: 'passworduser',
        email: 'password@example.com',
        name: 'Password User',
        role: 'public',
        passwordHash: 'hashedpassword',
        auth_provider: 'password',
        email_verified: true,
      });

      expect(authService.canSetPassword(user)).toBe(true);
      expect(authService.isExternalAuthUser(user)).toBe(false);
      expect(authService.getUserAuthProvider(user)).toBe('password');
    });

    it('should prevent GitHub-authenticated users from setting passwords', async () => {
      const user = await authService.createUser({
        username: 'githubuser',
        email: 'github@example.com',
        name: 'GitHub User',
        role: 'public',
        auth_provider: 'github',
        email_verified: true,
      });

      expect(authService.canSetPassword(user)).toBe(false);
      expect(authService.isExternalAuthUser(user)).toBe(true);
      expect(authService.getUserAuthProvider(user)).toBe('github');
    });

    it('should prevent Google-authenticated users from setting passwords', async () => {
      const user = await authService.createUser({
        username: 'googleuser',
        email: 'google@example.com',
        name: 'Google User',
        role: 'public',
        auth_provider: 'google',
        email_verified: true,
      });

      expect(authService.canSetPassword(user)).toBe(false);
      expect(authService.isExternalAuthUser(user)).toBe(true);
      expect(authService.getUserAuthProvider(user)).toBe('google');
    });

    it('should handle users with no auth_provider (legacy)', async () => {
      // Create user without auth_provider (simulating legacy user)
      const databaseService = civicPress.getDatabaseService();
      const user = await databaseService.createUser({
        username: 'legacyuser',
        email: 'legacy@example.com',
        name: 'Legacy User',
        role: 'public',
      });

      // Should default to password authentication
      expect(authService.canSetPassword(user)).toBe(true);
      expect(authService.isExternalAuthUser(user)).toBe(false);
      expect(authService.getUserAuthProvider(user)).toBe('password');
    });
  });

  describe('Password Change Security', () => {
    it('should successfully change password for password-authenticated user', async () => {
      const user = await authService.createUserWithPassword({
        username: 'testuser',
        email: 'test@example.com',
        name: 'Test User',
        role: 'public',
        passwordHash: 'currenthashedpassword',
        auth_provider: 'password',
        email_verified: true,
      });

      const result = await authService.changePassword(
        user.id,
        'newpassword123',
        'currentpassword'
      );

      // Note: This will fail because we don't have the actual current password
      // but it should fail with "incorrect password" not "external auth" error
      expect(result.success).toBe(false);
      expect(result.message).toContain('Current password is incorrect');
    });

    it('should prevent password change for external auth users', async () => {
      const user = await authService.createUser({
        username: 'githubuser',
        email: 'github@example.com',
        name: 'GitHub User',
        role: 'public',
        auth_provider: 'github',
        email_verified: true,
      });

      const result = await authService.changePassword(
        user.id,
        'newpassword123',
        'anypassword'
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain('external authentication');
    });

    it('should allow admin to set password for password-authenticated user', async () => {
      // Create admin user
      const adminUser = await authService.createUserWithPassword({
        username: 'admin',
        email: 'admin@example.com',
        name: 'Admin User',
        role: 'admin',
        passwordHash: 'adminpassword',
        auth_provider: 'password',
        email_verified: true,
      });

      // Create target user
      const targetUser = await authService.createUserWithPassword({
        username: 'targetuser',
        email: 'target@example.com',
        name: 'Target User',
        role: 'public',
        passwordHash: 'oldpassword',
        auth_provider: 'password',
        email_verified: true,
      });

      const result = await authService.setUserPassword(
        targetUser.id,
        'newpassword123',
        adminUser.id
      );

      expect(result.success).toBe(true);
      expect(result.message).toContain('Password set successfully');
    });

    it('should prevent admin from setting password for external auth user', async () => {
      // Create admin user
      const adminUser = await authService.createUserWithPassword({
        username: 'admin',
        email: 'admin@example.com',
        name: 'Admin User',
        role: 'admin',
        passwordHash: 'adminpassword',
        auth_provider: 'password',
        email_verified: true,
      });

      // Create external auth user
      const externalUser = await authService.createUser({
        username: 'githubuser',
        email: 'github@example.com',
        name: 'GitHub User',
        role: 'public',
        auth_provider: 'github',
        email_verified: true,
      });

      const result = await authService.setUserPassword(
        externalUser.id,
        'newpassword123',
        adminUser.id
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain('external authentication');
    });
  });

  describe('User Update Security', () => {
    it('should allow normal field updates for all users', async () => {
      const user = await authService.createUser({
        username: 'testuser',
        email: 'test@example.com',
        name: 'Test User',
        role: 'public',
        auth_provider: 'github',
        email_verified: true,
      });

      const result = await authService.updateUser(user.id, {
        name: 'Updated Name',
        email: 'updated@example.com',
      });

      expect(result.success).toBe(true);

      const updatedUser = await authService.getUserById(user.id);
      expect(updatedUser?.name).toBe('Updated Name');
      expect(updatedUser?.email).toBe('updated@example.com');
    });

    it('should prevent passwordHash updates for external auth users', async () => {
      const user = await authService.createUser({
        username: 'githubuser',
        email: 'github@example.com',
        name: 'GitHub User',
        role: 'public',
        auth_provider: 'github',
        email_verified: true,
      });

      const result = await authService.updateUser(user.id, {
        name: 'Updated Name',
        passwordHash: 'newhash',
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('external authentication');
    });

    it('should allow passwordHash updates for password-authenticated users', async () => {
      const user = await authService.createUserWithPassword({
        username: 'passworduser',
        email: 'password@example.com',
        name: 'Password User',
        role: 'public',
        passwordHash: 'oldhash',
        auth_provider: 'password',
        email_verified: true,
      });

      const result = await authService.updateUser(user.id, {
        name: 'Updated Name',
        passwordHash: 'newhash',
      });

      expect(result.success).toBe(true);

      const updatedUser = await authService.getUserById(user.id);
      expect(updatedUser?.name).toBe('Updated Name');
    });
  });

  describe('OAuth Authentication Security', () => {
    it('should set correct auth_provider for OAuth users', async () => {
      // Mock OAuth user data
      const oauthUserData = {
        id: '12345',
        username: 'githubuser',
        email: 'github@example.com',
        name: 'GitHub User',
        avatar_url: 'https://github.com/avatar.jpg',
      };

      const result = await authService.authenticateWithOAuth(
        'github',
        'mock-token',
        oauthUserData
      );

      expect(result.success).toBe(true);
      expect(result.user).toBeDefined();
      expect(result.user?.auth_provider).toBe('github');
      expect(result.user?.email_verified).toBe(1); // OAuth emails are pre-verified (SQLite boolean)
      expect(authService.canSetPassword(result.user!)).toBe(false);
      expect(authService.isExternalAuthUser(result.user!)).toBe(true);
    });

    it('should update existing OAuth user on re-authentication', async () => {
      // First authentication
      const initialOAuthData = {
        id: '12345',
        username: 'githubuser',
        email: 'old@example.com',
        name: 'Old Name',
        avatar_url: 'https://github.com/old-avatar.jpg',
      };

      const firstResult = await authService.authenticateWithOAuth(
        'github',
        'mock-token',
        initialOAuthData
      );
      expect(firstResult.success).toBe(true);

      // Second authentication with updated data
      const updatedOAuthData = {
        id: '12345',
        username: 'githubuser',
        email: 'new@example.com',
        name: 'New Name',
        avatar_url: 'https://github.com/new-avatar.jpg',
      };

      const secondResult = await authService.authenticateWithOAuth(
        'github',
        'mock-token',
        updatedOAuthData
      );
      expect(secondResult.success).toBe(true);
      expect(secondResult.user?.id).toBe(firstResult.user?.id); // Same user
      expect(secondResult.user?.email).toBe('new@example.com'); // Updated email
      expect(secondResult.user?.name).toBe('New Name'); // Updated name
      expect(secondResult.user?.auth_provider).toBe('github'); // Still GitHub
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle null user gracefully', () => {
      expect(authService.canSetPassword(null as any)).toBe(false);
      expect(authService.isExternalAuthUser(null as any)).toBe(false);
      expect(authService.getUserAuthProvider(null as any)).toBe('unknown');
    });

    it('should handle undefined auth_provider gracefully', async () => {
      // Create user and manually remove auth_provider
      const user = await authService.createUserWithPassword({
        username: 'testuser',
        email: 'test@example.com',
        name: 'Test User',
        role: 'public',
        passwordHash: 'password',
        auth_provider: 'password',
        email_verified: true,
      });

      // Manually remove auth_provider to simulate legacy data
      const databaseService = civicPress.getDatabaseService();
      await databaseService.execute(
        'UPDATE users SET auth_provider = NULL WHERE id = ?',
        [user.id]
      );

      const updatedUser = await authService.getUserById(user.id);

      // Should default to password authentication
      expect(authService.canSetPassword(updatedUser!)).toBe(true);
      expect(authService.isExternalAuthUser(updatedUser!)).toBe(false);
      expect(authService.getUserAuthProvider(updatedUser!)).toBe('password');
    });

    it('should handle unknown auth_provider values', async () => {
      // Create user with unknown auth_provider
      const databaseService = civicPress.getDatabaseService();
      const userId = await databaseService.createUser({
        username: 'unknownuser',
        email: 'unknown@example.com',
        name: 'Unknown User',
        role: 'public',
        auth_provider: 'unknown-provider',
      });

      // Fetch the full user object
      const user = await databaseService.getUserById(userId);

      // Should be treated as external auth (safe default)
      expect(authService.canSetPassword(user)).toBe(false);
      expect(authService.isExternalAuthUser(user)).toBe(true);
      expect(authService.getUserAuthProvider(user)).toBe('unknown-provider');
    });
  });
});
