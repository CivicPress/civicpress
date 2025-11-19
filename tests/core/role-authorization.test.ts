import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'path';
import { readFileSync, writeFileSync } from 'fs';
import yaml from 'js-yaml';
import { CivicPress } from '../../core/src/civic-core.js';
import { AuthUser } from '../../core/src/auth/auth-service.js';
import {
  userCan,
  userHasRole,
  getUserPermissions,
  getDefaultRole,
  initializeRoleManager,
  getRoleManager,
} from '../../core/src/auth/role-utils.js';
import {
  createTestDirectory,
  createRolesConfig,
  cleanupTestDirectory,
} from '../fixtures/test-setup';

describe('Role-Based Authorization System', () => {
  let civicPress: CivicPress;
  let testConfig: any;

  beforeEach(async () => {
    // Use shared fixture for test directory and roles config
    testConfig = createTestDirectory('role-auth-test');
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

    // Initialize role manager for testing
    initializeRoleManager(testConfig.dataDir);
  });

  afterEach(async () => {
    if (civicPress) {
      await civicPress.shutdown();
    }
    cleanupTestDirectory(testConfig);
  });

  describe('userCan() function', () => {
    it('should allow admin to perform all actions', async () => {
      const adminUser: AuthUser = {
        id: 1,
        username: 'admin',
        role: 'admin',
        email: 'admin@example.com',
        name: 'Admin User',
      };

      // Test system permissions
      expect(await userCan(adminUser, 'system:admin')).toBe(true);
      expect(await userCan(adminUser, 'records:create')).toBe(true);
      expect(await userCan(adminUser, 'records:edit')).toBe(true);
      expect(await userCan(adminUser, 'records:delete')).toBe(true);
      expect(await userCan(adminUser, 'records:view')).toBe(true);

      // Test record type specific permissions
      expect(
        await userCan(adminUser, 'records:create', {
          recordType: 'bylaw',
          action: 'create',
        })
      ).toBe(true);
      expect(
        await userCan(adminUser, 'records:edit', {
          recordType: 'policy',
          action: 'edit',
        })
      ).toBe(true);
      expect(
        await userCan(adminUser, 'records:delete', {
          recordType: 'resolution',
          action: 'delete',
        })
      ).toBe(true);
      expect(
        await userCan(adminUser, 'records:view', {
          recordType: 'bylaw',
          action: 'view',
        })
      ).toBe(true);

      // Test status transitions
      expect(
        await userCan(adminUser, 'workflows:manage', {
          fromStatus: 'draft',
          toStatus: 'proposed',
        })
      ).toBe(true);
    });

    it('should allow clerk to perform limited actions', async () => {
      const clerkUser: AuthUser = {
        id: 2,
        username: 'clerk',
        role: 'clerk',
        email: 'clerk@example.com',
        name: 'Clerk User',
      };

      // Test allowed permissions
      expect(await userCan(clerkUser, 'records:create')).toBe(true);
      expect(await userCan(clerkUser, 'records:edit')).toBe(true);
      expect(await userCan(clerkUser, 'records:view')).toBe(true);

      // Test denied permissions
      expect(await userCan(clerkUser, 'system:admin')).toBe(false);
      expect(await userCan(clerkUser, 'records:delete')).toBe(false);
      expect(await userCan(clerkUser, 'users:manage')).toBe(false);
    });

    it('should restrict public users to view only', async () => {
      const publicUser: AuthUser = {
        id: 3,
        username: 'public',
        role: 'public',
        email: 'public@example.com',
        name: 'Public User',
      };

      // Test allowed permissions
      expect(await userCan(publicUser, 'records:view')).toBe(true);

      // Test denied permissions
      expect(await userCan(publicUser, 'records:create')).toBe(false);
      expect(await userCan(publicUser, 'records:edit')).toBe(false);
      expect(await userCan(publicUser, 'records:delete')).toBe(false);
      expect(await userCan(publicUser, 'system:admin')).toBe(false);
    });

    it('should handle context-based permissions', async () => {
      const adminUser: AuthUser = {
        id: 1,
        username: 'admin',
        role: 'admin',
        email: 'admin@example.com',
        name: 'Admin User',
      };

      const clerkUser: AuthUser = {
        id: 2,
        username: 'clerk',
        role: 'clerk',
        email: 'clerk@example.com',
        name: 'Clerk User',
      };

      const publicUser: AuthUser = {
        id: 3,
        username: 'public',
        role: 'public',
        email: 'public@example.com',
        name: 'Public User',
      };

      // Test context-based permissions
      expect(
        await userCan(adminUser, 'records:edit', {
          recordType: 'bylaw',
          action: 'edit',
          recordStatus: 'draft',
        })
      ).toBe(true);

      expect(
        await userCan(clerkUser, 'records:edit', {
          recordType: 'policy',
          action: 'edit',
          recordStatus: 'draft',
        })
      ).toBe(true);

      expect(
        await userCan(publicUser, 'records:edit', {
          recordType: 'bylaw',
          action: 'edit',
        })
      ).toBe(false);
    });
  });

  describe('userHasRole() function', () => {
    it('should correctly identify user roles', async () => {
      const adminUser: AuthUser = {
        id: 1,
        username: 'admin',
        role: 'admin',
        email: 'admin@example.com',
        name: 'Admin User',
      };

      const clerkUser: AuthUser = {
        id: 2,
        username: 'clerk',
        role: 'clerk',
        email: 'clerk@example.com',
        name: 'Clerk User',
      };

      const publicUser: AuthUser = {
        id: 3,
        username: 'public',
        role: 'public',
        email: 'public@example.com',
        name: 'Public User',
      };

      expect(await userHasRole(adminUser, 'admin')).toBe(true);
      expect(await userHasRole(adminUser, 'clerk')).toBe(false);
      expect(await userHasRole(adminUser, 'public')).toBe(false);

      expect(await userHasRole(clerkUser, 'admin')).toBe(false);
      expect(await userHasRole(clerkUser, 'clerk')).toBe(true);
      expect(await userHasRole(clerkUser, 'public')).toBe(false);

      expect(await userHasRole(publicUser, 'admin')).toBe(false);
      expect(await userHasRole(publicUser, 'clerk')).toBe(false);
      expect(await userHasRole(publicUser, 'public')).toBe(true);
    });
  });

  describe('getUserPermissions() function', () => {
    it('should return all permissions for admin user', async () => {
      const adminUser: AuthUser = {
        id: 1,
        username: 'admin',
        role: 'admin',
        email: 'admin@example.com',
        name: 'Admin User',
      };

      const permissions = await getUserPermissions(adminUser);

      // Admin should have all permissions
      expect(permissions).toContain('system:admin');
      expect(permissions).toContain('records:create');
      expect(permissions).toContain('records:edit');
      expect(permissions).toContain('records:delete');
      expect(permissions).toContain('records:view');
      expect(permissions).toContain('users:manage');
      expect(permissions).toContain('workflows:manage');
      expect(permissions).toContain('records:import');
      expect(permissions).toContain('records:export');
      expect(permissions).toContain('templates:manage');
      expect(permissions).toContain('hooks:manage');

      // Should have inherited permissions from clerk and public roles
      expect(permissions).toContain('records:create'); // From clerk
      expect(permissions).toContain('records:view'); // From public
    });

    it('should return limited permissions for clerk user', async () => {
      const clerkUser: AuthUser = {
        id: 2,
        username: 'clerk',
        role: 'clerk',
        email: 'clerk@example.com',
        name: 'Clerk User',
      };

      const permissions = await getUserPermissions(clerkUser);

      // Clerk should have specific permissions
      expect(permissions).toContain('records:create');
      expect(permissions).toContain('records:edit');
      expect(permissions).toContain('records:view');

      // Clerk should NOT have admin permissions
      expect(permissions).not.toContain('system:admin');
      expect(permissions).not.toContain('records:delete');
      expect(permissions).not.toContain('users:manage');

      // Should have inherited permissions from public role
      expect(permissions).toContain('records:view'); // From public
    });

    it('should return minimal permissions for public user', async () => {
      const publicUser: AuthUser = {
        id: 3,
        username: 'public',
        role: 'public',
        email: 'public@example.com',
        name: 'Public User',
      };

      const permissions = await getUserPermissions(publicUser);

      // Public should only have view permission
      expect(permissions).toContain('records:view');

      // Public should NOT have other permissions
      expect(permissions).not.toContain('records:create');
      expect(permissions).not.toContain('records:edit');
      expect(permissions).not.toContain('records:delete');
      expect(permissions).not.toContain('system:admin');
      expect(permissions).not.toContain('users:manage');
    });
  });

  describe('getDefaultRole() function', () => {
    it('should return the configured default role', async () => {
      const defaultRole = await getDefaultRole();
      expect(defaultRole).toBe('public');
    });
  });

  describe('Role Manager Integration', () => {
    it('should initialize role manager correctly', async () => {
      const roleManager = getRoleManager();
      expect(roleManager).toBeDefined();
    });

    it('should load role configuration', async () => {
      const roleManager = getRoleManager();
      const config = await roleManager.loadConfig();

      expect(config).toBeDefined();
      expect(config.roles).toBeDefined();
      expect(config.roles.admin).toBeDefined();
      expect(config.roles.clerk).toBeDefined();
      expect(config.roles.public).toBeDefined();
    });
  });

  describe('New Metadata Format Compatibility', () => {
    it('should handle new metadata format with role hierarchy inheritance', async () => {
      // Test the exact bug we just fixed - role hierarchy metadata parsing
      const adminUser: AuthUser = {
        id: 1,
        username: 'admin',
        role: 'admin',
        email: 'admin@example.com',
        name: 'Admin User',
      };

      // Test that admin can manage users (this was failing before our fix)
      expect(await userCan(adminUser, 'users:manage')).toBe(true);

      // Test that admin gets inherited permissions from clerk and public roles
      const adminPermissions = await getUserPermissions(adminUser);
      expect(adminPermissions).toContain('users:manage'); // Admin's own permission
      expect(adminPermissions).toContain('records:view'); // Inherited from public
      expect(adminPermissions.length).toBeGreaterThan(10); // Should have many permissions
    });
  });

  describe('Wildcard Permission Handling', () => {
    it('should grant any permission when role has wildcard "*"', async () => {
      // Modify roles.yml to add a role with wildcard permission
      const rolesPath = join(testConfig.civicDir, 'roles.yml');
      const original = readFileSync(rolesPath, 'utf-8');
      const doc: any = yaml.load(original);

      doc.roles = doc.roles || {};
      doc.roles.wildcard = {
        name: {
          value: 'Wildcard',
          type: 'string',
          description: 'All access',
          required: true,
        },
        description: {
          value: 'Grants all permissions via *',
          type: 'string',
          description: 'All access',
          required: true,
        },
        permissions: {
          value: ['*'],
          type: 'array',
          description: 'All permissions',
          required: true,
        },
        status_transitions: {
          value: {},
          type: 'object',
          description: 'None',
          required: false,
        },
      };

      // Ensure role_hierarchy entry exists (not strictly required, but keeps structure consistent)
      doc.role_hierarchy = doc.role_hierarchy || {};
      if (!doc.role_hierarchy.wildcard) {
        doc.role_hierarchy.wildcard = {
          value: [],
          type: 'array',
          description: 'No inheritance',
          required: false,
        };
      }

      writeFileSync(rolesPath, yaml.dump(doc));

      // Use a user with the wildcard role
      const wildcardUser: AuthUser = {
        id: 99,
        username: 'wildcard-user',
        role: 'wildcard',
        email: 'wildcard@example.com',
        name: 'Wildcard User',
      };

      // Any arbitrary permission should be granted due to '*'
      expect(await userCan(wildcardUser, 'nonexistent:permission')).toBe(true);
      expect(await userCan(wildcardUser, 'templates:manage')).toBe(true);
      expect(await userCan(wildcardUser, 'records:delete')).toBe(true);
    });
  });
});
