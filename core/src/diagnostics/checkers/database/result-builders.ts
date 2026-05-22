/**
 * Result builders used by the decomposed database-checker collaborators
 * (schema-checks, health-checks, auto-fixes). Hardcoded to name='database'
 * so per-seam functions don't need to thread the checker instance around.
 *
 * Mirrors the createXxxResult helpers in BaseDiagnosticChecker; intentional
 * duplication keeps the collaborators decoupled from the abstract base.
 */

import type { CheckResult, DiagnosticDetails } from '../../types.js';

const NAME = 'database';

export function pass(
  message?: string,
  details?: DiagnosticDetails
): CheckResult {
  return {
    name: NAME,
    status: 'pass',
    message: message || `${NAME} check passed`,
    details,
  };
}

export function warning(
  message: string,
  details?: DiagnosticDetails
): CheckResult {
  return {
    name: NAME,
    status: 'warning',
    message,
    details,
  };
}

export function error(
  message: string,
  err?: unknown,
  details?: DiagnosticDetails
): CheckResult {
  if (!err) {
    return { name: NAME, status: 'error', message, details };
  }
  const errObj = err instanceof Error ? err : null;
  const recordLike =
    typeof err === 'object' && err !== null
      ? (err as Record<string, unknown>)
      : null;
  const errDetails = recordLike?.details;
  const errorDetails: DiagnosticDetails | undefined =
    errDetails && typeof errDetails === 'object' && !Array.isArray(errDetails)
      ? (errDetails as DiagnosticDetails)
      : details;
  return {
    name: NAME,
    status: 'error',
    message,
    error: {
      category: 'unknown',
      severity: 'medium',
      actionable: false,
      recoverable: true,
      retryable: true,
      message: errObj?.message || message,
      code:
        recordLike && typeof recordLike.code === 'string'
          ? recordLike.code
          : undefined,
      details: errorDetails,
      stack: errObj?.stack,
    },
    details,
  };
}
