import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'path';
import { CivicPress } from '../../core/src/civic-core.js';
import bcrypt from 'bcrypt';
import { AuthService } from '../../core/src/auth/auth-service.js';
import { AuthUser } from '../../core/src/auth/auth-service.js';
import {
  createTestDirectory,
  createRolesConfig,
  cleanupTestDirectory,
} from '../fixtures/test-setup';

describe('AuthService', () => {
  let civicPress: CivicPress;
  let authService: AuthService;
  let testConfig: any;

  beforeEach(async () => {
    // Use shared fixture for test directory and roles config
    testConfig = createTestDirectory('auth-service-test');
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

  describe('User Management', () => {
    it('should create and retrieve users', async () => {
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        name: 'Test User',
        role: 'public',
      };

      const user = await authService.createUser(userData);
      expect(user).toBeDefined();
      expect(user.username).toBe(userData.username);
      expect(user.email).toBe(userData.email);
      expect(user.name).toBe(userData.name);
      expect(user.role).toBe(userData.role);

      // Retrieve the user
      const retrievedUser = await authService.getUserById(user.id);
      expect(retrievedUser).toBeDefined();
      expect(retrievedUser?.username).toBe(userData.username);
    });

    it('should retrieve user by username', async () => {
      const userData = {
        username: 'testuser2',
        email: 'test2@example.com',
        name: 'Test User 2',
        role: 'public',
      };

      const user = await authService.createUser(userData);
      const retrievedUser = await authService.getUserByUsername(
        userData.username
      );

      expect(retrievedUser).toBeDefined();
      expect(retrievedUser?.username).toBe(userData.username);
      expect(retrievedUser?.email).toBe(userData.email);
    });

    it('should retrieve user by ID', async () => {
      const userData = {
        username: 'testuser3',
        email: 'test3@example.com',
        name: 'Test User 3',
        role: 'public',
      };

      const user = await authService.createUser(userData);
      const retrievedUser = await authService.getUserById(user.id);

      expect(retrievedUser).toBeDefined();
      expect(retrievedUser?.username).toBe(userData.username);
      expect(retrievedUser?.id).toBe(user.id);
    });

    it('should return null for non-existent user', async () => {
      const user = await authService.getUserByUsername('nonexistent');
      expect(user).toBeNull();
    });

    it('should update user information', async () => {
      const userData = {
        username: 'testuser4',
        email: 'test4@example.com',
        name: 'Test User 4',
        role: 'public',
      };

      const user = await authService.createUser(userData);

      const updateData = {
        email: 'updated@example.com',
        name: 'Updated User',
        role: 'clerk',
      };

      const updatedUser = await authService.updateUser(user.id, updateData);
      expect(updatedUser).toBeDefined();
      expect(updatedUser?.email).toBe(updateData.email);
      expect(updatedUser?.name).toBe(updateData.name);
      expect(updatedUser?.role).toBe(updateData.role);
    });

    it('should delete user', async () => {
      const userData = {
        username: 'testuser5',
        email: 'test5@example.com',
        name: 'Test User 5',
        role: 'public',
      };

      const user = await authService.createUser(userData);
      const userId = user.id;

      // Verify user exists
      const retrievedUser = await authService.getUserById(userId);
      expect(retrievedUser).toBeDefined();

      // Delete user
      await authService.deleteUser(userId);

      // Verify user is deleted
      const deletedUser = await authService.getUserById(userId);
      expect(deletedUser).toBeNull();
    });
  });

  describe('Authentication', () => {
    it('should authenticate user with correct credentials', async () => {
      const userData = {
        username: 'testuser6',
        email: 'test6@example.com',
        name: 'Test User 6',
        role: 'public',
        password: 'testpassword',
      };

      const user = await authService.createUser(userData);
      const passwordHash = await bcrypt.hash(userData.password, 10);
      await authService.updateUser(user.id, { passwordHash });

      const session = await authService.authenticateWithPassword(
        userData.username,
        userData.password
      );
      expect(session).toBeDefined();
      expect(session.user.id).toBe(user.id);
      expect(session.user.username).toBe(userData.username);
    });

    it('should reject authentication with wrong password', async () => {
      const userData = {
        username: 'testuser7',
        email: 'test7@example.com',
        name: 'Test User 7',
        role: 'public',
        password: 'testpassword',
      };

      const user = await authService.createUser(userData);
      const passwordHash = await bcrypt.hash(userData.password, 10);
      await authService.updateUser(user.id, { passwordHash });

      await expect(
        authService.authenticateWithPassword(userData.username, 'wrongpassword')
      ).rejects.toThrow();
    });

    it('should reject authentication for non-existent user', async () => {
      await expect(
        authService.authenticateWithPassword('nonexistent', 'password')
      ).rejects.toThrow();
    });
  });

  describe('Simulated Authentication', () => {
    it('should create simulated user with specified role', async () => {
      const userData = {
        username: 'simulateduser',
        role: 'admin',
      };

      const user = await authService.createSimulatedUser(userData);
      expect(user).toBeDefined();
      expect(user.username).toBe(userData.username);
      expect(user.role).toBe(userData.role);
    });

    it('should authenticate simulated user', async () => {
      const userData = {
        username: 'simulateduser2',
        role: 'clerk',
      };

      await authService.createSimulatedUser(userData);

      const session = await authService.authenticateWithSimulatedAccount(
        userData.username,
        userData.role
      );

      expect(session).toBeDefined();
      expect(session.user.username).toBe(userData.username);
      expect(session.user.role).toBe(userData.role);
    });

    it('should update existing user role when different role is requested', async () => {
      // First create a user with 'public' role
      const userData1 = {
        username: 'roleupdateuser',
        role: 'public',
      };

      const user1 = await authService.createSimulatedUser(userData1);
      expect(user1.role).toBe('public');

      // Now authenticate the same user with 'admin' role - should update the role
      const userData2 = {
        username: 'roleupdateuser',
        role: 'admin',
      };

      const user2 = await authService.createSimulatedUser(userData2);
      expect(user2.role).toBe('admin'); // Should be updated from 'public' to 'admin'
      expect(user2.id).toBe(user1.id); // Same user, different role
    });
  });

  describe('Session Management', () => {
    it('should create and validate session', async () => {
      const userData = {
        username: 'sessionuser',
        email: 'session@example.com',
        name: 'Session User',
        role: 'public',
        password: 'sessionpassword',
      };

      const user = await authService.createUser(userData);
      const passwordHash = await bcrypt.hash(userData.password, 10);
      await authService.updateUser(user.id, { passwordHash });
      const session = await authService.authenticateWithPassword(
        userData.username,
        userData.password
      );

      expect(session).toBeDefined();
      expect(session.token).toBeDefined();
      expect(session.user.id).toBe(user.id);
    });

    it('should validate session token', async () => {
      const userData = {
        username: 'tokenuser',
        email: 'token@example.com',
        name: 'Token User',
        role: 'public',
        password: 'tokenpassword',
      };

      const user = await authService.createUser(userData);
      const passwordHash = await bcrypt.hash(userData.password, 10);
      await authService.updateUser(user.id, { passwordHash });
      const session = await authService.authenticateWithPassword(
        userData.username,
        userData.password
      );

      const validatedUser = await authService.validateSession(session.token);
      expect(validatedUser).toBeDefined();
      expect(validatedUser?.id).toBe(user.id);
    });

    it('should reject invalid session token', async () => {
      const validatedUser = await authService.validateSession('invalid-token');
      expect(validatedUser).toBeNull();
    });
  });
});
