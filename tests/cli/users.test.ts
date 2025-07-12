import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'child_process';
import {
  createCLITestContext,
  cleanupCLITestContext,
  setupGlobalTestEnvironment,
} from '../fixtures/test-setup';

// Setup global test environment
await setupGlobalTestEnvironment();

describe('CLI User Management', () => {
  let context: any;
  let adminToken: string;
  let regularUserToken: string;

  beforeEach(async () => {
    context = await createCLITestContext();
  });

  afterEach(async () => {
    await cleanupCLITestContext(context);
  });

  describe('User Creation', () => {
    it('should create a user with all required fields', () => {
      const result = execSync(
        `cd ${context.testDir} && node ${context.cliPath} users:create --username testuser1 --password testpass123 --name "Test User 1" --role public`,
        { encoding: 'utf8' }
      );

      expect(result).toContain('✅ User created successfully');
      expect(result).toContain('testuser1');
    });

    it('should create a user with minimal fields (defaults to public role)', () => {
      const result = execSync(
        `cd ${context.testDir} && node ${context.cliPath} users:create --username testuser2 --password testpass123`,
        { encoding: 'utf8' }
      );

      expect(result).toContain('✅ User created successfully');
      expect(result).toContain('testuser2');
    });

    it('should fail when username is missing', () => {
      expect(() => {
        execSync(
          `cd ${context.testDir} && node ${context.cliPath} users:create --password testpass123`,
          { encoding: 'utf8' }
        );
      }).toThrow();
    });

    it('should fail when password is missing', () => {
      expect(() => {
        execSync(
          `cd ${context.testDir} && node ${context.cliPath} users:create --username testuser3`,
          { encoding: 'utf8' }
        );
      }).toThrow();
    });

    it('should output JSON when --json flag is used', () => {
      const result = execSync(
        `cd ${context.testDir} && node ${context.cliPath} users:create --username testuser4 --password testpass123 --name "Test User 4" --json`,
        { encoding: 'utf8' }
      );

      const jsonResult = JSON.parse(result);
      expect(jsonResult.success).toBe(true);
      expect(jsonResult.user.username).toBe('testuser4');
    });
  });

  describe('User Authentication', () => {
    beforeEach(() => {
      // Create test users for authentication tests
      execSync(
        `cd ${context.testDir} && node ${context.cliPath} users:create --username testadmin --password adminpass123 --name "Test Admin" --role admin`,
        { stdio: 'pipe' }
      );
      execSync(
        `cd ${context.testDir} && node ${context.cliPath} users:create --username testregular --password regularpass123 --name "Test Regular" --role public`,
        { stdio: 'pipe' }
      );
    });

    it('should authenticate admin user and return token', () => {
      const result = execSync(
        `cd ${context.testDir} && node ${context.cliPath} auth:password --username testadmin --password adminpass123 --json`,
        { encoding: 'utf8' }
      );

      const jsonResult = JSON.parse(result);
      expect(jsonResult.success).toBe(true);
      expect(jsonResult.session.token).toBeDefined();
      expect(jsonResult.session.user.role).toBe('admin');

      adminToken = jsonResult.session.token;
    });

    it('should authenticate regular user and return token', () => {
      const result = execSync(
        `cd ${context.testDir} && node ${context.cliPath} auth:password --username testregular --password regularpass123 --json`,
        { encoding: 'utf8' }
      );

      const jsonResult = JSON.parse(result);
      expect(jsonResult.success).toBe(true);
      expect(jsonResult.session.token).toBeDefined();
      expect(jsonResult.session.user.role).toBe('public');

      regularUserToken = jsonResult.session.token;
    });

    it('should fail authentication with wrong password', () => {
      expect(() => {
        execSync(
          `cd ${context.testDir} && node ${context.cliPath} auth:password --username testadmin --password wrongpass`,
          { encoding: 'utf8' }
        );
      }).toThrow();
    });

    it('should fail authentication with non-existent user', () => {
      expect(() => {
        execSync(
          `cd ${context.testDir} && node ${context.cliPath} auth:password --username nonexistent --password testpass123`,
          { encoding: 'utf8' }
        );
      }).toThrow();
    });
  });

  describe('User Listing (Permission Tests)', () => {
    beforeEach(() => {
      // Create test users for permission tests
      execSync(
        `cd ${context.testDir} && node ${context.cliPath} users:create --username testadmin --password adminpass123 --name "Test Admin" --role admin`,
        { stdio: 'pipe' }
      );
      execSync(
        `cd ${context.testDir} && node ${context.cliPath} users:create --username testregular --password regularpass123 --name "Test Regular" --role public`,
        { stdio: 'pipe' }
      );

      // Get admin token
      const result = execSync(
        `cd ${context.testDir} && node ${context.cliPath} auth:password --username testadmin --password adminpass123 --json`,
        { encoding: 'utf8' }
      );
      const jsonResult = JSON.parse(result);
      adminToken = jsonResult.session.token;

      // Get regular user token
      const regularResult = execSync(
        `cd ${context.testDir} && node ${context.cliPath} auth:password --username testregular --password regularpass123 --json`,
        { encoding: 'utf8' }
      );
      const regularJsonResult = JSON.parse(regularResult);
      regularUserToken = regularJsonResult.session.token;
    });

    it('should require authentication to list users', () => {
      expect(() => {
        execSync(
          `cd ${context.testDir} && node ${context.cliPath} users:list`,
          {
            encoding: 'utf8',
          }
        );
      }).toThrow();
    });

    it('should deny access to regular users', () => {
      expect(() => {
        execSync(
          `cd ${context.testDir} && node ${context.cliPath} users:list --token ${regularUserToken}`,
          { encoding: 'utf8' }
        );
      }).toThrow();
    });

    it('should allow admin users to list users', () => {
      const result = execSync(
        `cd ${context.testDir} && node ${context.cliPath} users:list --token ${adminToken}`,
        { encoding: 'utf8' }
      );

      expect(result).toContain('👥 Users:');
      expect(result).toContain('testadmin');
      expect(result).toContain('testregular');
    });

    it('should output JSON when --json flag is used', () => {
      const result = execSync(
        `cd ${context.testDir} && node ${context.cliPath} users:list --token ${adminToken} --json`,
        { encoding: 'utf8' }
      );

      const jsonResult = JSON.parse(result);
      expect(jsonResult.success).toBe(true);
      expect(Array.isArray(jsonResult.users)).toBe(true);
      expect(jsonResult.users.length).toBeGreaterThan(0);
    });
  });

  describe('User Updates (Permission Tests)', () => {
    beforeEach(() => {
      // Create test users for update tests
      execSync(
        `cd ${context.testDir} && node ${context.cliPath} users:create --username testadmin --password adminpass123 --name "Test Admin" --role admin`,
        { stdio: 'pipe' }
      );
      execSync(
        `cd ${context.testDir} && node ${context.cliPath} users:create --username testregular --password regularpass123 --name "Test Regular" --role public`,
        { stdio: 'pipe' }
      );

      // Get admin token
      const result = execSync(
        `cd ${context.testDir} && node ${context.cliPath} auth:password --username testadmin --password adminpass123 --json`,
        { encoding: 'utf8' }
      );
      const jsonResult = JSON.parse(result);
      adminToken = jsonResult.session.token;

      // Get regular user token
      const regularResult = execSync(
        `cd ${context.testDir} && node ${context.cliPath} auth:password --username testregular --password regularpass123 --json`,
        { encoding: 'utf8' }
      );
      const regularJsonResult = JSON.parse(regularResult);
      regularUserToken = regularJsonResult.session.token;
    });

    it('should allow admin to update user role', () => {
      const result = execSync(
        `cd ${context.testDir} && node ${context.cliPath} users:update --username testregular --role clerk --token ${adminToken}`,
        { encoding: 'utf8' }
      );

      expect(result).toContain('✅ User updated successfully');
      expect(result).toContain('testregular');
      expect(result).toContain('clerk');
    });

    it('should deny regular users from updating other users', () => {
      expect(() => {
        execSync(
          `cd ${context.testDir} && node ${context.cliPath} users:update --username testadmin --role public --token ${regularUserToken}`,
          { encoding: 'utf8' }
        );
      }).toThrow();
    });

    it('should output JSON when --json flag is used', () => {
      const result = execSync(
        `cd ${context.testDir} && node ${context.cliPath} users:update --username testregular --role clerk --token ${adminToken} --json`,
        { encoding: 'utf8' }
      );

      const jsonResult = JSON.parse(result);
      expect(jsonResult.success).toBe(true);
      expect(jsonResult.user.username).toBe('testregular');
      expect(jsonResult.user.role).toBe('clerk');
    });
  });

  describe('User Deletion (Permission Tests)', () => {
    beforeEach(() => {
      // Create test users for deletion tests
      execSync(
        `cd ${context.testDir} && node ${context.cliPath} users:create --username testadmin --password adminpass123 --name "Test Admin" --role admin`,
        { stdio: 'pipe' }
      );
      execSync(
        `cd ${context.testDir} && node ${context.cliPath} users:create --username testregular --password regularpass123 --name "Test Regular" --role public`,
        { stdio: 'pipe' }
      );
      execSync(
        `cd ${context.testDir} && node ${context.cliPath} users:create --username testdelete --password deletepass123 --name "Test Delete" --role public`,
        { stdio: 'pipe' }
      );

      // Get admin token
      const result = execSync(
        `cd ${context.testDir} && node ${context.cliPath} auth:password --username testadmin --password adminpass123 --json`,
        { encoding: 'utf8' }
      );
      const jsonResult = JSON.parse(result);
      adminToken = jsonResult.session.token;

      // Get regular user token
      const regularResult = execSync(
        `cd ${context.testDir} && node ${context.cliPath} auth:password --username testregular --password regularpass123 --json`,
        { encoding: 'utf8' }
      );
      const regularJsonResult = JSON.parse(regularResult);
      regularUserToken = regularJsonResult.session.token;
    });

    it('should allow admin to delete user', () => {
      const result = execSync(
        `cd ${context.testDir} && node ${context.cliPath} users:delete --username testdelete --token ${adminToken}`,
        { encoding: 'utf8' }
      );

      expect(result).toContain('✅ User deleted successfully');
      expect(result).toContain('testdelete');
    });

    it('should deny regular users from deleting other users', () => {
      expect(() => {
        execSync(
          `cd ${context.testDir} && node ${context.cliPath} users:delete --username testregular --token ${regularUserToken}`,
          { encoding: 'utf8' }
        );
      }).toThrow();
    });

    it('should output JSON when --json flag is used', () => {
      const result = execSync(
        `cd ${context.testDir} && node ${context.cliPath} users:delete --username testdelete --token ${adminToken} --json`,
        { encoding: 'utf8' }
      );

      const jsonResult = JSON.parse(result);
      expect(jsonResult.success).toBe(true);
      expect(jsonResult.message).toContain('deleted successfully');
    });
  });
});
