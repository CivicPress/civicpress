/**
 * Rate Limiter Middleware for Broadcast Box Device Registration
 *
 * Prevents brute force attacks on device registration endpoint
 */

import type { Request, Response, NextFunction } from 'express';
import type { Logger } from '@civicpress/core';

interface RateLimitEntry {
  count: number;
  resetTime: Date;
}

interface RateLimitConfig {
  maxAttempts: number;
  windowMs: number;
}

export class DeviceRegistrationRateLimiter {
  private ipLimits: Map<string, RateLimitEntry> = new Map();
  private codeLimits: Map<string, RateLimitEntry> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(
    private logger: Logger,
    private config: RateLimitConfig = {
      maxAttempts: 5, // 5 attempts per window
      windowMs: 15 * 60 * 1000, // 15 minutes
    }
  ) {
    // Cleanup expired entries every 5 minutes
    this.cleanupInterval = setInterval(
      () => {
        this.cleanup();
      },
      5 * 60 * 1000
    );
  }

  /**
   * Get client IP address from request
   */
  private getClientIp(req: Request): string {
    // Check X-Forwarded-For header (for proxies/load balancers)
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
      const ips = Array.isArray(forwarded)
        ? forwarded[0]
        : forwarded.split(',')[0];
      return ips.trim();
    }

    // Check X-Real-IP header
    const realIp = req.headers['x-real-ip'];
    if (realIp) {
      return Array.isArray(realIp) ? realIp[0] : realIp;
    }

    // Fallback to connection remote address
    return req.socket.remoteAddress || 'unknown';
  }

  /**
   * Check rate limit for IP address
   */
  private checkIpLimit(ip: string): {
    allowed: boolean;
    remaining: number;
    resetTime: Date;
  } {
    const now = new Date();
    let entry = this.ipLimits.get(ip);

    if (!entry || entry.resetTime <= now) {
      // Reset or create new entry
      entry = {
        count: 0,
        resetTime: new Date(now.getTime() + this.config.windowMs),
      };
      this.ipLimits.set(ip, entry);
    }

    const remaining = Math.max(0, this.config.maxAttempts - entry.count);
    const allowed = remaining > 0;

    if (allowed) {
      entry.count++;
    }

    return {
      allowed,
      remaining,
      resetTime: entry.resetTime,
    };
  }

  /**
   * Check rate limit for enrollment code (prevent brute force on specific codes)
   */
  private checkCodeLimit(enrollmentCode: string): {
    allowed: boolean;
    remaining: number;
    resetTime: Date;
  } {
    const now = new Date();
    const codeKey = `code:${enrollmentCode}`;
    let entry = this.codeLimits.get(codeKey);

    if (!entry || entry.resetTime <= now) {
      // Reset or create new entry
      // Stricter limit for per-code: 3 attempts per 15 minutes
      entry = {
        count: 0,
        resetTime: new Date(now.getTime() + this.config.windowMs),
      };
      this.codeLimits.set(codeKey, entry);
    }

    const maxCodeAttempts = 3; // Stricter limit for per-code attempts
    const remaining = Math.max(0, maxCodeAttempts - entry.count);
    const allowed = remaining > 0;

    if (allowed) {
      entry.count++;
    }

    return {
      allowed,
      remaining,
      resetTime: entry.resetTime,
    };
  }

  /**
   * Cleanup expired entries
   */
  private cleanup(): void {
    const now = new Date();
    let cleaned = 0;

    // Cleanup IP limits
    for (const [ip, entry] of this.ipLimits.entries()) {
      if (entry.resetTime <= now) {
        this.ipLimits.delete(ip);
        cleaned++;
      }
    }

    // Cleanup code limits
    for (const [code, entry] of this.codeLimits.entries()) {
      if (entry.resetTime <= now) {
        this.codeLimits.delete(code);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.logger.debug(
        `Rate limiter cleanup: removed ${cleaned} expired entries`
      );
    }
  }

  /**
   * Express middleware for rate limiting
   */
  middleware() {
    return (req: Request, res: Response, next: NextFunction): void => {
      const ip = this.getClientIp(req);
      const enrollmentCode = req.body?.enrollmentCode as string | undefined;

      // Check IP-based rate limit
      const ipLimit = this.checkIpLimit(ip);
      if (!ipLimit.allowed) {
        const retryAfter = Math.ceil(
          (ipLimit.resetTime.getTime() - Date.now()) / 1000
        );

        this.logger.warn('Device registration rate limit exceeded (IP)', {
          operation: 'broadcast-box:rate-limit:ip',
          ip,
          retryAfter,
        });

        res.status(429);
        res.setHeader('Retry-After', String(retryAfter));
        res.json({
          success: false,
          error: {
            message: 'Too many registration attempts. Please try again later.',
            code: 'RATE_LIMIT_EXCEEDED',
          },
        });
        return;
      }

      // Check code-based rate limit if enrollment code is provided
      if (enrollmentCode) {
        const codeLimit = this.checkCodeLimit(enrollmentCode);
        if (!codeLimit.allowed) {
          const retryAfter = Math.ceil(
            (codeLimit.resetTime.getTime() - Date.now()) / 1000
          );

          this.logger.warn('Device registration rate limit exceeded (code)', {
            operation: 'broadcast-box:rate-limit:code',
            ip,
            retryAfter,
          });

          res.status(429);
          res.setHeader('Retry-After', String(retryAfter));
          res.json({
            success: false,
            error: {
              message:
                'Too many attempts with this enrollment code. Please try again later.',
              code: 'RATE_LIMIT_EXCEEDED',
            },
          });
          return;
        }
      }

      // Add rate limit info to response headers (for debugging)
      res.setHeader('X-RateLimit-Limit', String(this.config.maxAttempts));
      res.setHeader('X-RateLimit-Remaining', String(ipLimit.remaining));
      res.setHeader(
        'X-RateLimit-Reset',
        String(Math.ceil(ipLimit.resetTime.getTime() / 1000))
      );

      next();
    };
  }

  /**
   * Clear rate limit for a specific IP address (useful for testing/admin)
   */
  clearIpLimit(ip: string): void {
    this.ipLimits.delete(ip);
    this.logger.debug(`Rate limit cleared for IP: ${ip}`, {
      operation: 'broadcast-box:rate-limit:clear-ip',
      ip,
    });
  }

  /**
   * Clear rate limit for a specific enrollment code (useful for testing/admin)
   */
  clearCodeLimit(enrollmentCode: string): void {
    const codeKey = `code:${enrollmentCode}`;
    this.codeLimits.delete(codeKey);
    this.logger.debug(
      `Rate limit cleared for enrollment code: ${enrollmentCode}`,
      {
        operation: 'broadcast-box:rate-limit:clear-code',
        enrollmentCode,
      }
    );
  }

  /**
   * Clear all rate limits (useful for testing/admin)
   */
  clearAll(): void {
    const ipCount = this.ipLimits.size;
    const codeCount = this.codeLimits.size;
    this.ipLimits.clear();
    this.codeLimits.clear();
    this.logger.info(
      `All rate limits cleared (${ipCount} IPs, ${codeCount} codes)`,
      {
        operation: 'broadcast-box:rate-limit:clear-all',
      }
    );
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.ipLimits.clear();
    this.codeLimits.clear();
  }
}
