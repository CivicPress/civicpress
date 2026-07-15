import * as crypto from 'crypto';
import { SecretsManager } from './secrets.js';

export interface CsrfToken {
  token: string;
  expiresAt: Date;
}

/**
 * CSRF Protection Service
 *
 * FA-API-019 (accepted residual): these tokens are HMAC-signed but intentionally
 * stateless / NOT session-bound. Session-binding only mitigates cross-site abuse
 * of a cookie-identified victim session — and this API has no cookie-based auth
 * path (every authenticated request carries an `Authorization: Bearer` header,
 * which a cross-site attacker cannot forge). CSRF here is pure defense-in-depth
 * over a surface that is already CSRF-immune, so an unbound token carries no
 * residual risk. If a cookie-auth path is ever introduced, revisit this and bind
 * the token to the session id.
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
