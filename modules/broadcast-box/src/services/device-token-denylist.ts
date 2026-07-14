/**
 * Device Token Denylist (FA-BB-006)
 *
 * Token-level revocation for device bearer tokens. Device-STATUS checks
 * (revoked/suspended) already cut off a whole device, but until now a single
 * leaked token could not be killed: refresh minted a new token while the old
 * one stayed valid for up to 7 days. Revoked `jti`s are persisted here and
 * checked on every validation; rows expire with the token itself so the
 * table stays small.
 */

import type { DatabaseService, Logger } from '@civicpress/core';

export class DeviceTokenDenylist {
  constructor(
    private db: DatabaseService,
    private logger: Logger
  ) {}

  /**
   * Check whether a token id has been revoked.
   *
   * Fails CLOSED: if the check itself errors, the token is treated as
   * revoked — an unreadable denylist must not silently re-admit tokens.
   */
  async isRevoked(jti: string): Promise<boolean> {
    try {
      const rows = await this.db
        .getAdapter()
        .query('SELECT jti FROM broadcast_revoked_device_tokens WHERE jti = ?', [
          jti,
        ]);
      return rows.length > 0;
    } catch (error) {
      this.logger.error('Device-token denylist check failed — failing closed', {
        operation: 'broadcast-box:device-auth:denylist-error',
        error: error instanceof Error ? error.message : String(error),
      });
      return true;
    }
  }

  /**
   * Revoke a token id. `expiresAt` is the token's own expiry — after that
   * the row is garbage and eligible for cleanup.
   */
  async revoke(
    jti: string,
    deviceId: string,
    expiresAt: Date,
    reason: string
  ): Promise<void> {
    await this.db.getAdapter().execute(
      `INSERT OR IGNORE INTO broadcast_revoked_device_tokens
         (jti, device_id, revoked_at, expires_at, reason)
       VALUES (?, ?, ?, ?, ?)`,
      [jti, deviceId, new Date().toISOString(), expiresAt.toISOString(), reason]
    );
  }

  /**
   * Drop rows whose token has expired anyway. Returns the count removed.
   */
  async cleanupExpired(): Promise<number> {
    const result = await this.db
      .getAdapter()
      .execute('DELETE FROM broadcast_revoked_device_tokens WHERE expires_at < ?', [
        new Date().toISOString(),
      ]);
    return (result as { changes?: number } | undefined)?.changes ?? 0;
  }
}
