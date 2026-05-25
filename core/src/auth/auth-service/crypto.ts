import * as crypto from 'crypto';

/**
 * Generate a cryptographically random 32-byte token, hex-encoded.
 *
 * Extracted verbatim from `AuthService.generateSecureToken` (private) so the
 * collaborators in this folder can share one implementation instead of each
 * carrying a copy.
 */
export function generateSecureToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * SHA-256 hash of an opaque token, hex-encoded — used for at-rest storage of
 * API keys and session tokens. Extracted verbatim from `AuthService.hashToken`
 * (private).
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
