# 🧪 CivicPress Spec: `testing-framework.md`

---
version: 1.0.0
status: stable
created: '2025-07-15'
updated: '2025-07-15'
deprecated: false
sunset_date: null
additions:

- comprehensive testing standards
- tools
- patterns
- utilities covering unit
- integration
- E2E
- security
- performance
- and accessibility testing
compatibility:
  min_civicpress: 1.0.0
  max_civicpress: 'null'
  dependencies:
  - 'plugins.md: >=1.5.0'
  - 'auth.md: >=1.2.0'
  - 'permissions.md: >=1.1.0'
authors:
- Sophie Germain <sophie@civic-press.org>
reviewers:
- Ada Lovelace
- Irène Joliot-Curie

---

## 📛 Name

Testing Framework & Quality Assurance

## 🎯 Purpose

Establish comprehensive testing standards, patterns, and frameworks for
CivicPress development. This spec defines testing strategies, tools, and best
practices to ensure code quality, security, and reliability across all
CivicPress modules.

---

## 🧩 Scope & Responsibilities

✅ Responsibilities:

- Define standardized testing patterns and frameworks
- Establish testing utilities and mock systems
- Document testing strategies for different module types
- Provide security and performance testing guidance
- Create testing templates and best practices

❌ Out of Scope:

- Third-party testing tool integration
- Continuous integration pipeline implementation

---

## 🏗️ Testing Architecture

### Testing Pyramid

```
                    E2E Tests (10%)
                   ┌─────────────────┐
                   │   User Stories  │
                   │   Workflows     │
                   │   Accessibility │
                   └─────────────────┘

              Integration Tests (20%)
             ┌─────────────────────────┐
             │   Module Integration   │
             │   API Endpoints        │
             │   Database Operations  │
             └─────────────────────────┘

         Unit Tests (70%)
        ┌───────────────────────────────┐
        │   Individual Functions       │
        │   Component Logic            │
        │   Utility Methods            │
        └───────────────────────────────┘
```

### Testing Layers

| Layer             | Purpose                              | Tools               | Coverage Target |
| ----------------- | ------------------------------------ | ------------------- | --------------- |
| **Unit**          | Test individual functions/components | Jest, Vitest        | 80%+            |
| **Integration**   | Test module interactions             | Jest, Supertest     | 60%+            |
| **E2E**           | Test complete user workflows         | Playwright, Cypress | 40%+            |
| **Security**      | Test security vulnerabilities        | OWASP ZAP, Jest     | 90%+            |
| **Performance**   | Test performance under load          | Artillery, k6       | 50%+            |
| **Accessibility** | Test WCAG compliance                 | axe-core, Jest      | 100%            |

---

## 🛠️ Testing Framework Setup

### Core Testing Dependencies

```json
{
  "devDependencies": {
    "jest": "^29.0.0",
    "vitest": "^1.0.0",
    "@types/jest": "^29.0.0",
    "supertest": "^6.0.0",
    "@playwright/test": "^1.40.0",
    "axe-core": "^4.8.0",
    "artillery": "^2.0.0",
    "k6": "^0.47.0",
    "owasp-zap": "^2.14.0",
    "msw": "^2.0.0",
    "faker": "^8.0.0",
    "testcontainers": "^10.0.0"
  }
}
```

### Jest Configuration

```javascript
// jest.config.js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx,js,jsx}',
    '!src/**/*.d.ts',
    '!src/**/*.test.{ts,tsx,js,jsx}',
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  testMatch: [
    '<rootDir>/tests/**/*.test.{ts,tsx,js,jsx}',
    '<rootDir>/src/**/*.test.{ts,tsx,js,jsx}',
  ],
  moduleNameMapping: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@tests/(.*)$': '<rootDir>/tests/$1',
  },
};
```

### Test Setup Utilities

