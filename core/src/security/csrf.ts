import * as crypto from 'crypto';
import { SecretsManager } from './secrets.js';

export interface CsrfToken {
  token: string;
  expiresAt: Date;
}

/**
 * CSRF Protection Service
 */
export class CsrfProtection {
  constructor(private secretsManager: SecretsManager) {}

  /**
   * Generate CSRF token
   */
  generateToken(): CsrfToken {
    // Generate random token
    const token = crypto.randomBytes(32).toString('hex');

    // Sign with CSRF key
    const signingKey = this.secretsManager.getCsrfSigningKey();
    const signature = this.secretsManager.sign(token, signingKey);
    const signedToken = `${token}.${signature}`;

    // Token expires in 1 hour
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1);

    return {
      token: signedToken,
      expiresAt,
    };
  }

  /**
   * Validate CSRF token
   */
  validateToken(token: string): boolean {
    if (!token || !token.includes('.')) {
      return false;
    }

    const parts = token.split('.');
    if (parts.length !== 2) {
      return false;
    }

    const [rawToken, signature] = parts;
    const signingKey = this.secretsManager.getCsrfSigningKey();

    return this.secretsManager.verify(rawToken, signature, signingKey);
  }

  /**
   * Generate token for API response (to be used in forms)
   */
  getTokenForResponse(): string {
    const csrfToken = this.generateToken();
    return csrfToken.token;
  }
}
