export interface SecurityValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export class NotificationSecurity {
  private piiPatterns: RegExp[] = [
    /\b\d{3}-\d{2}-\d{4}\b/g, // SSN
    /\b\d{4}-\d{4}-\d{4}-\d{4}\b/g, // Credit card
    /\b\d{10,11}\b/g, // Phone numbers
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, // Email addresses (fixed: was `[A-Z|a-z]` with a literal pipe inside the char class — notifications-003)
  ];

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

    // Check for suspicious patterns
    const dataString = JSON.stringify(request.data);
    if (this.containsSuspiciousPatterns(dataString)) {
      warnings.push('Request contains potentially suspicious patterns');
    }

    // Check rate limits (basic validation)
    if (Array.isArray(request.channels) && request.channels.length > 10) {
      errors.push('Too many channels specified (max 10)');
    }

    // Check content length
    if (dataString.length > 10000) {
      errors.push('Request data too large (max 10KB)');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Sanitize content to remove PII
   */
  sanitizeContent(data: Record<string, any>): Record<string, any> {
    const sanitized = { ...data };

    // Recursively sanitize object
    this.sanitizeObject(sanitized);

    return sanitized;
  }

  /**
   * Recursively sanitize object
   */
  private sanitizeObject(obj: Record<string, unknown>): void {
    for (const key in obj) {
      const value = obj[key];
      if (typeof value === 'string') {
        obj[key] = this.sanitizeString(value);
      } else if (typeof value === 'object' && value !== null) {
        this.sanitizeObject(value as Record<string, unknown>);
      }
    }
  }

  /**
   * Sanitize string content
   */
  private sanitizeString(str: string): string {
    let sanitized = str;

    // Replace PII patterns
    this.piiPatterns.forEach((pattern) => {
      sanitized = sanitized.replace(pattern, '[REDACTED]');
    });

    // Remove potentially dangerous content
    sanitized = sanitized
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+\s*=/gi, '');

    return sanitized;
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

  /**
   * Validate email address
   */
  validateEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Validate phone number
   */
  validatePhone(phone: string): boolean {
    const phoneRegex = /^\+?[\d\s\-()]{10,}$/;
    return phoneRegex.test(phone);
  }

  /**
   * Encrypt sensitive data
   */
  encryptSensitiveData(data: string): string {
    // In production, use proper encryption
    // For now, just return the data as-is
    return data;
  }

  /**
   * Decrypt sensitive data
   */
  decryptSensitiveData(encryptedData: string): string {
    // In production, use proper decryption
    // For now, just return the data as-is
    return encryptedData;
  }

  /**
   * Generate secure token
   */
  generateSecureToken(): string {
    return `token_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