```typescript
// tests/setup.ts
import { jest } from '@jest/globals';
import { setupServer } from 'msw/node';
import { rest } from 'msw';
import { CivicPressTestUtils } from './utils/civicpress-test-utils';

// Global test setup
beforeAll(async () => {
  // Initialize test database
  await CivicPressTestUtils.initializeTestDB();

  // Setup MSW for API mocking
  const server = setupServer(
    rest.get('/api/records', (req, res, ctx) => {
      return res(ctx.json([]));
    })
  );
  server.listen();
});

afterAll(async () => {
  await CivicPressTestUtils.cleanupTestDB();
});

// Global test utilities
global.testUtils = CivicPressTestUtils;
```

---

## 🧪 Testing Patterns & Utilities

### CivicPress Test Utilities

```typescript
// tests/utils/civicpress-test-utils.ts
export class CivicPressTestUtils {
  private static testDB: any;
  private static mockAPI: MockCivicPressAPI;

  static async initializeTestDB(): Promise<void> {
    this.testDB = await createTestDatabase();
    this.mockAPI = new MockCivicPressAPI(this.testDB);
  }

  static async cleanupTestDB(): Promise<void> {
    if (this.testDB) {
      await this.testDB.destroy();
    }
  }

  // Record testing utilities
  static async createTestRecord(data: Partial<RecordData>): Promise<Record> {
    return this.mockAPI.records.create({
      type: 'test-record',
      title: 'Test Record',
      status: 'draft',
      ...data,
    });
  }

  static async createTestUser(role: string = 'contributor'): Promise<User> {
    return this.mockAPI.users.create({
      username: `test-user-${Date.now()}`,
      role,
      email: `test-${Date.now()}@example.com`,
    });
  }

  // Workflow testing utilities
  static async triggerWorkflow(workflowName: string, data: any): Promise<void> {
    await this.mockAPI.hooks.emit(`onWorkflowTriggered`, {
      workflow: workflowName,
      data,
    });
  }

  // Security testing utilities
  static async testPermission(
    user: User,
    action: string,
    resource: string
  ): Promise<boolean> {
    return this.mockAPI.permissions.check(user.id, action, resource);
  }

  // Performance testing utilities
  static async measurePerformance(
    fn: () => Promise<any>
  ): Promise<PerformanceMetrics> {
    const start = performance.now();
    const result = await fn();
    const duration = performance.now() - start;

    return {
      duration,
      result,
      timestamp: new Date(),
    };
  }
}
```

### Mock APIs for Testing

