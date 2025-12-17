/**
 * Diagnostic Service
 *
 * Main orchestrator for diagnostic checks. Manages checkers, execution, caching,
 * and result aggregation.
 */

import {
  DiagnosticReport,
  ComponentResult,
  DiagnosticOptions,
  DiagnosticChecker,
  DiagnosticIssue,
  FixResult,
  FixOptions,
  DiagnosticStatus,
  CheckResult,
} from './types.js';
import { DatabaseService } from '../database/database-service.js';
import { SearchService } from '../search/search-service.js';
import { CentralConfigManager } from '../config/central-config.js';
import { Logger } from '../utils/logger.js';
import { AuditLogger } from '../audit/audit-logger.js';
import { DiagnosticCircuitBreaker } from './circuit-breaker.js';
import { ResourceMonitor } from './resource-monitor.js';
import { DiagnosticCache } from './cache.js';
import { CheckExecutor } from './check-executor.js';
import { sanitizeDiagnosticReport } from './utils/sanitizer.js';
import * as crypto from 'crypto';

export interface DiagnosticServiceOptions {
  databaseService: DatabaseService;
  searchService?: SearchService;
  configManager: CentralConfigManager;
  logger?: Logger;
  auditLogger?: AuditLogger;
  dataDir: string;
}

export class DiagnosticService {
  private databaseService: DatabaseService;
  private searchService?: SearchService;
  private configManager: CentralConfigManager;
  private logger: Logger;
  private auditLogger?: AuditLogger;
  private dataDir: string;

  private checkers: Map<string, DiagnosticChecker[]> = new Map();
  private circuitBreaker: DiagnosticCircuitBreaker;
  private cache: DiagnosticCache;
  private checkExecutor: CheckExecutor;
  private resourceMonitor?: ResourceMonitor;

  constructor(options: DiagnosticServiceOptions) {
    this.databaseService = options.databaseService;
    this.searchService = options.searchService;
    this.configManager = options.configManager;
    this.logger = options.logger || new Logger();
    this.auditLogger = options.auditLogger;
    this.dataDir = options.dataDir;

    // Initialize infrastructure
    this.circuitBreaker = new DiagnosticCircuitBreaker({
      logger: this.logger,
    });
    this.cache = new DiagnosticCache({
      logger: this.logger,
    });
    this.checkExecutor = new CheckExecutor({
      circuitBreaker: this.circuitBreaker,
      resourceMonitor: this.resourceMonitor,
      logger: this.logger,
    });
  }

  /**
   * Register a diagnostic checker
   */
  registerChecker(checker: DiagnosticChecker): void {
    const component = checker.component;
    if (!this.checkers.has(component)) {
      this.checkers.set(component, []);
    }
    this.checkers.get(component)!.push(checker);
    this.logger.debug(`Registered checker: ${component}:${checker.name}`);
  }

  /**
   * Register multiple checkers
   */
  registerCheckers(checkers: DiagnosticChecker[]): void {
    for (const checker of checkers) {
      this.registerChecker(checker);
    }
  }

