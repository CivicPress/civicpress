import { redactPii } from './pii-redaction.js';

export interface SecurityValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export class NotificationSecurity {
  /**
   * Validate notification request
   */
  async validateRequest(request: {
    channels?: unknown;
    template?: unknown;
    data?: unknown;
  }): Promise<SecurityValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check required fields
    if (
      !request.channels ||
      !Array.isArray(request.channels) ||
      request.channels.length === 0
    ) {
      errors.push('At least one channel must be specified');
    }

    if (!request.template) {
      errors.push('Template is required');
    }

    if (!request.data || typeof request.data !== 'object') {
      errors.push('Data object is required');
    }

    // `JSON.stringify(undefined)` is undefined, not a string: a request with
    // no data used to throw at `.length` below instead of being refused.
    const dataString = JSON.stringify(request.data) ?? '';

    // Check rate limits (basic validation)
    if (Array.isArray(request.channels) && request.channels.length > 10) {
      errors.push('Too many channels specified (max 10)');
    }

    // Check content length — BEFORE anything reads the content. The scan
    // below is quadratic in the worst case, and it used to run first, on data
    // of any size.
    if (dataString.length > 10000) {
      errors.push('Request data too large (max 10KB)');
    } else if (this.containsSuspiciousPatterns(dataString)) {
      warnings.push('Request contains potentially suspicious patterns');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * A copy of `data` with personal data redacted from every string in it.
   * Used on what is PERSISTED (audit entries, operator-inbox rows), never on
   * a message to its recipient — see `pii-redaction.ts`.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sanitizeContent(data: Record<string, any>): Record<string, any> {
    return redactPii(data);
  }

  /**
   * Check for suspicious patterns
   */
  private containsSuspiciousPatterns(content: string): boolean {
    const suspiciousPatterns = [
      /<script/i,
      /javascript:/i,
      /on\w+\s*=/i,
      /eval\s*\(/i,
      /document\./i,
      /window\./i,
      /alert\s*\(/i,
      /confirm\s*\(/i,
      /prompt\s*\(/i,
    ];

    return suspiciousPatterns.some((pattern) => pattern.test(content));
  }
}