```typescript
// tests/mocks/civicpress-api.mock.ts
export class MockCivicPressAPI implements CivicPressAPI {
  private records: Map<string, Record> = new Map();
  private users: Map<string, User> = new Map();
  private config: Map<string, any> = new Map();
  private hooks: HookData[] = [];

  // Record management
  records = {
    create: async (data: RecordData): Promise<Record> => {
      const record: Record = {
        id: crypto.randomUUID(),
        created: new Date(),
        updated: new Date(),
        ...data,
      };
      this.records.set(record.id, record);
      return record;
    },

    find: async (query: RecordQuery): Promise<Record[]> => {
      const records = Array.from(this.records.values());
      return records.filter((record) => this.matchesQuery(record, query));
    },

    update: async (id: string, data: Partial<RecordData>): Promise<Record> => {
      const record = this.records.get(id);
      if (!record) {
        throw new Error('Record not found');
      }

      const updatedRecord = { ...record, ...data, updated: new Date() };
      this.records.set(id, updatedRecord);
      return updatedRecord;
    },

    delete: async (id: string): Promise<void> => {
      if (!this.records.has(id)) {
        throw new Error('Record not found');
      }
      this.records.delete(id);
    },
  };

  // User management
  users = {
    create: async (data: UserData): Promise<User> => {
      const user: User = {
        id: crypto.randomUUID(),
        created: new Date(),
        ...data,
      };
      this.users.set(user.id, user);
      return user;
    },

    find: async (query: UserQuery): Promise<User[]> => {
      const users = Array.from(this.users.values());
      return users.filter((user) => this.matchesUserQuery(user, query));
    },
  };

  // Configuration management
  config = {
    get: async (key: string): Promise<any> => {
      return this.config.get(key);
    },

    set: async (key: string, value: any): Promise<void> => {
      this.config.set(key, value);
    },

    delete: async (key: string): Promise<void> => {
      this.config.delete(key);
    },
  };

  // Hook system
  hooks = {
    emit: async (event: string, data?: any): Promise<void> => {
      this.hooks.push({ event, data, timestamp: new Date() });
    },

    on: (event: string, handler: (data: any) => void): void => {
      // Mock hook registration
    },
  };

  // Permission system
  permissions = {
    check: async (
      userId: string,
      action: string,
      resource: string
    ): Promise<boolean> => {
      const user = this.users.get(userId);
      if (!user) return false;

      // Mock permission logic based on user role
      const rolePermissions = {
        admin: ['*'],
        mayor: ['read:*', 'write:records', 'approve:*'],
        clerk: ['read:*', 'write:records'],
        contributor: ['read:public', 'write:drafts'],
      };

      const permissions = rolePermissions[user.role] || [];
      return (
        permissions.includes('*') ||
        permissions.includes(`${action}:${resource}`)
      );
    },
  };

  private matchesQuery(record: Record, query: RecordQuery): boolean {
    for (const [key, value] of Object.entries(query)) {
      if (record[key] !== value) {
        return false;
      }
    }
    return true;
  }

  private matchesUserQuery(user: User, query: UserQuery): boolean {
    for (const [key, value] of Object.entries(query)) {
      if (user[key] !== value) {
        return false;
      }
    }
    return true;
  }
}
```

---

## 🔒 Security Testing Framework

### Security Test Patterns

```typescript
// tests/security/security-test-suite.ts
export class SecurityTestSuite {
  private api: CivicPressAPI;
  private testUtils: CivicPressTestUtils;

  constructor(api: CivicPressAPI, testUtils: CivicPressTestUtils) {
    this.api = api;
    this.testUtils = testUtils;
  }

  // Authentication testing
  async testAuthentication(): Promise<SecurityTestResult[]> {
    const results: SecurityTestResult[] = [];

    // Test invalid credentials
    results.push(await this.testInvalidCredentials());

    // Test session management
    results.push(await this.testSessionManagement());

    // Test role-based access
    results.push(await this.testRoleBasedAccess());

    // Test permission escalation
    results.push(await this.testPermissionEscalation());

    return results;
  }

  // Input validation testing
  async testInputValidation(): Promise<SecurityTestResult[]> {
    const results: SecurityTestResult[] = [];

    // Test SQL injection
    results.push(await this.testSQLInjection());

    // Test XSS attacks
    results.push(await this.testXSSAttacks());

    // Test CSRF attacks
    results.push(await this.testCSRFAttacks());

    // Test file upload vulnerabilities
    results.push(await this.testFileUploadVulnerabilities());

    return results;
  }

  // Data protection testing
  async testDataProtection(): Promise<SecurityTestResult[]> {
    const results: SecurityTestResult[] = [];

    // Test data encryption
    results.push(await this.testDataEncryption());

    // Test PII handling
    results.push(await this.testPIIHandling());

    // Test audit logging
    results.push(await this.testAuditLogging());

    // Test data retention
    results.push(await this.testDataRetention());

    return results;
  }

  private async testInvalidCredentials(): Promise<SecurityTestResult> {
    try {
      await this.api.auth.login('invalid', 'password');
      return {
        test: 'Invalid Credentials',
        passed: false,
        message: 'Should reject invalid credentials',
      };
    } catch (error) {
      return {
        test: 'Invalid Credentials',
        passed: true,
        message: 'Correctly rejected invalid credentials',
      };
    }
  }

  private async testSQLInjection(): Promise<SecurityTestResult> {
    const maliciousInput = "'; DROP TABLE records; --";

    try {
      await this.api.records.find({ title: maliciousInput });
      return {
        test: 'SQL Injection',
        passed: false,
        message: 'Vulnerable to SQL injection',
      };
    } catch (error) {
      return {
        test: 'SQL Injection',
        passed: true,
        message: 'Protected against SQL injection',
      };
    }
  }

  // Additional security test methods...
}

export interface SecurityTestResult {
  test: string;
  passed: boolean;
  message: string;
  details?: any;
}
```

