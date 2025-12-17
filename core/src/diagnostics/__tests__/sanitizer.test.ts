/**
 * Unit Tests for Data Sanitization Utilities
 */

import { describe, it, expect } from 'vitest';
import {
  redactSensitiveData,
  sanitizeDiagnosticReport,
  sanitizeComponentResult,
  sanitizeCheckResult,
  sanitizeIssue,
  sanitizeParams,
} from '../utils/sanitizer.js';
import {
  DiagnosticReport,
  ComponentResult,
  CheckResult,
  DiagnosticIssue,
} from '../types.js';

describe('Data Sanitization', () => {
  describe('redactSensitiveData', () => {
    it('should redact password fields', () => {
      const data = {
        username: 'test',
        password: 'secret123',
        email: 'test@example.com',
      };

      const redacted = redactSensitiveData(data);

      expect(redacted.password).toBe('[REDACTED]');
      expect(redacted.username).toBe('test');
      expect(redacted.email).toBe('test@example.com');
    });

    it('should redact API keys', () => {
      const data = {
        apiKey: 'sk_live_1234567890abcdef1234567890abcdef',
        token: 'bearer_token_here',
      };

      const redacted = redactSensitiveData(data);

      expect(redacted.apiKey).toBe('[REDACTED]');
      expect(redacted.token).toBe('[REDACTED]');
    });

    it('should redact JWT tokens in strings', () => {
      const data = {
        message:
          'Token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U',
      };

      const redacted = redactSensitiveData(data);

      expect(redacted.message).toContain('[JWT_TOKEN]');
      expect(redacted.message).not.toContain(
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'
      );
    });

    it('should handle nested objects', () => {
      const data = {
        config: {
          database: {
            password: 'secret',
            host: 'localhost',
          },
        },
      };

      const redacted = redactSensitiveData(data);

      expect(redacted.config.database.password).toBe('[REDACTED]');
      expect(redacted.config.database.host).toBe('localhost');
    });

    it('should handle arrays', () => {
      const data = [
        { name: 'item1', password: 'secret1' },
        { name: 'item2', password: 'secret2' },
      ];

      const redacted = redactSensitiveData(data);

      expect(redacted[0].password).toBe('[REDACTED]');
      expect(redacted[1].password).toBe('[REDACTED]');
    });

    it('should handle null and undefined', () => {
      expect(redactSensitiveData(null)).toBeNull();
      expect(redactSensitiveData(undefined)).toBeUndefined();
    });
  });

  describe('sanitizeCheckResult', () => {
    it('should redact sensitive data in details', () => {
      const result: CheckResult = {
        name: 'test-check',
        status: 'pass',
        details: {
          password: 'secret',
          apiKey: 'key123',
        },
      };

      const sanitized = sanitizeCheckResult(result);

      expect(sanitized.details?.password).toBe('[REDACTED]');
      expect(sanitized.details?.apiKey).toBe('[REDACTED]');
    });

    it('should remove stack traces from errors', () => {
      const result: CheckResult = {
        name: 'test-check',
        status: 'error',
        error: {
          category: 'database',
          severity: 'high',
          actionable: false,
          recoverable: true,
          retryable: true,
          message: 'Error occurred',
          stack: 'Error: ...\n  at ...',
        },
      };

      const sanitized = sanitizeCheckResult(result);

      expect(sanitized.error?.stack).toBeUndefined();
    });
  });

  describe('sanitizeIssue', () => {
    it('should redact sensitive data in issue details', () => {
      const issue: DiagnosticIssue = {
        id: 'test-issue',
        severity: 'high',
        component: 'database',
        check: 'test-check',
        message: 'Issue found',
        autoFixable: false,
        details: {
          password: 'secret',
        },
      };

      const sanitized = sanitizeIssue(issue);

      expect(sanitized.details?.password).toBe('[REDACTED]');
    });
  });

  describe('sanitizeComponentResult', () => {
    it('should sanitize all checks and issues', () => {
      const result: ComponentResult = {
        component: 'database',
        status: 'healthy',
        checks: [
          {
            name: 'check1',
            status: 'pass',
            details: { password: 'secret' },
          },
        ],
        issues: [
          {
            id: 'issue1',
            severity: 'low',
            component: 'database',
            check: 'check1',
            message: 'Issue',
            autoFixable: false,
            details: { apiKey: 'key123' },
          },
        ],
        duration: 100,
        timestamp: new Date().toISOString(),
      };

      const sanitized = sanitizeComponentResult(result);

      expect(sanitized.checks[0].details?.password).toBe('[REDACTED]');
      expect(sanitized.issues[0].details?.apiKey).toBe('[REDACTED]');
    });
  });

  describe('sanitizeDiagnosticReport', () => {
    it('should sanitize all components in report', () => {
      const report: DiagnosticReport = {
        runId: 'test-run',
        timestamp: new Date().toISOString(),
        overallStatus: 'healthy',
        components: [
          {
            component: 'database',
            status: 'healthy',
            checks: [],
            issues: [],
            duration: 100,
            timestamp: new Date().toISOString(),
          },
        ],
        summary: {
          totalChecks: 1,
          passed: 1,
          warnings: 0,
          errors: 0,
          skipped: 0,
        },
        issues: [],
        recommendations: [],
        duration: 100,
      };

      const sanitized = sanitizeDiagnosticReport(report);

      expect(sanitized.components).toHaveLength(1);
      expect(sanitized.runId).toBe('test-run');
    });
  });

  describe('sanitizeParams', () => {
    it('should sanitize request parameters', () => {
      const params = {
        component: 'database',
        password: 'secret',
        apiKey: 'key123',
      };

      const sanitized = sanitizeParams(params);

      expect(sanitized.password).toBe('[REDACTED]');
      expect(sanitized.apiKey).toBe('[REDACTED]');
      expect(sanitized.component).toBe('database');
    });
  });
});
