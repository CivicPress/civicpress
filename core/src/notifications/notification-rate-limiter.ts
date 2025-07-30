export interface RateLimitConfig {
  email_per_hour: number;
  sms_per_hour: number;
  slack_per_hour: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: Date;
}

export class NotificationRateLimiter {
  private limits: Map<string, { count: number; resetTime: Date }> = new Map();
  private config: RateLimitConfig;

  constructor(config: RateLimitConfig) {
    this.config = config;
  }

  /**
   * Check rate limit for notification request
   */
  async checkRateLimit(request: any): Promise<RateLimitResult> {
    const now = new Date();
    const results: RateLimitResult[] = [];

    // Check each channel
    for (const channel of request.channels) {
      const result = await this.checkChannelRateLimit(channel, now);
      results.push(result);

      if (!result.allowed) {
        return result;
      }
    }

    // If all channels pass, return the most restrictive result
    const mostRestrictive = results.reduce((prev, current) =>
      current.remaining < prev.remaining ? current : prev
    );

    return mostRestrictive;
  }

  /**
   * Check rate limit for specific channel
   */
  private async checkChannelRateLimit(
    channel: string,
    now: Date
  ): Promise<RateLimitResult> {
    const key = `rate_limit_${channel}`;
    const limit = this.getChannelLimit(channel);

    let rateLimit = this.limits.get(key);

    if (!rateLimit || rateLimit.resetTime <= now) {
      // Reset rate limit
      rateLimit = {
        count: 0,
        resetTime: new Date(now.getTime() + 60 * 60 * 1000), // 1 hour
      };
      this.limits.set(key, rateLimit);
    }

    const remaining = Math.max(0, limit - rateLimit.count);
    const allowed = remaining > 0;

    if (allowed) {
      rateLimit.count++;
    }

    return {
      allowed,
      remaining,
      resetTime: rateLimit.resetTime,
    };
  }

  /**
   * Get rate limit for channel
   */
  private getChannelLimit(channel: string): number {
    switch (channel) {
      case 'email':
        return this.config.email_per_hour;
      case 'sms':
        return this.config.sms_per_hour;
      case 'slack':
        return this.config.slack_per_hour;
      default:
        return 100; // Default limit
    }
  }

  /**
   * Get current rate limit status
   */
  getRateLimitStatus(): Record<
    string,
    { count: number; limit: number; resetTime: Date }
  > {
    const now = new Date();
    const status: Record<string, any> = {};

    for (const [key, rateLimit] of this.limits.entries()) {
      const channel = key.replace('rate_limit_', '');
      const limit = this.getChannelLimit(channel);

      if (rateLimit.resetTime <= now) {
        // Reset expired limits
        rateLimit.count = 0;
        rateLimit.resetTime = new Date(now.getTime() + 60 * 60 * 1000);
      }

      status[channel] = {
        count: rateLimit.count,
        limit,
        resetTime: rateLimit.resetTime,
      };
    }

    return status;
  }

  /**
   * Reset rate limits
   */
  resetRateLimits(): void {
    this.limits.clear();
  }

  /**
   * Update rate limit configuration
   */
  updateConfig(config: Partial<RateLimitConfig>): void {
    this.config = { ...this.config, ...config };
  }
}