### OWASP Testing Integration

```typescript
// tests/security/owasp-test-suite.ts
export class OWASPTestSuite {
  // OWASP Top 10 Testing
  async testOWASPTop10(): Promise<OWASPTestResult[]> {
    return [
      await this.testBrokenAuthentication(),
      await this.testBrokenAccessControl(),
      await this.testDataExposure(),
      await this.testXMLExternalEntities(),
      await this.testBrokenFunctionLevelAuthorization(),
      await this.testSecurityMisconfiguration(),
      await this.testCrossSiteScripting(),
      await this.testInsecureDeserialization(),
      await this.testUsingComponentsWithKnownVulnerabilities(),
      await this.testInsufficientLoggingAndMonitoring(),
    ];
  }

  private async testBrokenAuthentication(): Promise<OWASPTestResult> {
    // Test authentication bypass techniques
    const tests = [
      this.testWeakPasswords(),
      this.testSessionHijacking(),
      this.testBruteForceProtection(),
      this.testMultiFactorAuthentication(),
    ];

    const results = await Promise.all(tests);
    const passed = results.every((r) => r.passed);

    return {
      category: 'A02:2021 - Broken Authentication',
      passed,
      tests: results,
      recommendations: passed
        ? []
        : [
            'Implement strong password policies',
            'Add rate limiting for login attempts',
            'Enable multi-factor authentication',
            'Use secure session management',
          ],
    };
  }

  // Additional OWASP test methods...
}

export interface OWASPTestResult {
  category: string;
  passed: boolean;
  tests: SecurityTestResult[];
  recommendations: string[];
}
```

---

## ⚡ Performance Testing Framework

### Load Testing Patterns

