# 🔐 CivicPress Spec: `auth.md`

---

version: 1.0.0 status: stable created: '2025-07-04' updated: '2025-07-15'
deprecated: false sunset_date: null breaking_changes: [] additions:

- comprehensive testing examples
- security testing patterns
- performance testing
- accessibility testing
- compliance testing
- CLI testing fixes:
- testing section enhancement
- code examples
- validation patterns migration_guide: null compatibility: min_civicpress: 1.0.0
  max_civicpress: null dependencies:
  - 'permissions.md: >=1.0.0'
  - 'roles.yml.md: >=1.0.0'
  - 'signatures.md: >=1.0.0'
  - 'git-policy.md: >=1.0.0' authors:
- Sophie Germain <sophie@civic-press.org> reviewers:
- Ada Lovelace
- Irène Joliot-Curie

---

## 📛 Name

Authentication & Identity System

## 🎯 Purpose

Define how users are authenticated in CivicPress and how their identity is
trusted across roles, contributions, and civic records.

CivicPress prioritizes **Git-native identity**, transparency, and simplicity. In
early versions, GitHub is used as the primary identity provider.

---

## 🧩 Scope & Responsibilities

✅ Responsibilities:

- Authenticate users through GitHub or future providers
- Attach author metadata to civic records
- Support role-based permission mapping via `roles.yml`
- Verify commit authorship
- Optionally store or cache verified sessions

❌ Out of Scope:

- Password management
- Federated identity across municipalities
- OAuth-based third-party apps

---

## 🔗 Inputs & Outputs

| Input               | Description                       |
| ------------------- | --------------------------------- |
| GitHub login token  | Used to identify a contributor    |
| Git commit author   | Parsed from commit metadata       |
| GitHub API response | Used to validate user/org context |

| Output                | Description                        |
| --------------------- | ---------------------------------- |
| Session object        | With role, permissions, metadata   |
| `author:` field in MD | Written as trusted identity marker |
| Git commit signature  | Used to confirm authorship         |

---

## 📂 File/Folder Location

```
core/auth.ts
.civic/roles.yml
```

---

## 🔐 Security & Trust Considerations

- Commit author must match GitHub identity (verified via token or signature)
- Local/offline users fallback to signed commit validation
- Roles and permissions are decoupled from authentication provider
- Users can only act as their own identity (no impersonation)

---

## 🧪 Testing & Validation

### Authentication Testing

#### Unit Tests

```typescript
// tests/unit/auth/authentication.test.ts
describe('Authentication System', () => {
  let authService: AuthenticationService;
  let mockAPI: MockCivicPressAPI;

  beforeEach(() => {
    mockAPI = new MockCivicPressAPI();
    authService = new AuthenticationService(mockAPI);
  });

  describe('GitHub OAuth Authentication', () => {
    it('should authenticate valid GitHub user', async () => {
      // Arrange
      const githubToken = 'valid-github-token';
      const mockUser = {
        id: '123',
        username: 'test-user',
        role: 'contributor',
      };
      mockAPI.github.validateToken.mockResolvedValue(mockUser);

      // Act
      const result = await authService.authenticateWithGitHub(githubToken);

      // Assert
      expect(result.authenticated).toBe(true);
      expect(result.user).toEqual(mockUser);
      expect(result.session).toBeDefined();
    });

    it('should reject invalid GitHub token', async () => {
      // Arrange
      const invalidToken = 'invalid-token';
      mockAPI.github.validateToken.mockRejectedValue(
        new Error('Invalid token')
      );

      // Act & Assert
      await expect(
        authService.authenticateWithGitHub(invalidToken)
      ).rejects.toThrow('Invalid token');
    });

    it('should handle GitHub API rate limiting', async () => {
      // Arrange
      const token = 'valid-token';
      mockAPI.github.validateToken.mockRejectedValue(
        new Error('Rate limit exceeded')
      );

      // Act & Assert
      await expect(authService.authenticateWithGitHub(token)).rejects.toThrow(
        'Rate limit exceeded'
      );
    });
  });

  describe('Session Management', () => {
    it('should create secure session', async () => {
      // Arrange
      const user = { id: '123', username: 'test-user', role: 'contributor' };

      // Act
      const session = await authService.createSession(user);

      // Assert
      expect(session.id).toBeDefined();
      expect(session.userId).toBe(user.id);
      expect(session.created).toBeInstanceOf(Date);
      expect(session.expires).toBeInstanceOf(Date);
    });

    it('should validate session token', async () => {
      // Arrange
      const user = { id: '123', username: 'test-user', role: 'contributor' };
      const session = await authService.createSession(user);

      // Act
      const isValid = await authService.validateSession(session.token);

      // Assert
      expect(isValid).toBe(true);
    });

    it('should reject expired session', async () => {
      // Arrange
      const user = { id: '123', username: 'test-user', role: 'contributor' };
      const session = await authService.createSession(user);

      // Simulate expired session
      session.expires = new Date(Date.now() - 1000);

      // Act
      const isValid = await authService.validateSession(session.token);

      // Assert
      expect(isValid).toBe(false);
    });
  });

  describe('Role-Based Access Control', () => {
    it('should assign correct role from GitHub', async () => {
      // Arrange
      const githubUser = {
        id: '123',
        username: 'test-user',
        organizations: ['civicpress'],
      };
      mockAPI.github.getUser.mockResolvedValue(githubUser);
      mockAPI.config.get.mockResolvedValue({ civicpress: 'admin' });

      // Act
      const user = await authService.mapGitHubUserToRole(githubUser);

      // Assert
      expect(user.role).toBe('admin');
    });

    it('should default to contributor role for unknown users', async () => {
      // Arrange
      const githubUser = {
        id: '123',
        username: 'test-user',
        organizations: [],
      };

      // Act
      const user = await authService.mapGitHubUserToRole(githubUser);

      // Assert
      expect(user.role).toBe('contributor');
    });
  });
});
```

