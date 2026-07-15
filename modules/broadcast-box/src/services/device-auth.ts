/**
 * Device Authentication Service
 *
 * Handles JWT token generation and validation for Broadcast Box devices
 */

import type { Logger, SecretsManager } from '@civicpress/core';
import { coreInfo, coreWarn, coreError } from '@civicpress/core';
import { v4 as uuidv4 } from 'uuid';
import type { DeviceTokenDenylist } from './device-token-denylist.js';

export interface DeviceTokenPayload {
  deviceId: string;
  deviceUuid: string;
  organizationId: string;
  type: 'device';
  /**
   * Unique token id (JWT `jti` claim). Makes every minted token distinct even
   * when `iat`/`exp` collide at one-second granularity, so a refresh always
   * rotates the token rather than returning a byte-identical one.
   */
  jti: string;
  iat: number;
  exp: number;
}

export interface DeviceTokenResult {
  token: string;
  expiresAt: Date;
}

export class DeviceAuthService {
  private readonly TOKEN_EXPIRY_HOURS = 24 * 7; // 7 days
  private readonly TOKEN_SECRET_KEY = 'broadcast-box-device-token-secret';

  constructor(
    private logger: Logger,
    private secretsManager?: SecretsManager,
    // Optional token-level revocation (FA-BB-006); when absent, validation
    // falls back to signature+expiry+device-status checks only.
    private denylist?: DeviceTokenDenylist
  ) {}

  /**
   * Generate JWT token for device
   *
   * Note: This is a simplified implementation. In production, use a proper JWT library
   * like 'jsonwebtoken' or 'jose'. For now, we'll use a simple token format.
   */
  async generateToken(data: {
    deviceId: string;
    deviceUuid: string;
    organizationId: string;
  }): Promise<DeviceTokenResult> {
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = new Date(
      (now + this.TOKEN_EXPIRY_HOURS * 60 * 60) * 1000
    );

    // Create token payload
    const payload: DeviceTokenPayload = {
      deviceId: data.deviceId,
      deviceUuid: data.deviceUuid,
      organizationId: data.organizationId,
      type: 'device',
      jti: uuidv4(),
      iat: now,
      exp: now + this.TOKEN_EXPIRY_HOURS * 60 * 60,
    };

    // Get secret from secrets manager or use default
    const secret = await this.getSecret();

    // For now, create a simple token (base64 encoded payload + signature)
    // In production, use proper JWT signing
    const tokenPayload = Buffer.from(JSON.stringify(payload)).toString(
      'base64url'
    );
    const signature = await this.signToken(tokenPayload, secret);
    const token = `${tokenPayload}.${signature}`;

    coreInfo('Device token generated', {
      operation: 'broadcast-box:device-auth:token-generated',
      deviceId: data.deviceId,
      expiresAt: expiresAt.toISOString(),
    });

    return {
      token,
      expiresAt,
    };
  }

  /**
   * Validate device token
   */
  async validateToken(token: string): Promise<DeviceTokenPayload | null> {
    try {
      const parts = token.split('.');
      if (parts.length !== 2) {
        return null;
      }

      const [tokenPayload, signature] = parts;

      // Get secret
      const secret = await this.getSecret();

      // Verify signature
      const isValid = await this.verifyToken(tokenPayload, signature, secret);
      if (!isValid) {
        coreWarn('Invalid device token signature', {
          operation: 'broadcast-box:device-auth:invalid-signature',
        });
        return null;
      }

      // Decode payload
      const payloadJson = Buffer.from(tokenPayload, 'base64url').toString(
        'utf-8'
      );
      const payload: DeviceTokenPayload = JSON.parse(payloadJson);

      // Check expiration
      const now = Math.floor(Date.now() / 1000);
      if (payload.exp < now) {
        coreWarn('Device token expired', {
          operation: 'broadcast-box:device-auth:token-expired',
          deviceId: payload.deviceId,
        });
        return null;
      }

      // Validate token type
      if (payload.type !== 'device') {
        coreWarn('Invalid device token type', {
          operation: 'broadcast-box:device-auth:invalid-type',
        });
        return null;
      }

      // FA-BB-006: reject revoked tokens (refresh rotates the old jti onto
      // the denylist; explicit revocation kills a leaked token immediately).
      if (this.denylist && payload.jti) {
        if (await this.denylist.isRevoked(payload.jti)) {
          coreWarn('Device token revoked', {
            operation: 'broadcast-box:device-auth:token-revoked',
            deviceId: payload.deviceId,
          });
          return null;
        }
      }

      return payload;
    } catch (error) {
      coreError(
        'Error validating device token',
        'broadcast-box:device-auth:validation-error',
        error instanceof Error ? error.message : String(error),
        {
          operation: 'broadcast-box:device-auth:validation-error',
          error: error instanceof Error ? error.message : String(error),
        }
      );
      return null;
    }
  }