```typescript
// tests/performance/load-test-suite.ts
export class LoadTestSuite {
  private api: CivicPressAPI;
  private metrics: PerformanceMetrics[] = [];

  constructor(api: CivicPressAPI) {
    this.api = api;
  }

  // Basic load testing
  async testBasicLoad(
    concurrentUsers: number,
    duration: number
  ): Promise<LoadTestResult> {
    const startTime = Date.now();
    const requests: Promise<any>[] = [];

    // Simulate concurrent users
    for (let i = 0; i < concurrentUsers; i++) {
      requests.push(this.simulateUserWorkflow(i));
    }

    const results = await Promise.all(requests);
    const endTime = Date.now();

    return this.analyzeLoadTestResults(results, startTime, endTime);
  }

  // Stress testing
  async testStressLoad(
    maxUsers: number,
    rampUpTime: number
  ): Promise<StressTestResult> {
    const results: PerformanceMetrics[] = [];
    const userIncrement = maxUsers / (rampUpTime / 1000); // Users per second

    for (let users = 1; users <= maxUsers; users += userIncrement) {
      const result = await this.testBasicLoad(users, 1000);
      results.push(result);
    }

    return this.analyzeStressTestResults(results);
  }

  // Spike testing
  async testSpikeLoad(
    baseUsers: number,
    spikeUsers: number,
    spikeDuration: number
  ): Promise<SpikeTestResult> {
    // Baseline load
    const baseline = await this.testBasicLoad(baseUsers, 5000);

    // Spike load
    const spike = await this.testBasicLoad(spikeUsers, spikeDuration);

    // Return to baseline
    const recovery = await this.testBasicLoad(baseUsers, 5000);

    return {
      baseline,
      spike,
      recovery,
      analysis: this.analyzeSpikeTest(baseline, spike, recovery),
    };
  }

  private async simulateUserWorkflow(
    userId: number
  ): Promise<PerformanceMetrics> {
    const workflow = [
      () => this.api.auth.login(`user${userId}`, 'password'),
      () => this.api.records.find({ type: 'bylaw' }),
      () =>
        this.api.records.create({ type: 'feedback', content: 'Test feedback' }),
      () =>
        this.api.notifications.send({
          type: 'test',
          message: 'Test notification',
        }),
    ];

    const startTime = performance.now();
    const results = [];

    for (const step of workflow) {
      const stepStart = performance.now();
      try {
        const result = await step();
        const stepDuration = performance.now() - stepStart;
        results.push({ success: true, duration: stepDuration, result });
      } catch (error) {
        const stepDuration = performance.now() - stepStart;
        results.push({ success: false, duration: stepDuration, error });
      }
    }

    const totalDuration = performance.now() - startTime;
    return {
      userId,
      totalDuration,
      steps: results,
      success: results.every((r) => r.success),
    };
  }

  private analyzeLoadTestResults(
    results: PerformanceMetrics[],
    startTime: number,
    endTime: number
  ): LoadTestResult {
    const successful = results.filter((r) => r.success);
    const failed = results.filter((r) => !r.success);

    const avgResponseTime =
      successful.reduce((sum, r) => sum + r.totalDuration, 0) /
      successful.length;
    const throughput = successful.length / ((endTime - startTime) / 1000);

    return {
      totalRequests: results.length,
      successfulRequests: successful.length,
      failedRequests: failed.length,
      successRate: successful.length / results.length,
      averageResponseTime: avgResponseTime,
      throughput: throughput,
      p95ResponseTime: this.calculatePercentile(
        successful.map((r) => r.totalDuration),
        95
      ),
      p99ResponseTime: this.calculatePercentile(
        successful.map((r) => r.totalDuration),
        99
      ),
    };
  }

  private calculatePercentile(values: number[], percentile: number): number {
    const sorted = values.sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[index];
  }
}

export interface LoadTestResult {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  successRate: number;
  averageResponseTime: number;
  throughput: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
}

export interface PerformanceMetrics {
  userId?: number;
  totalDuration: number;
  steps?: any[];
  success: boolean;
}
```

---

## ♿ Accessibility Testing Framework

### WCAG Compliance Testing