#### Integration Tests

```typescript
// tests/integration/auth/authentication-integration.test.ts
describe('Authentication Integration', () => {
  let testUtils: CivicPressTestUtils;
  let api: CivicPressAPI;

  beforeEach(async () => {
    testUtils = new CivicPressTestUtils();
    api = await testUtils.initializeTestAPI();
  });

  afterEach(async () => {
    await testUtils.cleanup();
  });

  describe('End-to-End Authentication Flow', () => {
    it('should complete full authentication workflow', async () => {
      // Arrange
      const githubToken = 'test-github-token';
      const expectedUser = {
        id: '123',
        username: 'test-user',
        role: 'contributor',
        email: 'test@example.com',
      };

      // Act
      const authResult = await api.auth.authenticate(githubToken);
      const session = await api.auth.createSession(authResult.user);
      const validatedUser = await api.auth.validateSession(session.token);

      // Assert
      expect(authResult.authenticated).toBe(true);
      expect(authResult.user).toEqual(expectedUser);
      expect(session).toBeDefined();
      expect(validatedUser).toEqual(expectedUser);
    });

    it('should handle authentication failure gracefully', async () => {
      // Arrange
      const invalidToken = 'invalid-token';

      // Act & Assert
      await expect(api.auth.authenticate(invalidToken)).rejects.toThrow(
        'Authentication failed'
      );
    });
  });

  describe('Multi-User Authentication', () => {
    it('should handle concurrent user authentication', async () => {
      // Arrange
      const users = [
        { token: 'token1', expectedRole: 'contributor' },
        { token: 'token2', expectedRole: 'clerk' },
        { token: 'token3', expectedRole: 'mayor' },
      ];

      // Act
      const results = await Promise.all(
        users.map((user) => api.auth.authenticate(user.token))
      );

      // Assert
      expect(results).toHaveLength(3);
      results.forEach((result, index) => {
        expect(result.authenticated).toBe(true);
        expect(result.user.role).toBe(users[index].expectedRole);
      });
    });
  });
});
```

### Security Testing

#### Penetration Testing

```typescript
// tests/security/auth/authentication-security.test.ts
describe('Authentication Security', () => {
  let securityTestSuite: SecurityTestSuite;

  beforeEach(() => {
    securityTestSuite = new SecurityTestSuite();
  });

  describe('Authentication Bypass Testing', () => {
    it('should prevent session hijacking', async () => {
      // Arrange
      const validSession = await createValidSession();
      const hijackedToken = modifyToken(validSession.token);

      // Act
      const result =
        await securityTestSuite.testSessionHijacking(hijackedToken);

      // Assert
      expect(result.passed).toBe(true);
      expect(result.vulnerabilities).toHaveLength(0);
    });

    it('should prevent brute force attacks', async () => {
      // Arrange
      const testCases = [
        { username: 'admin', password: 'password' },
        { username: 'admin', password: 'admin' },
        { username: 'admin', password: '123456' },
      ];

      // Act
      const result =
        await securityTestSuite.testBruteForceProtection(testCases);

      // Assert
      expect(result.passed).toBe(true);
      expect(result.blockedAttempts).toBeGreaterThan(0);
    });

    it('should validate token integrity', async () => {
      // Arrange
      const validToken = createValidToken();
      const tamperedToken = tamperWithToken(validToken);

      // Act
      const result = await securityTestSuite.testTokenIntegrity(tamperedToken);

      // Assert
      expect(result.passed).toBe(true);
      expect(result.detectedTampering).toBe(true);
    });
  });

  describe('Input Validation Testing', () => {
    it('should prevent SQL injection in authentication', async () => {
      // Arrange
      const maliciousInputs = [
        "'; DROP TABLE users; --",
        "' OR '1'='1",
        "'; INSERT INTO users VALUES ('hacker', 'admin'); --",
      ];

      // Act
      const results = await Promise.all(
        maliciousInputs.map((input) =>
          securityTestSuite.testSQLInjection(input)
        )
      );

      // Assert
      results.forEach((result) => {
        expect(result.passed).toBe(true);
        expect(result.vulnerabilities).toHaveLength(0);
      });
    });

    it('should prevent XSS in authentication forms', async () => {
      // Arrange
      const maliciousInputs = [
        "<script>alert('xss')</script>",
        "javascript:alert('xss')",
        "<img src=x onerror=alert('xss')>",
      ];

      // Act
      const results = await Promise.all(
        maliciousInputs.map((input) =>
          securityTestSuite.testXSSProtection(input)
        )
      );

      // Assert
      results.forEach((result) => {
        expect(result.passed).toBe(true);
        expect(result.sanitized).toBe(true);
      });
    });
  });
});
```

