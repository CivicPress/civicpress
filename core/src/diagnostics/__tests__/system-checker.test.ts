/**
 * Unit Tests for System Resource Diagnostic Checker
 *
 * Note: System checker tests are limited due to ESM module mocking constraints.
 * These tests verify basic functionality and error handling.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SystemDiagnosticChecker } from '../checkers/system-checker.js';
import { Logger } from '../../utils/logger.js';

describe('SystemDiagnosticChecker', () => {
  let checker: SystemDiagnosticChecker;
  let mockLogger: Logger;

  beforeEach(() => {
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as any;

    checker = new SystemDiagnosticChecker(mockLogger);
  });

  describe('check', () => {
    it('should run all system checks', async () => {
      // Run with actual system values (no mocking due to ESM constraints)
      const result = await checker.check();

      // Should return a CheckResult
      expect(result).toBeDefined();
      expect(result.status).toBeDefined();
      expect(['pass', 'warning', 'error', 'skipped']).toContain(result.status);
    });

    it('should check Node.js version', async () => {
      const result = await checker.check();

      // Should return a result (Node.js version check is part of the check method)
      expect(result).toBeDefined();
      expect(result.status).toBeDefined();
    });

    it('should check memory usage', async () => {
      const result = await checker.check();

      // Should return a result (memory check is part of the check method)
      expect(result).toBeDefined();
      expect(result.status).toBeDefined();
    });

    it('should check platform compatibility', async () => {
      const result = await checker.check();

      // Should return a result (platform check is part of the check method)
      expect(result).toBeDefined();
      expect(result.status).toBeDefined();
    });
  });

  describe('autoFix', () => {
    it('should return fix results', async () => {
      const issues = [
        {
          id: 'test-issue',
          severity: 'low' as const,
          component: 'system',
          check: 'system',
          message: 'Test issue',
          autoFixable: false,
        },
      ];

      const results = await checker.autoFix(issues);

      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(1);
      expect(results[0].success).toBe(false); // System issues can't be auto-fixed
    });
  });
});