```typescript
// tests/accessibility/accessibility-test-suite.ts
export class AccessibilityTestSuite {
  private page: any; // Playwright page object

  constructor(page: any) {
    this.page = page;
  }

  // WCAG 2.1 AA Compliance Testing
  async testWCAGCompliance(): Promise<AccessibilityTestResult[]> {
    return [
      await this.testPerceivable(),
      await this.testOperable(),
      await this.testUnderstandable(),
      await this.testRobust(),
    ];
  }

  // Perceivable - Information and user interface components must be presentable
  private async testPerceivable(): Promise<AccessibilityTestResult> {
    const tests = [
      this.testColorContrast(),
      this.testTextAlternatives(),
      this.testKeyboardNavigation(),
      this.testScreenReaderCompatibility(),
    ];

    const results = await Promise.all(tests);
    const passed = results.every((r) => r.passed);

    return {
      principle: 'Perceivable',
      passed,
      tests: results,
      score: this.calculateScore(results),
    };
  }

  // Operable - User interface components and navigation must be operable
  private async testOperable(): Promise<AccessibilityTestResult> {
    const tests = [
      this.testKeyboardAccessibility(),
      this.testFocusManagement(),
      this.testTimingAdjustments(),
      this.testSeizurePrevention(),
    ];

    const results = await Promise.all(tests);
    const passed = results.every((r) => r.passed);

    return {
      principle: 'Operable',
      passed,
      tests: results,
      score: this.calculateScore(results),
    };
  }

  // Understandable - Information and operation of user interface must be understandable
  private async testUnderstandable(): Promise<AccessibilityTestResult> {
    const tests = [
      this.testReadableText(),
      this.testPredictableNavigation(),
      this.testInputAssistance(),
      this.testErrorIdentification(),
    ];

    const results = await Promise.all(tests);
    const passed = results.every((r) => r.passed);

    return {
      principle: 'Understandable',
      passed,
      tests: results,
      score: this.calculateScore(results),
    };
  }

  // Robust - Content must be robust enough to be interpreted by assistive technologies
  private async testRobust(): Promise<AccessibilityTestResult> {
    const tests = [
      this.testValidHTML(),
      this.testValidCSS(),
      this.testARIAUsage(),
      this.testCompatibility(),
    ];

    const results = await Promise.all(tests);
    const passed = results.every((r) => r.passed);

    return {
      principle: 'Robust',
      passed,
      tests: results,
      score: this.calculateScore(results),
    };
  }

  // Specific accessibility tests
  private async testColorContrast(): Promise<AccessibilityTestResult> {
    const contrastRatios = await this.page.evaluate(() => {
      const elements = document.querySelectorAll('*');
      const ratios = [];

      for (const element of elements) {
        const style = window.getComputedStyle(element);
        const backgroundColor = style.backgroundColor;
        const color = style.color;

        if (backgroundColor && color) {
          // Calculate contrast ratio (simplified)
          const ratio = this.calculateContrastRatio(backgroundColor, color);
          ratios.push({ element: element.tagName, ratio });
        }
      }

      return ratios;
    });

    const failingElements = contrastRatios.filter((r) => r.ratio < 4.5);
    const passed = failingElements.length === 0;

    return {
      test: 'Color Contrast',
      passed,
      details: {
        totalElements: contrastRatios.length,
        failingElements: failingElements.length,
        failingElementsList: failingElements,
      },
    };
  }

  private async testKeyboardNavigation(): Promise<AccessibilityTestResult> {
    // Test tab order
    const tabOrder = await this.page.evaluate(() => {
      const focusableElements = document.querySelectorAll(
        'a, button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      return Array.from(focusableElements).map((el) => ({
        tagName: el.tagName,
        text: el.textContent?.trim(),
        tabIndex: el.tabIndex,
      }));
    });

    // Test keyboard shortcuts
    await this.page.keyboard.press('Tab');
    const firstFocus = await this.page.evaluate(
      () => document.activeElement?.tagName
    );

    const passed = tabOrder.length > 0 && firstFocus;

    return {
      test: 'Keyboard Navigation',
      passed,
      details: {
        focusableElements: tabOrder.length,
        firstFocusElement: firstFocus,
      },
    };
  }

  private calculateScore(results: AccessibilityTestResult[]): number {
    const passed = results.filter((r) => r.passed).length;
    return (passed / results.length) * 100;
  }
}

export interface AccessibilityTestResult {
  principle?: string;
  test?: string;
  passed: boolean;
  tests?: AccessibilityTestResult[];
  score?: number;
  details?: any;
}
```

---

## 🔄 Integration Testing Framework

### Module Integration Testing

