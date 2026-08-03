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
 * SHA-256 hash of an opaque, HIGH-ENTROPY token, hex-encoded — used for at-rest
 * storage of API keys, session tokens, and password-reset tokens (all 32-byte
 * `generateSecureToken` values). SHA-256 is appropriate here precisely because
 * these are random tokens, not passwords: user passwords are verified with
 * bcrypt (see `password-ops` `bcrypt.compare`) and never pass through this
 * function. A static-analysis "insufficient password hash" flag on this line is
 * a false positive for that reason. Extracted verbatim from
 * `AuthService.hashToken`.
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
