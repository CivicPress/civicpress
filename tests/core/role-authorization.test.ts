import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'path';
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

    // Debug: print testConfig and dataDir before CivicPress instantiation
    console.log('testConfig:', testConfig);
    console.log('testConfig.dataDir before CivicPress:', testConfig.dataDir);
    console.log('typeof testConfig.dataDir:', typeof testConfig.dataDir);

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

    // Debug: print dataDir before initializeRoleManager
    console.log(
      'testConfig.dataDir before initializeRoleManager:',
      testConfig.dataDir
    );
    // Initialize role manager for testing
    initializeRoleManager(testConfig.dataDir);

    // Debug: verify role manager is initialized
    try {
      const roleManager = getRoleManager();
      console.log('RoleManager initialized successfully');
    } catch (error) {
      console.error('Failed to initialize RoleManager:', error);
    }
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
      expect(
        await userCan(adminUser, 'workflows:manage', {
          fromStatus: 'approved',
          toStatus: 'archived',
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

      // Test permissions
      expect(await userCan(clerkUser, 'system:admin')).toBe(false);
      expect(await userCan(clerkUser, 'records:create')).toBe(true);
      expect(await userCan(clerkUser, 'records:edit')).toBe(true);
      expect(await userCan(clerkUser, 'records:delete')).toBe(false);
      expect(await userCan(clerkUser, 'records:view')).toBe(true);

      // Test record type specific permissions
      expect(
        await userCan(clerkUser, 'records:create', {
          recordType: 'bylaw',
          action: 'create',
        })
      ).toBe(true);
      expect(
        await userCan(clerkUser, 'records:edit', {
          recordType: 'policy',
          action: 'edit',
        })
      ).toBe(true);
      expect(
        await userCan(clerkUser, 'records:delete', {
          recordType: 'resolution',
          action: 'delete',
        })
      ).toBe(false);

      // Test status transitions
      expect(
        await userCan(clerkUser, 'workflows:manage', {
          fromStatus: 'draft',
          toStatus: 'proposed',
        })
      ).toBe(true);

      // Debug: check what the role manager returns for this transition
      const result = await userCan(clerkUser, 'workflows:manage', {
        fromStatus: 'approved',
        toStatus: 'archived',
      });
      console.log('Clerk approved->archived transition result:', result);

      // Debug: check the role manager configuration
      const roleManager = getRoleManager();
      const config = await roleManager['loadConfig']();
      console.log('Clerk role config:', config.roles.clerk);
      console.log('Admin role config:', config.roles.admin);

      expect(result).toBe(false);
    });

    it('should allow public to perform view-only actions', async () => {
      const publicUser: AuthUser = {
        id: 3,
        username: 'public',
        role: 'public',
        email: 'public@example.com',
        name: 'Public User',
      };

      // Test permissions
      expect(await userCan(publicUser, 'system:admin')).toBe(false);
      expect(await userCan(publicUser, 'records:create')).toBe(false);
      expect(await userCan(publicUser, 'records:edit')).toBe(false);
      expect(await userCan(publicUser, 'records:delete')).toBe(false);
      expect(await userCan(publicUser, 'records:view')).toBe(true);

      // Test record type specific permissions
      expect(
        await userCan(publicUser, 'records:create', {
          recordType: 'bylaw',
          action: 'create',
        })
      ).toBe(false);
      expect(
        await userCan(publicUser, 'records:view', {
          recordType: 'bylaw',
          action: 'view',
        })
      ).toBe(true);
    });

    it('should support array of permissions (any permission grants access)', async () => {
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

      // Admin should have access with any permission
      expect(await userCan(adminUser, ['system:admin', 'records:create'])).toBe(
        true
      );
      expect(await userCan(adminUser, ['records:delete', 'records:edit'])).toBe(
        true
      );

      // Clerk should have access with some permissions but not others
      expect(await userCan(clerkUser, ['records:create', 'records:edit'])).toBe(
        true
      );
      expect(await userCan(clerkUser, ['records:delete', 'system:admin'])).toBe(
        false
      );
    });
  });

  describe('userHasRole() function', () => {
    it('should check if user has specific role', async () => {
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

      // Test single role
      expect(await userHasRole(adminUser, 'admin')).toBe(true);
      expect(await userHasRole(adminUser, 'clerk')).toBe(false);
      expect(await userHasRole(clerkUser, 'clerk')).toBe(true);
      expect(await userHasRole(clerkUser, 'admin')).toBe(false);

      // Test array of roles
      expect(await userHasRole(adminUser, ['admin', 'clerk'])).toBe(true);
      expect(await userHasRole(clerkUser, ['admin', 'clerk'])).toBe(true);
      expect(await userHasRole(clerkUser, ['admin', 'public'])).toBe(false);
    });
  });

  describe('getUserPermissions() function', () => {
    it('should return all permissions for a user', async () => {
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

      const adminPermissions = await getUserPermissions(adminUser);
      const clerkPermissions = await getUserPermissions(clerkUser);

      // Admin should have all permissions
      expect(adminPermissions).toContain('system:admin');
      expect(adminPermissions).toContain('records:create');
      expect(adminPermissions).toContain('records:edit');
      expect(adminPermissions).toContain('records:delete');
      expect(adminPermissions).toContain('records:view');

      // Clerk should have limited permissions
      expect(clerkPermissions).not.toContain('system:admin');
      expect(clerkPermissions).toContain('records:create');
      expect(clerkPermissions).toContain('records:edit');
      expect(clerkPermissions).not.toContain('records:delete');
      expect(clerkPermissions).toContain('records:view');
    });
  });

  describe('Role hierarchy inheritance', () => {
    it('should inherit permissions from parent roles', async () => {
      const clerkUser: AuthUser = {
        id: 2,
        username: 'clerk',
        role: 'clerk',
        email: 'clerk@example.com',
        name: 'Clerk User',
      };

      // Clerk should inherit 'records:view' from 'public' role
      const clerkPermissions = await getUserPermissions(clerkUser);
      expect(clerkPermissions).toContain('records:view');
    });
  });

  describe('Default role assignment', () => {
    it('should assign default role to new users', async () => {
      const defaultRole = await getDefaultRole();
      expect(defaultRole).toBe('public');
    });
  });

  describe('Unknown role fallback', () => {
    it('should fallback to public permissions for unknown roles', async () => {
      const unknownUser: AuthUser = {
        id: 999,
        username: 'unknown_user',
        role: 'unknown_role',
        email: 'unknown@example.com',
        name: 'Unknown User',
      };

      // Unknown role should get public permissions (read-only)
      expect(await userCan(unknownUser, 'records:view')).toBe(true);
      expect(await userCan(unknownUser, 'records:create')).toBe(false);
      expect(await userCan(unknownUser, 'records:edit')).toBe(false);
      expect(await userCan(unknownUser, 'records:delete')).toBe(false);
      expect(await userCan(unknownUser, 'system:admin')).toBe(false);

      // Should be able to view records (public permission)
      expect(
        await userCan(unknownUser, 'records:view', {
          recordType: 'bylaw',
          action: 'view',
        })
      ).toBe(true);

      // Should NOT be able to create records (no public permission)
      expect(
        await userCan(unknownUser, 'records:create', {
          recordType: 'bylaw',
          action: 'create',
        })
      ).toBe(false);
    });

    it('should handle empty role gracefully', async () => {
      const emptyRoleUser: AuthUser = {
        id: 998,
        username: 'empty_role_user',
        role: '',
        email: 'empty@example.com',
        name: 'Empty Role User',
      };

      // Empty role should get public permissions (read-only)
      expect(await userCan(emptyRoleUser, 'records:view')).toBe(true);
      expect(await userCan(emptyRoleUser, 'records:create')).toBe(false);
    });

    it('should handle null/undefined role gracefully', async () => {
      const nullRoleUser: AuthUser = {
        id: 997,
        username: 'null_role_user',
        role: null as any,
        email: 'null@example.com',
        name: 'Null Role User',
      };

      // Null role should get public permissions (read-only)
      expect(await userCan(nullRoleUser, 'records:view')).toBe(true);
      expect(await userCan(nullRoleUser, 'records:create')).toBe(false);
    });
  });
});