```typescript
// tests/integration/module-integration.test.ts
export class ModuleIntegrationTestSuite {
  private api: CivicPressAPI;
  private testUtils: CivicPressTestUtils;

  constructor(api: CivicPressAPI, testUtils: CivicPressTestUtils) {
    this.api = api;
    this.testUtils = testUtils;
  }

  // Test complete civic workflows
  async testCivicWorkflows(): Promise<IntegrationTestResult[]> {
    return [
      await this.testBylawApprovalWorkflow(),
      await this.testFeedbackProcessingWorkflow(),
      await this.testNotificationDeliveryWorkflow(),
      await this.testArchiveWorkflow(),
    ];
  }

  // Test API endpoint integration
  async testAPIEndpoints(): Promise<IntegrationTestResult[]> {
    return [
      await this.testRecordsAPI(),
      await this.testUsersAPI(),
      await this.testWorkflowsAPI(),
      await this.testNotificationsAPI(),
    ];
  }

  // Test database integration
  async testDatabaseIntegration(): Promise<IntegrationTestResult[]> {
    return [
      await this.testRecordPersistence(),
      await this.testUserPersistence(),
      await this.testAuditLogging(),
      await this.testDataIntegrity(),
    ];
  }

  private async testBylawApprovalWorkflow(): Promise<IntegrationTestResult> {
    const workflow = {
      name: 'Bylaw Approval Workflow',
      steps: [
        { name: 'Create Bylaw', action: () => this.createTestBylaw() },
        { name: 'Submit for Review', action: () => this.submitForReview() },
        { name: 'Council Review', action: () => this.councilReview() },
        { name: 'Mayor Approval', action: () => this.mayorApproval() },
        { name: 'Publish Bylaw', action: () => this.publishBylaw() },
      ],
    };

    const results = [];
    let success = true;

    for (const step of workflow.steps) {
      try {
        const result = await step.action();
        results.push({ step: step.name, success: true, result });
      } catch (error) {
        results.push({ step: step.name, success: false, error });
        success = false;
        break;
      }
    }

    return {
      test: workflow.name,
      passed: success,
      steps: results,
      duration: this.calculateWorkflowDuration(results),
    };
  }

  private async createTestBylaw(): Promise<Record> {
    const bylaw = await this.api.records.create({
      type: 'bylaw',
      title: 'Test Bylaw',
      content: 'This is a test bylaw for integration testing.',
      status: 'draft',
      author: 'test-clerk',
    });

    return bylaw;
  }

  private async submitForReview(): Promise<void> {
    // Simulate submitting for review
    await this.api.workflows.trigger('submit-for-review', {
      recordId: 'test-bylaw-id',
      reviewer: 'test-council-member',
    });
  }

  private async councilReview(): Promise<void> {
    // Simulate council review
    await this.api.workflows.trigger('council-review', {
      recordId: 'test-bylaw-id',
      approved: true,
      comments: 'Approved by council',
    });
  }

  private async mayorApproval(): Promise<void> {
    // Simulate mayor approval
    await this.api.workflows.trigger('mayor-approval', {
      recordId: 'test-bylaw-id',
      approved: true,
      signature: 'test-mayor-signature',
    });
  }

  private async publishBylaw(): Promise<void> {
    // Simulate publishing
    await this.api.records.publish('test-bylaw-id');
  }

  private calculateWorkflowDuration(steps: any[]): number {
    // Calculate total workflow duration
    return steps.reduce((total, step) => total + (step.duration || 0), 0);
  }
}

export interface IntegrationTestResult {
  test: string;
  passed: boolean;
  steps?: any[];
  duration?: number;
  error?: Error;
}
```

---

## 🧪 E2E Testing Framework

### User Workflow Testing