### Performance Testing

#### Load Testing

```typescript
// tests/performance/auth/authentication-performance.test.ts
describe('Authentication Performance', () => {
  let performanceTestSuite: PerformanceTestSuite;

  beforeEach(() => {
    performanceTestSuite = new PerformanceTestSuite();
  });

  describe('Authentication Response Time', () => {
    it('should authenticate users within acceptable time', async () => {
      // Arrange
      const concurrentUsers = 100;
      const testDuration = 30000; // 30 seconds

      // Act
      const result = await performanceTestSuite.testAuthenticationLoad(
        concurrentUsers,
        testDuration
      );

      // Assert
      expect(result.averageResponseTime).toBeLessThan(1000); // < 1 second
      expect(result.p95ResponseTime).toBeLessThan(2000); // < 2 seconds
      expect(result.successRate).toBeGreaterThan(0.95); // > 95% success
    });

    it('should handle authentication spikes', async () => {
      // Arrange
      const baseLoad = 50;
      const spikeLoad = 200;
      const spikeDuration = 10000; // 10 seconds

      // Act
      const result = await performanceTestSuite.testAuthenticationSpike(
        baseLoad,
        spikeLoad,
        spikeDuration
      );

      // Assert
      expect(result.baseline.successRate).toBeGreaterThan(0.95);
      expect(result.spike.successRate).toBeGreaterThan(0.9);
      expect(result.recovery.successRate).toBeGreaterThan(0.95);
    });
  });

  describe('Session Management Performance', () => {
    it('should handle concurrent session creation', async () => {
      // Arrange
      const concurrentSessions = 1000;

      // Act
      const result =
        await performanceTestSuite.testSessionCreation(concurrentSessions);

      // Assert
      expect(result.averageCreationTime).toBeLessThan(500); // < 500ms
      expect(result.successRate).toBeGreaterThan(0.99); // > 99% success
    });

    it('should validate sessions efficiently', async () => {
      // Arrange
      const sessions = await createTestSessions(1000);

      // Act
      const result = await performanceTestSuite.testSessionValidation(sessions);

      // Assert
      expect(result.averageValidationTime).toBeLessThan(100); // < 100ms
      expect(result.successRate).toBeGreaterThan(0.99); // > 99% success
    });
  });
});
```

### Accessibility Testing

#### WCAG Compliance Testing

```typescript
// tests/accessibility/auth/authentication-accessibility.test.ts
describe('Authentication Accessibility', () => {
  let accessibilityTestSuite: AccessibilityTestSuite;
  let page: any; // Playwright page

  beforeEach(async () => {
    accessibilityTestSuite = new AccessibilityTestSuite(page);
  });

  describe('Login Form Accessibility', () => {
    it('should meet WCAG 2.1 AA standards', async () => {
      // Arrange
      await page.goto('/login');

      // Act
      const result = await accessibilityTestSuite.testWCAGCompliance();

      // Assert
      expect(result.passed).toBe(true);
      expect(result.score).toBeGreaterThan(95); // > 95% compliance
    });

    it('should support screen readers', async () => {
      // Arrange
      await page.goto('/login');

      // Act
      const result =
        await accessibilityTestSuite.testScreenReaderCompatibility();

      // Assert
      expect(result.passed).toBe(true);
      expect(result.ariaLabels).toBeDefined();
      expect(result.focusManagement).toBe(true);
    });

    it('should support keyboard navigation', async () => {
      // Arrange
      await page.goto('/login');

      // Act
      const result = await accessibilityTestSuite.testKeyboardNavigation();

      // Assert
      expect(result.passed).toBe(true);
      expect(result.tabOrder).toBeDefined();
      expect(result.shortcuts).toBeDefined();
    });
  });

  describe('Error Message Accessibility', () => {
    it('should provide accessible error messages', async () => {
      // Arrange
      await page.goto('/login');

      // Act
      await page.fill('input[name="username"]', 'invalid');
      await page.fill('input[name="password"]', 'invalid');
      await page.click('button[type="submit"]');

      // Assert
      const errorMessage = await page.locator('.error-message').textContent();
      expect(errorMessage).toBeDefined();
      expect(await page.locator('.error-message').getAttribute('role')).toBe(
        'alert'
      );
    });
  });
});
```

