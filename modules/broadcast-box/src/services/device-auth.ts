/**
 * Device Authentication Service
 *
 * Handles JWT token generation and validation for Broadcast Box devices
 */

import type { Logger, SecretsManager } from '@civicpress/core';
import { coreInfo, coreWarn, coreError } from '@civicpress/core';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';

export interface DeviceTokenPayload {
  deviceId: string;
  deviceUuid: string;
  organizationId: string;
  type: 'device';
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
    private secretsManager?: SecretsManager
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
   * Refresh device token
   */
  async refreshToken(oldToken: string): Promise<DeviceTokenResult | null> {
    const payload = await this.validateToken(oldToken);
    if (!payload) {
      return null;
    }

    // Generate new token with same device info
    return this.generateToken({
      deviceId: payload.deviceId,
      deviceUuid: payload.deviceUuid,
      organizationId: payload.organizationId,
    });
  }

  /**
   * Get secret for token signing
   * Uses SecretsManager's deriveKey to get a scoped key for device tokens
   */
  private async getSecret(): Promise<string> {
    if (this.secretsManager) {
      // Use deriveKey to get a scoped key for device tokens
      // This ensures each scope has its own derived key from the root secret
      const keyBuffer = this.secretsManager.deriveKey(
        'broadcast-box',
        'device-token'
      );
      return keyBuffer.toString('hex');
    }

    // Fallback: use default secret (not secure for production)
    return 'default-device-token-secret-change-in-production';
  }

  /**
   * Sign token payload with secret
   */
  private async signToken(payload: string, secret: string): Promise<string> {
    // Simple HMAC-like signature using bcrypt
    // In production, use proper HMAC-SHA256 or similar
    const hash = await bcrypt.hash(payload + secret, 10);
    return Buffer.from(hash).toString('base64url').substring(0, 32);
  }

  /**
   * Verify token signature
   */
  private async verifyToken(
    payload: string,
    signature: string,
    secret: string
  ): Promise<boolean> {
    const expectedSignature = await this.signToken(payload, secret);
    return signature === expectedSignature;
  }
}
