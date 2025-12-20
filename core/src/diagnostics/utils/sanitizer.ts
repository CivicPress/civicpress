/**
 * Data Sanitization Utilities
 *
 * Removes sensitive information from diagnostic results before logging or returning to clients.
 */

import {
  ComponentResult,
  DiagnosticReport,
  CheckResult,
  DiagnosticIssue,
} from '../types.js';

/**
 * Patterns for sensitive data that should be redacted
 */
const SENSITIVE_PATTERNS = [
  /password/i,
  /secret/i,
  /token/i,
  /key/i,
  /credential/i,
  /auth/i,
  /api[_-]?key/i,
  /access[_-]?token/i,
  /bearer/i,
];

/**
 * Redact sensitive data from an object
 */
export function redactSensitiveData(data: any): any {
  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data === 'string') {
    return redactString(data);
  }

  if (Array.isArray(data)) {
    return data.map(redactSensitiveData);
  }

  if (typeof data === 'object') {
    const redacted: any = {};
    for (const [key, value] of Object.entries(data)) {
      if (isSensitiveKey(key)) {
        redacted[key] = '[REDACTED]';
      } else {
        redacted[key] = redactSensitiveData(value);
      }
    }
    return redacted;
  }

  return data;
}

/**
 * Check if a key indicates sensitive data
 */
function isSensitiveKey(key: string): boolean {
  return SENSITIVE_PATTERNS.some((pattern) => pattern.test(key));
}

/**
 * Redact sensitive information from a string
 */
function redactString(str: string): string {
  // Redact common patterns like tokens, passwords, etc.
  let redacted = str;

  // Redact JWT tokens (base64-like strings with dots)
  redacted = redacted.replace(
    /[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{20,}/g,
    '[JWT_TOKEN]'
  );

  // Redact API keys (long alphanumeric strings)
  redacted = redacted.replace(/[A-Za-z0-9]{32,}/g, (match) =>
    match.length > 40 ? '[API_KEY]' : match
  );

  // Redact email addresses (optional, may want to keep for diagnostics)
  // redacted = redacted.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL]');

  return redacted;
}

/**
 * Sanitize diagnostic report for logging/API response
 */
export function sanitizeDiagnosticReport(
  report: DiagnosticReport
): DiagnosticReport {
  return {
    ...report,
    components: report.components.map(sanitizeComponentResult),
    issues: report.issues.map(sanitizeIssue),
  };
}

/**
 * Sanitize component result
 */
export function sanitizeComponentResult(
  result: ComponentResult
): ComponentResult {
  return {
    ...result,
    checks: result.checks.map(sanitizeCheckResult),
    issues: result.issues.map(sanitizeIssue),
  };
}

/**
 * Sanitize check result
 */
export function sanitizeCheckResult(result: CheckResult): CheckResult {
  return {
    ...result,
    details: result.details ? redactSensitiveData(result.details) : undefined,
    error: result.error
      ? {
          ...result.error,
          details: result.error.details
            ? redactSensitiveData(result.error.details)
            : undefined,
          stack: undefined, // Never include stack traces in sanitized output
        }
      : undefined,
  };
}

/**
 * Sanitize diagnostic issue
 */
export function sanitizeIssue(issue: DiagnosticIssue): DiagnosticIssue {
  return {
    ...issue,
    details: issue.details ? redactSensitiveData(issue.details) : undefined,
  };
}

/**
 * Sanitize parameters for audit logging
 */
export function sanitizeParams(params: any): any {
  return redactSensitiveData(params);
}