  /**
   * Run all diagnostic checks
   */
  async runAll(options?: DiagnosticOptions): Promise<DiagnosticReport> {
    const runId = this.generateRunId();
    const startTime = Date.now();

    this.logger.info('Diagnostic run started', {
      runId,
      components: options?.components || 'all',
      operation: 'diagnose:run_all',
      timestamp: new Date().toISOString(),
    });

    try {
      // Start resource monitoring
      if (options?.resourceLimits) {
        this.resourceMonitor = new ResourceMonitor({
          maxMemory: options.resourceLimits.maxMemory,
          maxCpuTime: options.resourceLimits.maxCpuTime,
          logger: this.logger,
        });
        this.resourceMonitor.start();
        this.checkExecutor = new CheckExecutor({
          circuitBreaker: this.circuitBreaker,
          resourceMonitor: this.resourceMonitor,
          logger: this.logger,
        });
      }

      // Get components to check
      const componentsToCheck =
        options?.components || Array.from(this.checkers.keys());

      // Run checks for each component
      const componentResults: ComponentResult[] = [];
      const allIssues: DiagnosticIssue[] = [];

      for (const component of componentsToCheck) {
        const result = await this.runComponent(component, options);
        componentResults.push(result);
        allIssues.push(...result.issues);
      }

      // Calculate overall status
      const overallStatus = this.calculateOverallStatus(componentResults);

      // Aggregate summary
      const summary = this.aggregateSummary(componentResults);

      // Generate recommendations
      const recommendations = this.generateRecommendations(allIssues);

      const duration = Date.now() - startTime;

      const report: DiagnosticReport = {
        runId,
        timestamp: new Date().toISOString(),
        overallStatus,
        components: componentResults,
        summary,
        issues: allIssues,
        recommendations,
        duration,
      };

      // Stop resource monitoring
      if (this.resourceMonitor) {
        const metrics = this.resourceMonitor.stop();
        this.logger.debug('Resource usage', metrics);
      }

      // Cache results
      const cacheKey = this.cache.generateKey('all', options);
      this.cache.set(cacheKey, report);

      // Audit log
      if (this.auditLogger) {
        await this.auditLogger.log({
          source: options?.requestId ? 'api' : 'cli',
          actor: options?.userId ? { id: options.userId } : undefined,
          action: 'diagnose:run_all',
          target: { type: 'system' },
          outcome: overallStatus === 'error' ? 'failure' : 'success',
          message: `Diagnostic run completed: ${overallStatus}`,
          metadata: {
            runId,
            overallStatus,
            totalChecks: summary.totalChecks,
            issuesFound: allIssues.length,
            duration,
          },
        });
      }

      this.logger.info('Diagnostic run completed', {
        runId,
        duration,
        status: overallStatus,
        issuesFound: allIssues.length,
        operation: 'diagnose:run_all',
      });

      return report;
    } catch (error: any) {
      const duration = Date.now() - startTime;

      this.logger.error('Diagnostic run failed', {
        runId,
        duration,
        error: error.message,
        stack: error.stack,
        operation: 'diagnose:run_all',
      });

      // Audit log failure
      if (this.auditLogger) {
        await this.auditLogger.log({
          source: options?.requestId ? 'api' : 'cli',
          actor: options?.userId ? { id: options.userId } : undefined,
          action: 'diagnose:run_all',
          target: { type: 'system' },
          outcome: 'failure',
          message: `Diagnostic run failed: ${error.message}`,
          metadata: {
            runId,
            error: error.message,
            duration,
          },
        });
      }

      throw error;
    }
  }

  /**
   * Run diagnostics for a specific component
   */
  async runComponent(
    component: string,
    options?: DiagnosticOptions
  ): Promise<ComponentResult> {
    const startTime = Date.now();
    const checkers = this.checkers.get(component) || [];

    if (checkers.length === 0) {
      this.logger.warn(`No checkers registered for component: ${component}`);
      return {
        component,
        status: 'healthy',
        checks: [],
        issues: [],
        duration: 0,
        timestamp: new Date().toISOString(),
      };
    }

    // Check cache
    const cacheKey = this.cache.generateKey(component, options);
    const cached = this.cache.get(cacheKey);
    if (cached && typeof cached === 'object' && 'component' in cached) {
      this.logger.debug(`Cache hit for component: ${component}`);
      return cached as ComponentResult;
    }

    // Execute checks
    const checkResults = await this.checkExecutor.executeAll(
      checkers,
      options?.progressCallback,
      options
    );

    // Extract issues from check results
    const issues = this.extractIssues(component, checkResults);

    // Calculate component status
    const status = this.calculateComponentStatus(checkResults);

    const duration = Date.now() - startTime;

    const result: ComponentResult = {
      component,
      status,
      checks: checkResults,
      issues,
      duration,
      timestamp: new Date().toISOString(),
    };

    // Cache result
    this.cache.set(cacheKey, result);

    return result;
  }

  /**
   * Attempt to auto-fix issues
   */
  async autoFix(
    issues: DiagnosticIssue[],
    options?: FixOptions
  ): Promise<FixResult[]> {
    const results: FixResult[] = [];

    // Group issues by component
    const issuesByComponent = new Map<string, DiagnosticIssue[]>();
    for (const issue of issues) {
      if (!issuesByComponent.has(issue.component)) {
        issuesByComponent.set(issue.component, []);
      }
      issuesByComponent.get(issue.component)!.push(issue);
    }

    // Fix issues by component
    for (const [component, componentIssues] of issuesByComponent.entries()) {
      const checkers = this.checkers.get(component) || [];

      for (const checker of checkers) {
        if (checker.autoFix) {
          try {
            const fixResults = await checker.autoFix(componentIssues, options);
            results.push(...fixResults);
          } catch (error: any) {
            this.logger.error(
              `Auto-fix failed for ${component}:${checker.name}`,
              {
                error: error.message,
              }
            );
            results.push({
              issueId: componentIssues[0]?.id || 'unknown',
              success: false,
              message: `Auto-fix failed: ${error.message}`,
              rollbackAvailable: false,
              duration: 0,
              error: error,
            });
          }
        }
      }

      // Invalidate cache for this component after fixes
      this.cache.invalidate(new RegExp(`^${component}:`));
    }

    return results;
  }

