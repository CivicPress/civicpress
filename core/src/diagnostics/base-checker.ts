/**
 * Base Diagnostic Checker
 *
 * Abstract base class for all diagnostic checkers. Provides common functionality
 * and enforces the DiagnosticChecker interface.
 */

import {
  DiagnosticChecker,
  CheckResult,
  DiagnosticIssue,
  FixResult,
  FixOptions,
  CheckStatus,
  DiagnosticSeverity,
} from './types.js';
import { Logger } from '../utils/logger.js';

export abstract class BaseDiagnosticChecker implements DiagnosticChecker {
  abstract name: string;
  abstract component: string;
  dependencies?: { checkName: string; required: boolean }[];
  critical?: boolean;
  timeout?: number;

  protected logger: Logger;

  constructor(logger?: Logger) {
    this.logger = logger || new Logger();
  }

  /**
   * Run the diagnostic check (must be implemented by subclasses)
   */
  abstract check(options?: any): Promise<CheckResult>;

  /**
   * Attempt to auto-fix issues (optional, can be overridden)
   */
  async autoFix(
    issues: DiagnosticIssue[],
    options?: FixOptions
  ): Promise<FixResult[]> {
    // Default implementation: no auto-fix
    this.logger.warn(
      `Auto-fix not implemented for ${this.component}:${this.name}`
    );
    return [];
  }

  /**
   * Create a successful check result
   */
  protected createSuccessResult(message?: string, details?: any): CheckResult {
    return {
      name: this.name,
      status: 'pass',
      message: message || `${this.name} check passed`,
      details,
    };
  }

  /**
   * Create a warning check result
   */
  protected createWarningResult(message: string, details?: any): CheckResult {
    return {
      name: this.name,
      status: 'warning',
      message,
      details,
    };
  }

  /**
   * Create an error check result
   */
  protected createErrorResult(
    message: string,
    error?: any,
    details?: any
  ): CheckResult {
    return {
      name: this.name,
      status: 'error',
      message,
      error: error
        ? {
            category: 'unknown',
            severity: 'medium',
            actionable: false,
            recoverable: true,
            retryable: true,
            message: error.message || message,
            code: error.code,
            details: error.details || details,
            stack: error.stack,
          }
        : undefined,
      details,
    };
  }

  /**
   * Create a diagnostic issue
   */
  protected createIssue(
    severity: DiagnosticSeverity,
    message: string,
    options?: {
      autoFixable?: boolean;
      fix?: {
        description: string;
        command?: string;
        requiresConfirmation?: boolean;
        estimatedDuration?: number;
      };
      recommendations?: string[];
      details?: any;
    }
  ): DiagnosticIssue {
    return {
      id: `${this.component}:${this.name}:${Date.now()}`,
      severity,
      component: this.component,
      check: this.name,
      message,
      autoFixable: options?.autoFixable || false,
      fix: options?.fix
        ? {
            ...options.fix,
            requiresConfirmation: options.fix.requiresConfirmation ?? true,
          }
        : undefined,
      recommendations: options?.recommendations,
      details: options?.details,
    };
  }

  /**
   * Create a fix result
   */
  protected createFixResult(
    issueId: string,
    success: boolean,
    message: string,
    options?: {
      backupId?: string;
      rollbackAvailable?: boolean;
      duration?: number;
      error?: any;
    }
  ): FixResult {
    return {
      issueId,
      success,
      message,
      backupId: options?.backupId,
      rollbackAvailable: options?.rollbackAvailable || false,
      duration: options?.duration || 0,
      error: options?.error,
    };
  }
}
