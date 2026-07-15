/**
 * Unit Tests for Diagnostic Service
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DiagnosticService } from '../diagnostic-service.js';
import { BaseDiagnosticChecker } from '../base-checker.js';
import { DatabaseService } from '../../database/database-service.js';
import { CentralConfigManager } from '../../config/central-config.js';
import { Logger } from '../../utils/logger.js';
import { AuditLogger } from '../../audit/audit-logger.js';
import { CheckResult } from '../types.js';

// Concrete checker for testing
class TestChecker extends BaseDiagnosticChecker {
  name = 'test-check';
  component = 'test-component';

  async check(): Promise<CheckResult> {
    return this.createSuccessResult('Test passed');
  }
}

describe('DiagnosticService', () => {
  let service: DiagnosticService;
  let mockDatabaseService: any;
  let mockConfigManager: any;
  let mockLogger: Logger;
  let mockAuditLogger: any;

  beforeEach(() => {
    mockDatabaseService = {
      // Mock database service methods
    };

    mockConfigManager = {
      // Mock config manager
    };

    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as any;

    mockAuditLogger = {
      log: vi.fn().mockResolvedValue(undefined),
    };

    service = new DiagnosticService({
      databaseService: mockDatabaseService as DatabaseService,
      configManager: mockConfigManager as CentralConfigManager,
      logger: mockLogger,
      auditLogger: mockAuditLogger as AuditLogger,
      dataDir: '/test/data',
    });
  });

  describe('checker registration', () => {
    it('should register a single checker', () => {
      const checker = new TestChecker();
      service.registerChecker(checker);

      // Checker should be registered (we can't directly access private map,
      // but we can verify by running diagnostics)
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Registered checker')
      );
    });

    it('should register multiple checkers', () => {
      const checkers = [new TestChecker(), new TestChecker()];

      service.registerCheckers(checkers);

      expect(mockLogger.debug).toHaveBeenCalledTimes(2);
    });
  });

  describe('runComponent', () => {
    it('should run diagnostics for a component', async () => {
      const checker = new TestChecker();
      service.registerChecker(checker);

      const result = await service.runComponent('test-component');

      expect(result).toMatchObject({
        component: 'test-component',
        status: 'healthy',
      });
      expect(result.checks).toHaveLength(1);
    });

    it('should return healthy status for component with no checkers', async () => {
      const result = await service.runComponent('non-existent');

      expect(result).toMatchObject({
        component: 'non-existent',
        status: 'healthy',
        checks: [],
        issues: [],
      });
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('should cache results', async () => {
      const checker = new TestChecker();
      service.registerChecker(checker);

      const result1 = await service.runComponent('test-component');
      const result2 = await service.runComponent('test-component');

      // Second call should be cached (same timestamp)
      expect(result1.timestamp).toBe(result2.timestamp);
    });
  });

  describe('runAll', () => {
    it('should run diagnostics for all components', async () => {
      const checker1 = new TestChecker();
      checker1.component = 'component1';
      const checker2 = new TestChecker();
      checker2.component = 'component2';

      service.registerCheckers([checker1, checker2]);

      const report = await service.runAll();

      expect(report).toMatchObject({
        overallStatus: 'healthy',
        components: expect.arrayContaining([
          expect.objectContaining({ component: 'component1' }),
          expect.objectContaining({ component: 'component2' }),
        ]),
      });
      expect(report.runId).toBeDefined();
      expect(report.timestamp).toBeDefined();
    });

    it('should filter components when specified', async () => {
      const checker1 = new TestChecker();
      checker1.component = 'component1';
      const checker2 = new TestChecker();
      checker2.component = 'component2';

      service.registerCheckers([checker1, checker2]);

      const report = await service.runAll({
        components: ['component1'],
      });

      expect(report.components).toHaveLength(1);
      expect(report.components[0].component).toBe('component1');
    });

    it('should calculate overall status from component results', async () => {
      // This would require checkers that produce errors/warnings
      // For now, we test the happy path
      const checker = new TestChecker();
      service.registerChecker(checker);

      const report = await service.runAll();

      expect(report.overallStatus).toBe('healthy');
    });

    it('should generate summary', async () => {
      const checker = new TestChecker();
      service.registerChecker(checker);

      const report = await service.runAll();

      expect(report.summary).toMatchObject({
        totalChecks: expect.any(Number),
        passed: expect.any(Number),
        warnings: expect.any(Number),
        errors: expect.any(Number),
        skipped: expect.any(Number),
      });
    });

    it('should sanitize sensitive fields out of the returned report', async () => {
      // Surfaced finding #1 from lint-followups: sanitizeDiagnosticReport
      // is now wired into runAll(). Verify that a sensitive value in a
      // checker's check-result.details survives as redacted on the way
      // out. The sanitizer's own tests cover redaction patterns
      // exhaustively (__tests__/sanitizer.test.ts); this test only
      // confirms the integration is wired.
      class SensitiveChecker extends BaseDiagnosticChecker {
        name = 'sensitive-check';
        component = 'sensitive-component';

        async check(): Promise<CheckResult> {
          return this.createWarningResult('Found suspicious config', {
            api_key: 'sk-live-PRIVATE-DO-NOT-LEAK',
            normal_field: 'public-value',
          });
        }
      }

      service.registerChecker(new SensitiveChecker());
      const report = await service.runAll({ components: ['sensitive-component'] });

      const component = report.components.find(
        (c) => c.component === 'sensitive-component'
      );
      expect(component).toBeDefined();
      const checkDetails = component!.checks[0]?.details as
        | Record<string, unknown>
        | undefined;
      expect(checkDetails).toBeDefined();
      expect(checkDetails!.api_key).toBe('[REDACTED]');
      // Non-sensitive fields pass through unchanged
      expect(checkDetails!.normal_field).toBe('public-value');
    });

    it('should audit log the run', async () => {
      const checker = new TestChecker();
      service.registerChecker(checker);

      await service.runAll({
        userId: 'test-user',
        requestId: 'test-request',
      });

      expect(mockAuditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'diagnose:run_all',
          outcome: 'success',
        })
      );
    });
  });

  describe('autoFix', () => {
    it('should attempt to fix issues', async () => {
      // This would require a checker with autoFix implementation
      // For now, we test the structure
      const issues: any[] = [];

      const results = await service.autoFix(issues);

      expect(results).toEqual([]);
    });

    // FA-CORE-014: a dryRun request must NOT invoke any checker's autoFix
    // (which mutates the DB via VACUUM/DDL) — it only previews.
    it('does not invoke checker autoFix when dryRun is set (FA-CORE-014)', async () => {
      const autoFixSpy = vi.fn().mockResolvedValue([
        {
          issueId: 'x',
          success: true,
          message: 'applied',
          rollbackAvailable: false,
          duration: 1,
        },
      ]);

      class FixableChecker extends BaseDiagnosticChecker {
        name = 'fixable-check';
        component = 'fixable-component';
        async check(): Promise<CheckResult> {
          return this.createSuccessResult('ok');
        }
        autoFix = autoFixSpy;
      }

      service.registerChecker(new FixableChecker());
      const issues: any[] = [
        {
          id: 'issue-1',
          severity: 'high',
          component: 'fixable-component',
          check: 'fixable-check',
          message: 'needs fixing',
          autoFixable: true,
          fix: { description: 'add missing column', requiresConfirmation: true },
        },
      ];

      const results = await service.autoFix(issues, { dryRun: true });

      expect(autoFixSpy).not.toHaveBeenCalled();
      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(true);
      expect(results[0].message).toContain('[dry-run]');
      expect(results[0].message).toContain('add missing column');
    });
  });

  describe('statistics', () => {
    it('should provide circuit breaker statistics', () => {
      const stats = service.getCircuitBreakerStats('test-check');

      expect(stats).toBeDefined();
    });

    it('should provide cache statistics', async () => {
      const stats = await service.getCacheStats();

      expect(stats).toMatchObject({
        size: expect.any(Number),
        maxSize: expect.any(Number),
        keys: expect.any(Array),
      });
    });
  });
});