### Compliance Testing

#### Audit Trail Testing

```typescript
// tests/compliance/auth/authentication-compliance.test.ts
describe('Authentication Compliance', () => {
  let complianceTestSuite: ComplianceTestSuite;

  beforeEach(() => {
    complianceTestSuite = new ComplianceTestSuite();
  });

  describe('Audit Trail Compliance', () => {
    it('should log all authentication attempts', async () => {
      // Arrange
      const testCases = [
        { username: 'valid-user', success: true },
        { username: 'invalid-user', success: false },
        { username: 'locked-user', success: false },
      ];

      // Act
      const auditLogs = await Promise.all(
        testCases.map((testCase) =>
          complianceTestSuite.testAuthenticationLogging(testCase)
        )
      );

      // Assert
      auditLogs.forEach((log) => {
        expect(log.timestamp).toBeDefined();
        expect(log.user).toBeDefined();
        expect(log.action).toBe('authentication_attempt');
        expect(log.success).toBeDefined();
        expect(log.ipAddress).toBeDefined();
      });
    });

    it('should maintain audit log integrity', async () => {
      // Arrange
      const auditLogs = await createTestAuditLogs(100);

      // Act
      const result = await complianceTestSuite.testAuditLogIntegrity(auditLogs);

      // Assert
      expect(result.passed).toBe(true);
      expect(result.tamperDetected).toBe(false);
      expect(result.hashValid).toBe(true);
    });
  });

  describe('Data Retention Compliance', () => {
    it('should comply with data retention policies', async () => {
      // Arrange
      const retentionPolicy = {
        sessionData: '30 days',
        auditLogs: '7 years',
        failedAttempts: '90 days',
      };

      // Act
      const result =
        await complianceTestSuite.testDataRetention(retentionPolicy);

      // Assert
      expect(result.passed).toBe(true);
      expect(result.sessionDataRetention).toBe(true);
      expect(result.auditLogRetention).toBe(true);
      expect(result.failedAttemptsRetention).toBe(true);
    });
  });
});
```

### CLI Testing

#### Command Line Testing

```typescript
// tests/cli/auth/authentication-cli.test.ts
describe('Authentication CLI', () => {
  let cliTestSuite: CLITestSuite;

  beforeEach(() => {
    cliTestSuite = new CLITestSuite();
  });

  describe('Login Command', () => {
    it('should authenticate via CLI', async () => {
      // Arrange
      const credentials = { username: 'test-user', password: 'test-pass' };

      // Act
      const result = await cliTestSuite.testLoginCommand(credentials);

      // Assert
      expect(result.success).toBe(true);
      expect(result.sessionToken).toBeDefined();
      expect(result.userRole).toBe('contributor');
    });

    it('should handle invalid credentials gracefully', async () => {
      // Arrange
      const invalidCredentials = { username: 'invalid', password: 'invalid' };

      // Act
      const result = await cliTestSuite.testLoginCommand(invalidCredentials);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('Invalid credentials');
    });
  });

  describe('Logout Command', () => {
    it('should logout successfully', async () => {
      // Arrange
      const session = await cliTestSuite.createTestSession();

      // Act
      const result = await cliTestSuite.testLogoutCommand(session.token);

      // Assert
      expect(result.success).toBe(true);
      expect(result.sessionInvalidated).toBe(true);
    });
  });
});
```

---

## 🛠️ Future Enhancements

- Support **dedicated CivicPress user system** (with local accounts,
  passwordless login, session tokens)
- Add **federated identity** across towns via civic keyrings or public profiles
- Enable **anonymous draft mode** using commit-reveal or zero-knowledge proof
  patterns
- Support **multi-provider login** (e.g., GitHub, GitLab, municipal SSO, etc.)
- Integrate **optional email verification or civic ID verification** for
  clerk-grade access

## 🔗 Related Specs

- [`permissions.md`](./permissions.md) — Role-based access control
- [`roles.yml.md`](./roles.yml.md) — Default civic roles and responsibilities
- [`signatures.md`](./signatures.md) — Digital signature authentication
- [`git-policy.md`](./git-policy.md) — Git-based identity verification

---

## 📅 History

- Drafted: 2025-07-04
- Updated: 2025-07-04