  /**
   * Refresh device token.
   *
   * FA-BB-006: refresh is a true rotation — the old token's jti is revoked
   * once the replacement is minted, instead of both staying valid until exp.
   */
  async refreshToken(oldToken: string): Promise<DeviceTokenResult | null> {
    const payload = await this.validateToken(oldToken);
    if (!payload) {
      return null;
    }

    // Generate new token with same device info
    const result = await this.generateToken({
      deviceId: payload.deviceId,
      deviceUuid: payload.deviceUuid,
      organizationId: payload.organizationId,
    });

    if (this.denylist && payload.jti) {
      try {
        await this.denylist.revoke(
          payload.jti,
          payload.deviceId,
          new Date(payload.exp * 1000),
          'rotated'
        );
      } catch (error) {
        // The new token is already minted; a failed revocation must not
        // break the refresh, but it has to be visible.
        coreWarn('Failed to revoke rotated device token', {
          operation: 'broadcast-box:device-auth:rotate-revoke-failed',
          deviceId: payload.deviceId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return result;
  }

  /**
   * Revoke a specific token (FA-BB-006). Verifies the signature so only
   * genuinely-issued tokens land on the denylist, but deliberately ignores
   * expiry/denylist state — revoking twice or revoking an expired token is
   * harmless, and an admin must be able to kill a leaked token regardless.
   */
  async revokeToken(
    token: string,
    reason: string = 'revoked'
  ): Promise<boolean> {
    if (!this.denylist) {
      return false;
    }

    const parts = token.split('.');
    if (parts.length !== 2) {
      return false;
    }
    const [tokenPayload, signature] = parts;
    const secret = await this.getSecret();
    if (!(await this.verifyToken(tokenPayload, signature, secret))) {
      return false;
    }

    try {
      const payload: DeviceTokenPayload = JSON.parse(
        Buffer.from(tokenPayload, 'base64url').toString('utf-8')
      );
      if (!payload.jti) {
        return false;
      }
      await this.denylist.revoke(
        payload.jti,
        payload.deviceId,
        new Date(payload.exp * 1000),
        reason
      );
      coreInfo('Device token revoked', {
        operation: 'broadcast-box:device-auth:token-revoked-explicit',
        deviceId: payload.deviceId,
        reason,
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get secret for token signing
   * Uses SecretsManager's deriveKey to get a scoped key for device tokens
   */
  private async getSecret(): Promise<string> {
    // FA-BB-011: fail closed. Signing device tokens with a hardcoded default
    // secret would let anyone who read the source forge device tokens. Production
    // always injects a SecretsManager (the DI container throws if it is not
    // registered), so refusing here removes a latent hardcoded credential
    // without affecting any real path.
    if (!this.secretsManager) {
      throw new Error(
        'DeviceAuthService requires a SecretsManager; refusing to sign device tokens with a default secret'
      );
    }
    // Use deriveKey to get a scoped key for device tokens so each scope has its
    // own derived key from the root secret.
    const keyBuffer = this.secretsManager.deriveKey(
      'broadcast-box',
      'device-token'
    );
    return keyBuffer.toString('hex');
  }

  /**
   * Sign token payload with secret using HMAC-SHA256
   */
  private async signToken(payload: string, secret: string): Promise<string> {
    // Use Node.js crypto for HMAC-SHA256 (deterministic, unlike bcrypt)
    const crypto = await import('crypto');
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(payload);
    return hmac.digest('base64url');
  }

  /**
   * Verify token signature in constant time (FA-BB-005) — `===` short-
   * circuits on the first differing byte, a timing side-channel on the
   * bearer credential.
   */
  private async verifyToken(
    payload: string,
    signature: string,
    secret: string
  ): Promise<boolean> {
    const crypto = await import('crypto');
    const expectedSignature = await this.signToken(payload, secret);
    const provided = Buffer.from(signature);
    const expected = Buffer.from(expectedSignature);
    if (provided.length !== expected.length) {
      return false;
    }
    return crypto.timingSafeEqual(provided, expected);
  }
}