```typescript
// tests/e2e/user-workflows.test.ts
export class E2ETestSuite {
  private page: any; // Playwright page object
  private api: CivicPressAPI;

  constructor(page: any, api: CivicPressAPI) {
    this.page = page;
    this.api = api;
  }

  // Test complete user journeys
  async testUserJourneys(): Promise<E2ETestResult[]> {
    return [
      await this.testCitizenFeedbackJourney(),
      await this.testClerkRecordManagementJourney(),
      await this.testCouncilApprovalJourney(),
      await this.testMayorPublishingJourney(),
    ];
  }

  // Test accessibility compliance
  async testAccessibilityCompliance(): Promise<E2ETestResult[]> {
    return [
      await this.testScreenReaderCompatibility(),
      await this.testKeyboardNavigation(),
      await this.testColorBlindAccessibility(),
      await this.testMobilityAccessibility(),
    ];
  }

  // Test cross-browser compatibility
  async testCrossBrowserCompatibility(): Promise<E2ETestResult[]> {
    return [
      await this.testChromeCompatibility(),
      await this.testFirefoxCompatibility(),
      await this.testSafariCompatibility(),
      await this.testEdgeCompatibility(),
    ];
  }

  private async testCitizenFeedbackJourney(): Promise<E2ETestResult> {
    const journey = {
      name: 'Citizen Feedback Journey',
      steps: [
        {
          name: 'Navigate to Public Site',
          action: () => this.navigateToPublicSite(),
        },
        { name: 'Find Feedback Form', action: () => this.findFeedbackForm() },
        { name: 'Fill Feedback Form', action: () => this.fillFeedbackForm() },
        { name: 'Submit Feedback', action: () => this.submitFeedback() },
        {
          name: 'Receive Confirmation',
          action: () => this.receiveConfirmation(),
        },
      ],
    };

    const results = [];
    let success = true;

    for (const step of journey.steps) {
      try {
        const result = await step.action();
        results.push({ step: step.name, success: true, result });
      } catch (error) {
        results.push({ step: step.name, success: false, error });
        success = false;
        break;
      }
    }

    return {
      test: journey.name,
      passed: success,
      steps: results,
      screenshots: await this.captureScreenshots(results),
    };
  }

  private async navigateToPublicSite(): Promise<void> {
    await this.page.goto('http://localhost:3000');
    await this.page.waitForSelector('h1');
  }

  private async findFeedbackForm(): Promise<void> {
    await this.page.click('a[href="/feedback"]');
    await this.page.waitForSelector('form[data-testid="feedback-form"]');
  }

  private async fillFeedbackForm(): Promise<void> {
    await this.page.fill('input[name="name"]', 'Test Citizen');
    await this.page.fill('input[name="email"]', 'test@example.com');
    await this.page.fill(
      'textarea[name="feedback"]',
      'This is test feedback for E2E testing.'
    );
  }

  private async submitFeedback(): Promise<void> {
    await this.page.click('button[type="submit"]');
    await this.page.waitForSelector('.success-message');
  }

  private async receiveConfirmation(): Promise<void> {
    const message = await this.page.textContent('.success-message');
    if (!message?.includes('Thank you')) {
      throw new Error('Confirmation message not found');
    }
  }

  private async captureScreenshots(steps: any[]): Promise<string[]> {
    const screenshots = [];
    for (let i = 0; i < steps.length; i++) {
      const screenshot = await this.page.screenshot({
        path: `screenshots/step-${i + 1}.png`,
      });
      screenshots.push(screenshot);
    }
    return screenshots;
  }
}

export interface E2ETestResult {
  test: string;
  passed: boolean;
  steps?: any[];
  screenshots?: string[];
  error?: Error;
}
```

---

## 🔐 Security & Trust Considerations

### Testing Security

- All test data must be isolated and cleaned up after tests
- No production data should be used in testing
- Test credentials and secrets must be properly managed
- Security testing must not compromise system integrity
- Test results must be logged for audit purposes

### Performance Testing Security

- Load testing must not impact production systems
- Performance test data must be anonymized
- Test environments must be isolated from production
- Resource limits must be enforced during testing

### Accessibility Testing Compliance

- WCAG 2.1 AA compliance must be verified
- Accessibility testing must include assistive technologies
- Test results must be documented for compliance
- Regular accessibility audits must be performed

---

## 🛠️ Future Enhancements

- Continuous testing integration with CI/CD pipelines
- Automated test result reporting and analytics
- Test coverage visualization and dashboards
- Performance testing automation and monitoring
- Security testing automation and vulnerability scanning

## 🔗 Related Specs

- [`plugins.md`](./plugins.md) — Plugin testing frameworks
- [`security.md`](./security.md) — Security testing patterns
- [`accessibility.md`](./accessibility.md) — Accessibility testing requirements
- [`performance.md`](./performance.md) — Performance testing guidelines

---

## 📅 History

- Drafted: 2025-07-04