  /**
   * Calculate overall status from component results
   */
  private calculateOverallStatus(results: ComponentResult[]): DiagnosticStatus {
    const weights = { critical: 10, high: 5, medium: 2, low: 1 };
    let totalWeight = 0;

    for (const result of results) {
      for (const issue of result.issues) {
        totalWeight += weights[issue.severity] || 0;
      }
    }

    if (totalWeight >= 10) return 'error';
    if (totalWeight >= 3) return 'warning';
    return 'healthy';
  }

  /**
   * Calculate component status from check results
   */
  private calculateComponentStatus(checks: CheckResult[]): DiagnosticStatus {
    const hasErrors = checks.some((c) => c.status === 'error');
    const hasWarnings = checks.some((c) => c.status === 'warning');

    if (hasErrors) return 'error';
    if (hasWarnings) return 'warning';
    return 'healthy';
  }

  /**
   * Aggregate summary from component results
   */
  private aggregateSummary(results: ComponentResult[]): {
    totalChecks: number;
    passed: number;
    warnings: number;
    errors: number;
    skipped: number;
  } {
    let totalChecks = 0;
    let passed = 0;
    let warnings = 0;
    let errors = 0;
    let skipped = 0;

    for (const result of results) {
      for (const check of result.checks) {
        totalChecks++;
        switch (check.status) {
          case 'pass':
            passed++;
            break;
          case 'warning':
            warnings++;
            break;
          case 'error':
          case 'timeout':
            errors++;
            break;
          case 'skipped':
            skipped++;
            break;
        }
      }
    }

    return { totalChecks, passed, warnings, errors, skipped };
  }

  /**
   * Extract issues from check results
   */
  private extractIssues(
    component: string,
    checks: CheckResult[]
  ): DiagnosticIssue[] {
    const issues: DiagnosticIssue[] = [];

    for (const check of checks) {
      // First, extract issues from check.details.issues (created by checkers)
      if (check.details && Array.isArray(check.details.issues)) {
        issues.push(...check.details.issues);
      }

      // Also check if the overall check result has issues in its details
      // (some checkers store issues in the overall result's details.issues)
      if (
        check.details &&
        Array.isArray(check.details.issues) &&
        check.details.issues.length > 0
      ) {
        // Already handled above
      } else if (
        check.details &&
        Array.isArray((check.details as any).issues)
      ) {
        // Fallback: check if details itself has an issues array
        issues.push(...(check.details as any).issues);
      }

      // If no issues in details but check failed, create a generic issue
      if (
        (check.status === 'error' || check.status === 'warning') &&
        (!check.details ||
          !Array.isArray(check.details.issues) ||
          check.details.issues.length === 0)
      ) {
        // Only create generic issue if we haven't already extracted specific issues
        const hasSpecificIssues = issues.some((i) => i.check === check.name);
        if (!hasSpecificIssues) {
          issues.push({
            id: `${component}:${check.name}:${Date.now()}`,
            severity: check.status === 'error' ? 'high' : 'medium',
            component,
            check: check.name,
            message: check.message || `${check.name} check failed`,
            details: check.details,
            autoFixable: false, // Will be set by individual checkers
          });
        }
      }
    }

    return issues;
  }

  /**
   * Generate recommendations from issues
   */
  private generateRecommendations(issues: DiagnosticIssue[]): string[] {
    const recommendations = new Set<string>();

    for (const issue of issues) {
      if (issue.recommendations) {
        for (const rec of issue.recommendations) {
          recommendations.add(rec);
        }
      }
    }

    return Array.from(recommendations);
  }

  /**
   * Generate unique run ID
   */
  private generateRunId(): string {
    return `diag_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  }

  /**
   * Get circuit breaker statistics
   */
  getCircuitBreakerStats(checkName?: string): any {
    if (checkName) {
      return this.circuitBreaker.getStats(checkName);
    }
    // Return all stats if needed
    return {};
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): any {
    return this.cache.getStats();
  }
}
