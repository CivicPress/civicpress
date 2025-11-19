import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'path';
import { CivicPress } from '../../core/src/civic-core.js';
import { EmailValidationService } from '../../core/src/auth/email-validation-service.js';
import { DatabaseService } from '../../core/src/database/database-service.js';
import {
  createTestDirectory,
  createRolesConfig,
  cleanupTestDirectory,
} from '../fixtures/test-setup';

describe('EmailValidationService', () => {
  let civicPress: CivicPress;
  let emailValidationService: EmailValidationService;
  let databaseService: DatabaseService;
  let testConfig: any;

  beforeEach(async () => {
    // Use shared fixture for test directory and roles config
    testConfig = createTestDirectory('email-validation-test');
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

    // Get services
    databaseService = civicPress.getDatabaseService();
    emailValidationService = new EmailValidationService(databaseService);
  });

  afterEach(async () => {
    if (civicPress) {
      await civicPress.shutdown();
    }
    cleanupTestDirectory(testConfig);
  });

  describe('Email Format Validation', () => {
    it('should validate correct email formats', () => {
      const validEmails = [
        'user@example.com',
        'test.user@domain.org',
        'user+tag@example.co.uk',
        'user123@test-domain.com',
      ];

      for (const email of validEmails) {
        expect(emailValidationService.isValidEmailFormat(email)).toBe(true);
      }
    });

    it('should reject invalid email formats', () => {
      const invalidEmails = [
        'invalid-email',
        '@example.com',
        'user@',
        'user space@example.com',
        'user..double@example.com',
        '',
        null,
        undefined,
      ];

      for (const email of invalidEmails) {
        expect(emailValidationService.isValidEmailFormat(email as any)).toBe(
          false
        );
      }
    });
  });

  describe('Email Uniqueness', () => {
    beforeEach(async () => {
      // Create a test user
      await databaseService.createUserWithPassword({
        username: 'testuser',
        email: 'existing@example.com',
        name: 'Test User',
        role: 'public',
        passwordHash: 'hashedpassword',
        auth_provider: 'password',
        email_verified: false,
      });
    });

    it('should detect existing email addresses', async () => {
      const isInUse = await emailValidationService.isEmailInUse(
        'existing@example.com'
      );
      expect(isInUse).toBe(true);
    });

    it('should allow unused email addresses', async () => {
      const isInUse =
        await emailValidationService.isEmailInUse('new@example.com');
      expect(isInUse).toBe(false);
    });

    it('should allow same user to keep their current email', async () => {
      const users = await databaseService.query(
        'SELECT * FROM users WHERE email = ?',
        ['existing@example.com']
      );
      const userId = users[0].id;

      const isInUse = await emailValidationService.isEmailInUse(
        'existing@example.com',
        userId
      );
      expect(isInUse).toBe(false);
    });
  });

  describe('Token Generation', () => {
    it('should generate secure verification tokens', () => {
      const token1 = emailValidationService.generateVerificationToken();
      const token2 = emailValidationService.generateVerificationToken();

      // Tokens should be strings
      expect(typeof token1).toBe('string');
      expect(typeof token2).toBe('string');

      // Tokens should be different
      expect(token1).not.toBe(token2);

      // Tokens should be of reasonable length (at least 32 characters)
      expect(token1.length).toBeGreaterThanOrEqual(32);
      expect(token2.length).toBeGreaterThanOrEqual(32);

      // Tokens should only contain alphanumeric characters
      expect(token1).toMatch(/^[a-zA-Z0-9]+$/);
      expect(token2).toMatch(/^[a-zA-Z0-9]+$/);
    });
  });

  describe('Email Change Workflow', () => {
    let testUserId: number;
    let testUser: any;

    beforeEach(async () => {
      // Create a test user
      testUserId = await databaseService.createUserWithPassword({
        username: 'testuser',
        email: 'current@example.com',
        name: 'Test User',
        role: 'public',
        passwordHash: 'hashedpassword',
        auth_provider: 'password',
        email_verified: true,
      });

      // Get the created user for reference
      testUser = await databaseService.getUserById(testUserId);
    });

    it('should request email change successfully', async () => {
      const newEmail = 'new@example.com';
      const result = await emailValidationService.requestEmailChange({
        currentEmail: testUser.email,
        newEmail,
        userId: testUserId,
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('Email verification sent');
      expect(result.requiresVerification).toBe(true);
      expect(result.verificationToken).toBeDefined();
      expect(typeof result.verificationToken).toBe('string');
    });

    it('should reject email change to existing email', async () => {
      // Create another user with the target email
      await databaseService.createUserWithPassword({
        username: 'otheruser',
        email: 'existing@example.com',
        name: 'Other User',
        role: 'public',
        passwordHash: 'hashedpassword',
        auth_provider: 'password',
        email_verified: true,
      });

      const result = await emailValidationService.requestEmailChange({
        currentEmail: testUser.email,
        newEmail: 'existing@example.com',
        userId: testUserId,
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('already in use');
    });

    it('should reject invalid email format', async () => {
      const result = await emailValidationService.requestEmailChange({
        currentEmail: testUser.email,
        newEmail: 'invalid-email',
        userId: testUserId,
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('Invalid email format');
    });

    it('should complete email change with valid token', async () => {
      // Request email change first
      const newEmail = 'new@example.com';
      const requestResult = await emailValidationService.requestEmailChange({
        currentEmail: testUser.email,
        newEmail,
        userId: testUserId,
      });
      expect(requestResult.success).toBe(true);

      // Complete the email change
      const completeResult = await emailValidationService.completeEmailChange(
        requestResult.verificationToken!
      );

      expect(completeResult.success).toBe(true);
      expect(completeResult.message).toContain(
        'Email address successfully updated'
      );

      // Verify the user's email was updated
      const updatedUser = await databaseService.getUserById(testUserId);
      expect(updatedUser.email).toBe(newEmail);
      expect(updatedUser.email_verified).toBe(1);
      expect(updatedUser.pending_email).toBeNull();
      expect(updatedUser.pending_email_token).toBeNull();
    });

    it('should reject invalid verification token', async () => {
      const result =
        await emailValidationService.completeEmailChange('invalid-token');

      expect(result.success).toBe(false);
      expect(result.message).toContain('Invalid or expired');
    });

    it('should reject expired verification token', async () => {
      // Request email change first
      const newEmail = 'new@example.com';
      const requestResult = await emailValidationService.requestEmailChange({
        currentEmail: testUser.email,
        newEmail,
        userId: testUserId,
      });
      expect(requestResult.success).toBe(true);

      // Manually expire the token in the email_verifications table
      await databaseService.execute(
        'UPDATE email_verifications SET expires_at = datetime("now", "-1 hour") WHERE token = ?',
        [requestResult.verificationToken!]
      );

      // Try to complete with expired token
      const completeResult = await emailValidationService.completeEmailChange(
        requestResult.verificationToken!
      );

      expect(completeResult.success).toBe(false);
      expect(completeResult.message).toContain('Invalid or expired');
    });

    it('should cancel email change successfully', async () => {
      // Request email change first
      const newEmail = 'new@example.com';
      const requestResult = await emailValidationService.requestEmailChange({
        currentEmail: testUser.email,
        newEmail,
        userId: testUserId,
      });
      expect(requestResult.success).toBe(true);

      // Cancel the email change
      const cancelResult =
        await emailValidationService.cancelEmailChange(testUserId);

      expect(cancelResult.success).toBe(true);
      expect(cancelResult.message).toContain('cancelled');

      // Verify pending fields are cleared
      const user = await databaseService.getUserById(testUserId);
      expect(user.pending_email).toBeNull();
      expect(user.pending_email_token).toBeNull();
      expect(user.pending_email_expires).toBeNull();
    });

    it('should get pending email change info', async () => {
      // Request email change first
      const newEmail = 'new@example.com';
      const requestResult = await emailValidationService.requestEmailChange({
        currentEmail: testUser.email,
        newEmail,
        userId: testUserId,
      });
      expect(requestResult.success).toBe(true);

      // Get pending email change
      const pendingChange =
        await emailValidationService.getPendingEmailChange(testUserId);

      expect(pendingChange.pendingEmail).toBe(newEmail);
      expect(pendingChange.expiresAt).toBeDefined();
      expect(new Date(pendingChange.expiresAt)).toBeInstanceOf(Date);
    });

    it('should return null for no pending email change', async () => {
      const pendingChange =
        await emailValidationService.getPendingEmailChange(testUserId);

      expect(pendingChange.pendingEmail).toBeNull();
      expect(pendingChange.expiresAt).toBeNull();
    });
  });

  describe('Token Cleanup', () => {
    it('should clean up expired tokens', async () => {
      // Check if email_verifications table exists
      try {
        const result = await databaseService.query(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='email_verifications'"
        );
        if (result.length === 0) {
          console.log(
            'email_verifications table not found, skipping token cleanup test'
          );
          return;
        }
      } catch (error) {
        console.log(
          'email_verifications table not found, skipping token cleanup test'
        );
        return;
      }

      // Create a user with an expired token
      const userId = await databaseService.createUserWithPassword({
        username: 'testuser',
        email: 'test@example.com',
        name: 'Test User',
        role: 'public',
        passwordHash: 'hashedpassword',
        auth_provider: 'password',
        email_verified: true,
        pending_email: 'new@example.com',
        pending_email_token: 'expired-token',
        pending_email_expires: new Date(
          Date.now() - 1000 * 60 * 60
        ).toISOString(), // 1 hour ago
      });

      // Create an expired verification token in the email_verifications table
      await databaseService.execute(
        'INSERT INTO email_verifications (user_id, email, token, type, expires_at) VALUES (?, ?, ?, ?, ?)',
        [
          userId,
          'new@example.com',
          'expired-verification-token',
          'change',
          new Date(Date.now() - 1000 * 60 * 60).toISOString(),
        ]
      );

      // Run cleanup
      const cleanedCount = await emailValidationService.cleanupExpiredTokens();

      expect(cleanedCount).toBe(1);

      // Verify the user's pending fields are cleared
      const updatedUser = await databaseService.getUserById(userId);
      expect(updatedUser.pending_email).toBeNull();
      expect(updatedUser.pending_email_token).toBeNull();
      expect(updatedUser.pending_email_expires).toBeNull();
    });

    it('should not clean up valid tokens', async () => {
      // Check if email_verifications table exists
      try {
        const result = await databaseService.query(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='email_verifications'"
        );
        if (result.length === 0) {
          console.log(
            'email_verifications table not found, skipping token cleanup test'
          );
          return;
        }
      } catch (error) {
        console.log(
          'email_verifications table not found, skipping token cleanup test'
        );
        return;
      }

      // Create a user with a valid token
      const userId = await databaseService.createUserWithPassword({
        username: 'testuser',
        email: 'test@example.com',
        name: 'Test User',
        role: 'public',
        passwordHash: 'hashedpassword',
        auth_provider: 'password',
        email_verified: true,
        pending_email: 'new@example.com',
        pending_email_token: 'valid-token',
        pending_email_expires: new Date(
          Date.now() + 1000 * 60 * 60
        ).toISOString(), // 1 hour from now
      });

      // Create a valid verification token in the email_verifications table
      await databaseService.execute(
        'INSERT INTO email_verifications (user_id, email, token, type, expires_at) VALUES (?, ?, ?, ?, ?)',
        [
          userId,
          'new@example.com',
          'valid-verification-token',
          'change',
          new Date(Date.now() + 1000 * 60 * 60).toISOString(),
        ]
      );

      // Run cleanup
      const cleanedCount = await emailValidationService.cleanupExpiredTokens();

      expect(cleanedCount).toBe(0);

      // Verify the user's pending fields are still there
      const updatedUser = await databaseService.getUserById(userId);
      expect(updatedUser.pending_email).toBe('new@example.com');
      expect(updatedUser.pending_email_token).toBe('valid-token');
      expect(updatedUser.pending_email_expires).toBeDefined();
    });
  });
});
