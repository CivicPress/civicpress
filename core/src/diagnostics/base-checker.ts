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
  DiagnosticDetails,
  DiagnosticError,
  FixResult,
  FixOptions,
  CheckStatus,
  DiagnosticSeverity,
  DiagnosticOptions,
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
  abstract check(options?: DiagnosticOptions): Promise<CheckResult>;

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
  protected createSuccessResult(
    message?: string,
    details?: DiagnosticDetails
  ): CheckResult {
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
  protected createWarningResult(
    message: string,
    details?: DiagnosticDetails
  ): CheckResult {
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
    error?: unknown,
    details?: DiagnosticDetails
  ): CheckResult {
    return {
      name: this.name,
      status: 'error',
      message,
      error: error
        ? this.buildDiagnosticError(error, message, details)
        : undefined,
      details,
    };
  }

  /**
   * Narrow an unknown error payload into a DiagnosticError shape.
   * Replaces direct `.message` / `.code` / `.details` / `.stack` access
   * on `unknown` with typed reads via `instanceof Error` + `in` checks.
   */
  private buildDiagnosticError(
    error: unknown,
    fallbackMessage: string,
    detailsFallback?: DiagnosticDetails
  ): DiagnosticError {
    const errObj = error instanceof Error ? error : null;
    const recordLike =
      typeof error === 'object' && error !== null
        ? (error as Record<string, unknown>)
        : null;
    const rawDetails = recordLike?.details ?? detailsFallback;
    const details: DiagnosticDetails | undefined =
      rawDetails && typeof rawDetails === 'object' && !Array.isArray(rawDetails)
        ? (rawDetails as DiagnosticDetails)
        : rawDetails !== undefined
          ? { value: rawDetails }
          : undefined;
    return {
      category: 'unknown',
      severity: 'medium',
      actionable: false,
      recoverable: true,
      retryable: true,
      message: errObj?.message || fallbackMessage,
      code:
        recordLike && typeof recordLike.code === 'string'
          ? recordLike.code
          : undefined,
      details,
      stack: errObj?.stack,
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
      details?: DiagnosticDetails;
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
