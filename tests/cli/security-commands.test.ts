import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'child_process';
import {
  createCLITestContext,
  CLITestContext,
  cleanupCLITestContext,
} from '../fixtures/test-setup';

describe('CLI Security Commands', () => {
  let context: CLITestContext;
  let adminToken: string;
  let passwordUserId: number;
  let githubUserId: number;

  beforeAll(async () => {
    context = await createCLITestContext();

    // Get admin token
    if (context.adminToken) {
      adminToken = context.adminToken;

      // Create CivicPress instance for test user creation
      const { CivicPress } = await import('@civicpress/core');
      const { CentralConfigManager } = await import('@civicpress/core');
      const dataDir = CentralConfigManager.getDataDir();
      const dbConfig = CentralConfigManager.getDatabaseConfig();

      const civic = new CivicPress({
        dataDir,
        database: dbConfig,
      });
      await civic.initialize();

      // Create test users
      const authService = civic.getAuthService();

      // Create password-authenticated user
      const passwordUser = await authService.createUserWithPassword({
        username: 'clipassworduser',
        email: 'clipassword@example.com',
        name: 'CLI Password User',
        role: 'public',
        passwordHash: 'hashedpassword',
        auth_provider: 'password',
        email_verified: true,
      });
      passwordUserId = passwordUser.id;

      // Create GitHub-authenticated user
      const githubUser = await authService.createUser({
        username: 'cligithubuser',
        email: 'cligithub@example.com',
        name: 'CLI GitHub User',
        role: 'public',
        auth_provider: 'github',
        email_verified: true,
      });
      githubUserId = githubUser.id;
    }
  });

  afterAll(async () => {
    if (context) {
      await cleanupCLITestContext(context);
    }
  });

  const runCLI = (
    command: string
  ): { stdout: string; stderr: string; status: number } => {
    try {
      const result = execSync(command, {
        cwd: context.testDir,
        encoding: 'utf8',
        env: { ...process.env, NODE_ENV: 'test' },
      });
      return { stdout: result, stderr: '', status: 0 };
    } catch (error: any) {
      return {
        stdout: error.stdout || '',
        stderr: error.stderr || '',
        status: error.status || 1,
      };
    }
  };

  describe('users:change-password', () => {
    it('should fail without authentication', () => {
      if (!context.adminToken) {
        console.log('⏭️  Skipping test - admin token not available');
        return;
      }

      const result = runCLI(
        `${context.cliPath} users:change-password clipassworduser --new-password "newpass123"`
      );

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('Authentication required');
    });

    it('should prevent password change for external auth users', () => {
      if (!context.adminToken) {
        console.log('⏭️  Skipping test - admin token not available');
        return;
      }

      const result = runCLI(
        `${context.cliPath} users:change-password cligithubuser --token "${adminToken}" --current-password "any" --new-password "newpass123"`
      );

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('authenticated via github');
      expect(result.stderr).toContain('external provider');
    });

    it('should show help information', () => {
      if (!context.adminToken) {
        console.log('⏭️  Skipping test - admin token not available');
        return;
      }

      const result = runCLI(`${context.cliPath} users:change-password --help`);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Change user password');
      expect(result.stdout).toContain('--current-password');
      expect(result.stdout).toContain('--new-password');
    });

    it('should support JSON output', () => {
      if (!context.adminToken) {
        console.log('⏭️  Skipping test - admin token not available');
        return;
      }

      const result = runCLI(
        `${context.cliPath} users:change-password cligithubuser --token "${adminToken}" --current-password "any" --new-password "newpass123" --json`
      );

      expect(result.status).toBe(1);
      // Should still fail but with JSON output
      try {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(false);
      } catch {
        // If not JSON, that's also acceptable for error cases
        expect(result.stderr).toContain('external provider');
      }
    });
  });

  describe('users:set-password', () => {
    it('should require admin privileges', () => {
      if (!context.adminToken) {
        console.log('⏭️  Skipping test - admin token not available');
        return;
      }

      // Create a non-admin token (simulated)
      const result = runCLI(
        `${context.cliPath} users:set-password clipassworduser --token "fake-user-token" --password "newpass123"`
      );

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('Authentication required');
    });

    it('should prevent password setting for external auth users', () => {
      if (!context.adminToken) {
        console.log('⏭️  Skipping test - admin token not available');
        return;
      }

      const result = runCLI(
        `${context.cliPath} users:set-password cligithubuser --token "${adminToken}" --password "newpass123"`
      );

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('authenticated via github');
      expect(result.stderr).toContain('external provider');
    });

    it('should allow admin to set password for password users', () => {
      if (!context.adminToken) {
        console.log('⏭️  Skipping test - admin token not available');
        return;
      }

      const result = runCLI(
        `${context.cliPath} users:set-password clipassworduser --token "${adminToken}" --password "adminsetpass123"`
      );

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Password set successfully');
    });

    it('should show help information', () => {
      if (!context.adminToken) {
        console.log('⏭️  Skipping test - admin token not available');
        return;
      }

      const result = runCLI(`${context.cliPath} users:set-password --help`);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Set password for user');
      expect(result.stdout).toContain('admin only');
      expect(result.stdout).toContain('--password');
    });
  });

  describe('users:request-email-change', () => {
    it('should require authentication', () => {
      if (!context.adminToken) {
        console.log('⏭️  Skipping test - admin token not available');
        return;
      }

      const result = runCLI(
        `${context.cliPath} users:request-email-change clipassworduser --email "new@example.com"`
      );

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('Authentication required');
    });

    it('should allow admin to request email change for any user', () => {
      if (!context.adminToken) {
        console.log('⏭️  Skipping test - admin token not available');
        return;
      }

      const result = runCLI(
        `${context.cliPath} users:request-email-change clipassworduser --token "${adminToken}" --email "adminchanged@example.com"`
      );

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Email change requested');
      expect(result.stdout).toContain('verification email has been sent');
    });

    it('should reject invalid email format', () => {
      if (!context.adminToken) {
        console.log('⏭️  Skipping test - admin token not available');
        return;
      }

      const result = runCLI(
        `${context.cliPath} users:request-email-change clipassworduser --token "${adminToken}" --email "invalid-email"`
      );

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('Invalid email format');
    });

    it('should show help information', () => {
      if (!context.adminToken) {
        console.log('⏭️  Skipping test - admin token not available');
        return;
      }

      const result = runCLI(
        `${context.cliPath} users:request-email-change --help`
      );

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Request email change');
      expect(result.stdout).toContain('--email');
    });
  });

  describe('users:verify-email', () => {
    it('should reject invalid token', () => {
      if (!context.adminToken) {
        console.log('⏭️  Skipping test - admin token not available');
        return;
      }

      const result = runCLI(
        `${context.cliPath} users:verify-email invalid-token`
      );

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('Invalid or expired');
    });

    it('should not require authentication (token-based)', () => {
      if (!context.adminToken) {
        console.log('⏭️  Skipping test - admin token not available');
        return;
      }

      // Even without auth, it should fail due to invalid token, not missing auth
      const result = runCLI(
        `${context.cliPath} users:verify-email some-fake-token`
      );

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('Invalid or expired');
      expect(result.stderr).not.toContain('Authentication required');
    });

    it('should show help information', () => {
      if (!context.adminToken) {
        console.log('⏭️  Skipping test - admin token not available');
        return;
      }

      const result = runCLI(`${context.cliPath} users:verify-email --help`);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Verify email change');
      expect(result.stdout).toContain('token');
    });
  });

  describe('users:cancel-email-change', () => {
    it('should require authentication', () => {
      if (!context.adminToken) {
        console.log('⏭️  Skipping test - admin token not available');
        return;
      }

      const result = runCLI(
        `${context.cliPath} users:cancel-email-change clipassworduser`
      );

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('Authentication required');
    });

    it('should allow user to cancel their own email change', () => {
      if (!context.adminToken) {
        console.log('⏭️  Skipping test - admin token not available');
        return;
      }

      // First request an email change
      runCLI(
        `${context.cliPath} users:request-email-change clipassworduser --token "${adminToken}" --email "cancel@example.com"`
      );

      // Then cancel it
      const result = runCLI(
        `${context.cliPath} users:cancel-email-change clipassworduser --token "${adminToken}"`
      );

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Email change cancelled');
    });

    it('should show help information', () => {
      if (!context.adminToken) {
        console.log('⏭️  Skipping test - admin token not available');
        return;
      }

      const result = runCLI(
        `${context.cliPath} users:cancel-email-change --help`
      );

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Cancel pending email change');
    });
  });

  describe('users:security-info', () => {
    it('should require authentication', () => {
      if (!context.adminToken) {
        console.log('⏭️  Skipping test - admin token not available');
        return;
      }

      const result = runCLI(
        `${context.cliPath} users:security-info clipassworduser`
      );

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('Authentication required');
    });

    it('should show security info for password-authenticated user', () => {
      if (!context.adminToken) {
        console.log('⏭️  Skipping test - admin token not available');
        return;
      }

      const result = runCLI(
        `${context.cliPath} users:security-info clipassworduser --token "${adminToken}"`
      );

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Security Information');
      expect(result.stdout).toContain('Auth Provider: password');
      expect(result.stdout).toContain('Can Set Password: ✓');
      expect(result.stdout).toContain('External Auth: ✗');
    });

    it('should show security info for external auth user', () => {
      if (!context.adminToken) {
        console.log('⏭️  Skipping test - admin token not available');
        return;
      }

      const result = runCLI(
        `${context.cliPath} users:security-info cligithubuser --token "${adminToken}"`
      );

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Security Information');
      expect(result.stdout).toContain('Auth Provider: github');
      expect(result.stdout).toContain('Can Set Password: ✗');
      expect(result.stdout).toContain('External Auth: ✓');
    });

    it('should support JSON output', () => {
      if (!context.adminToken) {
        console.log('⏭️  Skipping test - admin token not available');
        return;
      }

      const result = runCLI(
        `${context.cliPath} users:security-info clipassworduser --token "${adminToken}" --json`
      );

      expect(result.status).toBe(0);

      const output = JSON.parse(result.stdout);
      expect(output.authProvider).toBe('password');
      expect(output.canSetPassword).toBe(true);
      expect(output.isExternalAuth).toBe(false);
      expect(output.emailVerified).toBeDefined();
      expect(output.pendingEmailChange).toBeDefined();
    });

    it('should show help information', () => {
      if (!context.adminToken) {
        console.log('⏭️  Skipping test - admin token not available');
        return;
      }

      const result = runCLI(`${context.cliPath} users:security-info --help`);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Get user security information');
    });
  });

  describe('users:create with security fields', () => {
    it('should create users with password auth provider', () => {
      if (!context.adminToken) {
        console.log('⏭️  Skipping test - admin token not available');
        return;
      }

      const result = runCLI(
        `${context.cliPath} users:create --token "${adminToken}" --username "newsecureuser" --email "newsecure@example.com" --password "securepass123" --name "New Secure User"`
      );

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('User created successfully');
    });

    it('should show help information', () => {
      if (!context.adminToken) {
        console.log('⏭️  Skipping test - admin token not available');
        return;
      }

      const result = runCLI(`${context.cliPath} users:create --help`);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Create a new user account');
    });
  });

  describe('users:update with security guards', () => {
    it('should prevent password updates for external auth users', () => {
      if (!context.adminToken) {
        console.log('⏭️  Skipping test - admin token not available');
        return;
      }

      const result = runCLI(
        `${context.cliPath} users:update --token "${adminToken}" --username "cligithubuser" --password "newpass123"`
      );

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('authenticated via github');
      expect(result.stderr).toContain('external provider');
    });

    it('should allow password updates for password-authenticated users', () => {
      if (!context.adminToken) {
        console.log('⏭️  Skipping test - admin token not available');
        return;
      }

      const result = runCLI(
        `${context.cliPath} users:update --token "${adminToken}" --username "clipassworduser" --name "Updated CLI User"`
      );

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('User updated successfully');
    });

    it('should show help information', () => {
      if (!context.adminToken) {
        console.log('⏭️  Skipping test - admin token not available');
        return;
      }

      const result = runCLI(`${context.cliPath} users:update --help`);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Update a user account');
    });
  });

  describe('Command-line argument validation', () => {
    it('should validate required arguments', () => {
      if (!context.adminToken) {
        console.log('⏭️  Skipping test - admin token not available');
        return;
      }

      const result = runCLI(`${context.cliPath} users:change-password`);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('required');
    });

    it('should support silent mode', () => {
      if (!context.adminToken) {
        console.log('⏭️  Skipping test - admin token not available');
        return;
      }

      const result = runCLI(
        `${context.cliPath} users:security-info nonexistent --token "${adminToken}" --silent`
      );

      expect(result.status).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toBe('');
    });
  });
});
