/**
 * Unit Tests for Base Diagnostic Checker
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BaseDiagnosticChecker } from '../base-checker.js';
import { Logger } from '../../utils/logger.js';
import { CheckResult, DiagnosticIssue, FixResult } from '../types.js';

// Concrete implementation for testing
class TestChecker extends BaseDiagnosticChecker {
  name = 'test-check';
  component = 'test-component';

  async check(): Promise<CheckResult> {
    return this.createSuccessResult('Test passed');
  }
}

describe('BaseDiagnosticChecker', () => {
  let checker: TestChecker;
  let mockLogger: Logger;

  beforeEach(() => {
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as any;

    checker = new TestChecker(mockLogger);
  });

  describe('createSuccessResult', () => {
    it('should create a successful check result', () => {
      const result = checker['createSuccessResult']('Test passed', {
        detail: 'info',
      });

      expect(result).toMatchObject({
        name: 'test-check',
        status: 'pass',
        message: 'Test passed',
        details: { detail: 'info' },
      });
    });

    it('should use default message if not provided', () => {
      const result = checker['createSuccessResult']();

      expect(result.message).toBe('test-check check passed');
    });
  });

  describe('createWarningResult', () => {
    it('should create a warning check result', () => {
      const result = checker['createWarningResult']('Warning message', {
        detail: 'info',
      });

      expect(result).toMatchObject({
        name: 'test-check',
        status: 'warning',
        message: 'Warning message',
        details: { detail: 'info' },
      });
    });
  });

  describe('createErrorResult', () => {
    it('should create an error check result', () => {
      const error = new Error('Test error');
      (error as any).code = 'TEST_ERROR';

      const result = checker['createErrorResult']('Error occurred', error, {
        detail: 'info',
      });

      expect(result).toMatchObject({
        name: 'test-check',
        status: 'error',
        message: 'Error occurred',
        details: { detail: 'info' },
      });
      expect(result.error).toMatchObject({
        message: 'Test error',
        code: 'TEST_ERROR',
      });
    });

    it('should create error result without error object', () => {
      const result = checker['createErrorResult']('Error occurred');

      expect(result.status).toBe('error');
      expect(result.message).toBe('Error occurred');
    });
  });

  describe('createIssue', () => {
    it('should create a diagnostic issue', () => {
      const issue = checker['createIssue']('high', 'Issue message', {
        autoFixable: true,
        fix: {
          description: 'Fix description',
          command: 'civic fix',
          requiresConfirmation: false,
        },
        recommendations: ['Recommendation 1'],
        details: { detail: 'info' },
      });

      expect(issue).toMatchObject({
        severity: 'high',
        component: 'test-component',
        check: 'test-check',
        message: 'Issue message',
        autoFixable: true,
        fix: {
          description: 'Fix description',
          command: 'civic fix',
          requiresConfirmation: false,
        },
        recommendations: ['Recommendation 1'],
        details: { detail: 'info' },
      });
      expect(issue.id).toContain('test-component:test-check:');
    });

    it('should default requiresConfirmation to true', () => {
      const issue = checker['createIssue']('medium', 'Issue', {
        fix: {
          description: 'Fix',
        },
      });

      expect(issue.fix?.requiresConfirmation).toBe(true);
    });
  });

  describe('createFixResult', () => {
    it('should create a successful fix result', () => {
      const result = checker['createFixResult'](
        'issue-1',
        true,
        'Fix applied',
        {
          backupId: 'backup-123',
          rollbackAvailable: true,
          duration: 100,
        }
      );

      expect(result).toMatchObject({
        issueId: 'issue-1',
        success: true,
        message: 'Fix applied',
        backupId: 'backup-123',
        rollbackAvailable: true,
        duration: 100,
      });
    });

    it('should create a failed fix result', () => {
      const error = new Error('Fix failed');
      const result = checker['createFixResult'](
        'issue-1',
        false,
        'Fix failed',
        {
          error,
        }
      );

      expect(result).toMatchObject({
        issueId: 'issue-1',
        success: false,
        message: 'Fix failed',
        error,
      });
    });
  });

  describe('autoFix', () => {
    it('should return empty array by default', async () => {
      const issues: DiagnosticIssue[] = [
        {
          id: 'issue-1',
          severity: 'low',
          component: 'test-component',
          check: 'test-check',
          message: 'Issue',
          autoFixable: false,
        },
      ];

      const results = await checker.autoFix(issues);

      expect(results).toEqual([]);
      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });
});
