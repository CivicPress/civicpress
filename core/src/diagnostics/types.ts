/**
 * Diagnostic Tools - Type Definitions
 *
 * Core types and interfaces for the diagnostic system.
 */

import { Logger } from '../utils/logger.js';

/**
 * Severity levels for diagnostic issues
 */
export type DiagnosticSeverity = 'low' | 'medium' | 'high' | 'critical';

/**
 * Status of a diagnostic check
 */
export type CheckStatus = 'pass' | 'warning' | 'error' | 'timeout' | 'skipped';

/**
 * Overall status of a diagnostic component or run
 */
export type DiagnosticStatus = 'healthy' | 'warning' | 'error';

/**
 * Error category for diagnostic errors
 */
export type DiagnosticErrorCategory =
  | 'database'
  | 'search'
  | 'config'
  | 'filesystem'
  | 'system'
  | 'unknown';

/**
 * Diagnostic error interface
 */
export interface DiagnosticError {
  category: DiagnosticErrorCategory;
  severity: DiagnosticSeverity;
  actionable: boolean;
  recoverable: boolean;
  retryable: boolean;
  message: string;
  code?: string;
  details?: any;
  stack?: string;
}

/**
 * Individual check result
 */
export interface CheckResult {
  name: string;
  status: CheckStatus;
  message?: string;
  details?: any;
  duration?: number; // milliseconds
  error?: DiagnosticError;
}

/**
 * Diagnostic issue found during checks
 */
export interface DiagnosticIssue {
  id: string;
  severity: DiagnosticSeverity;
  component: string;
  check: string;
  message: string;
  details?: any;
  autoFixable: boolean;
  fix?: {
    description: string;
    command?: string;
    requiresConfirmation: boolean;
    estimatedDuration?: number; // milliseconds
  };
  recommendations?: string[];
}

/**
 * Component diagnostic result
 */
export interface ComponentResult {
  component: string;
  status: DiagnosticStatus;
  checks: CheckResult[];
  issues: DiagnosticIssue[];
  duration: number; // milliseconds
  timestamp: string;
}

/**
 * Full diagnostic report
 */
export interface DiagnosticReport {
  runId: string;
  timestamp: string;
  overallStatus: DiagnosticStatus;
  components: ComponentResult[];
  summary: {
    totalChecks: number;
    passed: number;
    warnings: number;
    errors: number;
    skipped: number;
  };
  issues: DiagnosticIssue[];
  recommendations: string[];
  duration: number; // milliseconds
}

/**
 * Diagnostic options
 */
export interface DiagnosticOptions {
  components?: string[]; // Specific components to check, undefined = all
  timeout?: number; // Per-check timeout in milliseconds (default: 30000)
  maxConcurrency?: number; // Max parallel checks (default: 5)
  resourceLimits?: {
    maxMemory?: number; // MB
    maxCpuTime?: number; // milliseconds
  };
  cancellationToken?: AbortSignal;
  progressCallback?: (progress: DiagnosticProgress) => void;
  userId?: string; // For audit logging
  requestId?: string; // For correlation
  enableAutoFix?: boolean; // Enable auto-fix suggestions
  dryRun?: boolean; // Dry-run mode (no actual fixes)
}

/**
 * Progress information for diagnostic runs
 */
export interface DiagnosticProgress {
  component: string;
  check: string;
  completed: number;
  total: number;
  percentage: number;
  currentStatus: string;
}

/**
 * Fix result from auto-fix operations
 */
export interface FixResult {
  issueId: string;
  success: boolean;
  message: string;
  backupId?: string; // Backup created before fix
  rollbackAvailable: boolean;
  duration: number; // milliseconds
  error?: DiagnosticError;
}

/**
 * Fix options
 */
export interface FixOptions {
  force?: boolean; // Force fixes in production
  confirmDowntime?: boolean; // Confirm if downtime is required
  dryRun?: boolean; // Simulate fixes without applying
  backup?: boolean; // Create backup before fixes (default: true)
}

/**
 * Cached diagnostic result
 */
export interface CachedResult {
  result: ComponentResult | DiagnosticReport;
  timestamp: number;
  ttl: number; // Time to live in milliseconds
}

/**
 * Resource usage metrics
 */
export interface ResourceMetrics {
  memory: {
    rss: number; // Resident Set Size in bytes
    heapUsed: number; // Heap used in bytes
    heapTotal: number; // Total heap in bytes
    external: number; // External memory in bytes
  };
  cpu: {
    usage: number; // CPU usage percentage (0-100)
    time: number; // CPU time in milliseconds
  };
  duration: number; // Total duration in milliseconds
}

/**
 * Check dependency information
 */
export interface CheckDependency {
  checkName: string;
  required: boolean; // If true, this check must pass before dependent checks run
}

/**
 * Base interface for diagnostic checkers
 */
export interface DiagnosticChecker {
  name: string;
  component: string;
  dependencies?: CheckDependency[];
  critical?: boolean; // If true, stop execution if this check fails
  timeout?: number; // Override default timeout for this checker

  /**
   * Run the diagnostic check
   */
  check(options?: DiagnosticOptions): Promise<CheckResult>;

  /**
   * Attempt to auto-fix issues found by this checker
   */
  autoFix?(
    issues: DiagnosticIssue[],
    options?: FixOptions
  ): Promise<FixResult[]>;
}

/**
 * Circuit breaker state
 */
export type CircuitBreakerState = 'closed' | 'open' | 'half-open';

/**
 * Circuit breaker statistics
 */
export interface CircuitBreakerStats {
  state: CircuitBreakerState;
  failures: number;
  successes: number;
  lastFailure?: number;
  lastSuccess?: number;
  nextAttempt?: number; // When to attempt next (for half-open state)
}
