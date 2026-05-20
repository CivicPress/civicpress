/**
 * Result builders used by the decomposed database-checker collaborators
 * (schema-checks, health-checks, auto-fixes). Hardcoded to name='database'
 * so per-seam functions don't need to thread the checker instance around.
 *
 * Mirrors the createXxxResult helpers in BaseDiagnosticChecker; intentional
 * duplication keeps the collaborators decoupled from the abstract base.
 */

import type { CheckResult } from '../../types.js';

const NAME = 'database';

export function pass(message?: string, details?: any): CheckResult {
  return {
    name: NAME,
    status: 'pass',
    message: message || `${NAME} check passed`,
    details,
  };
}

export function warning(message: string, details?: any): CheckResult {
  return {
    name: NAME,
    status: 'warning',
    message,
    details,
  };
}

export function error(
  message: string,
  err?: any,
  details?: any
): CheckResult {
  return {
    name: NAME,
    status: 'error',
    message,
    error: err
      ? {
          category: 'unknown',
          severity: 'medium',
          actionable: false,
          recoverable: true,
          retryable: true,
          message: err.message || message,
          code: err.code,
          details: err.details || details,
          stack: err.stack,
        }
      : undefined,
    details,
  };
}
